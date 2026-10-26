// La version locale de l'open space : le pont entre le bureau et Claude Code (avec ton compte Claude). Il sert le bureau (dossier dist/) et ouvre une connexion
// WebSocket sur /ws. Il n'écoute que sur ton ordinateur (127.0.0.1), et refuse toute page qui ne vient
// pas du bureau lui-même : un site web ne peut pas lancer ton équipe à ta place.
//
//   node server/index.ts            le bureau sur http://localhost:4848
//   node server/index.ts --open     … et l'ouvre dans le navigateur
//   node server/index.ts --dev      seulement le pont (le bureau est servi par Vite, port 5174)
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol.ts';
import { readPage, searchWeb, WebError } from '../shared/web.ts';
import { Bureau } from './bureau.ts';
import { findClaude } from './claude.ts';
import { wacc43Html } from './wacc43.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const DEV = args.has('--dev');
const PORT = Number(process.env.PORT ?? 4848);
const HOST = '127.0.0.1';
const DEV_PORT = 5174;

/** L'IA gratuite sur ton ordinateur (Ollama) : le bureau lui parle par ce serveur. */
const OLLAMA = new URL(process.env.OLLAMA_HOST ? (/^https?:/.test(process.env.OLLAMA_HOST) ? process.env.OLLAMA_HOST : `http://${process.env.OLLAMA_HOST}`) : 'http://127.0.0.1:11434');

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "media-src 'self' blob: data:", "worker-src 'self' blob:",
  `connect-src 'self' ws://localhost:${PORT} ws://127.0.0.1:${PORT} https://api.anthropic.com`,
  // le jukebox : des vidéos YouTube (sans cookie publicitaire)
  "frame-src 'self' blob: https://www.youtube-nocookie.com",
  "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
].join('; ');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

// L'aperçu des sites faits par l'équipe : servis à part, dans un bac à sable (origine opaque) :
// leurs scripts tournent, mais ils ne peuvent ni lire le bureau, ni se connecter au pont.
const PREVIEW_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'";

const claude = await findClaude();
// la version du bureau compilé : un onglet resté ouvert se recharge quand elle change
const BUILD = (() => { try { return String(Math.round(statSync(path.join(DIST, 'index.html')).mtimeMs)); } catch { return 'dev'; } })();
const clients = new Set<WebSocket>();

function broadcast(m: ServerMsg) {
  const s = JSON.stringify(m);
  for (const c of clients) if (c.readyState === c.OPEN) c.send(s);
}

const bureau = new Bureau(claude, broadcast, process.env.BUREAU_DIR);
await bureau.init();

// ── Le serveur web (le bureau compilé) ──
const server = http.createServer(async (req, res) => {
  const url0 = new URL(req.url ?? '/', 'http://x');
  if (url0.pathname.startsWith('/apercu/')) { await preview(url0, res); return; }
  if (url0.pathname.startsWith('/api/')) { await localApi(req, url0, res); return; }
  if (DEV) { res.writeHead(404).end(`Mode développement : le bureau est sur http://localhost:${DEV_PORT}`); return; }
  try {
    const url = url0;
    let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || file === DIST || file.endsWith(path.sep)) file = path.join(DIST, 'index.html');
    const body = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // aucun script venu d'ailleurs : même un lien piégé dans un rapport ne peut rien exécuter
      ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}),
    });
    res.end(body);
  } catch {
    res.writeHead(500).end('Le bureau n’est pas compilé : lance « npm start ».');
  }
});

/** /apercu/<mission>/<chemin> : un fichier de la mission, dans le bac à sable. */
async function preview(url: URL, res: http.ServerResponse) {
  try {
    const parts = url.pathname.split('/').slice(2).map((p) => decodeURIComponent(p));
    const missionId = parts.shift() ?? '';
    let rel = parts.join('/');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const file = bureau.previewPath(missionId, rel);
    if (!file) { res.writeHead(404, { 'Content-Security-Policy': PREVIEW_CSP }).end('Introuvable dans le dossier de la mission.'); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Security-Policy': PREVIEW_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Security-Policy': PREVIEW_CSP }).end();
  }
}

// ── L'API locale : la recherche web, la lecture des pages, et l'IA gratuite d'Ollama ──
// Mêmes adresses que le Worker Cloudflare (/api/search, /api/fetch, /api/ping) : le bureau ne voit pas la différence.
// Seul le bureau lui-même peut s'en servir : bonne adresse (pas de « DNS rebinding »), bonne origine, et l'en-tête
// x-code (qu'une autre page ne peut pas envoyer sans y être autorisée).
const sendJson = (res: http.ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
};

function readBody(req: http.IncomingMessage, max = 400_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > max) { reject(new WebError(413, 'Demande trop longue.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** La base 43 WACC de Hares : la page WACC43 de cet ordinateur si elle est là (WACC43_HTML, sinon le dépôt 43
 *  rangé à côté de l'open space), sinon le site publié (WACC43_URL). */
async function wacc43Page(res: http.ServerResponse) {
  const html = await wacc43Html();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(html);
}

/** Relaie une demande à Ollama (sans limite de temps : un gros modèle peut réfléchir longtemps). */
function ollama(method: 'GET' | 'POST', p: string, body: string | null, res: http.ServerResponse) {
  const r = http.request({ hostname: OLLAMA.hostname, port: OLLAMA.port || 11434, path: p, method, headers: { 'Content-Type': 'application/json' } }, (up) => {
    res.writeHead(up.statusCode ?? 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    up.pipe(res);
  });
  r.on('error', () => { if (!res.headersSent) sendJson(res, 503, { error: 'Ollama ne répond pas. Ouvre l’application Ollama sur ton ordinateur, puis réessaie.' }); });
  // l'onglet fermé ou la mission arrêtée : on arrête aussi Ollama
  res.on('close', () => { if (!res.writableFinished) r.destroy(); });
  if (body) r.write(body);
  r.end();
}

async function localApi(req: http.IncomingMessage, url: URL, res: http.ServerResponse) {
  const host = (req.headers.host ?? '').toLowerCase();
  const okHost = [`localhost:${PORT}`, `127.0.0.1:${PORT}`, ...(DEV ? [`localhost:${DEV_PORT}`, `127.0.0.1:${DEV_PORT}`] : [])].includes(host);
  const origin = req.headers.origin;
  if (!okHost || (origin && !allowedOrigins.has(origin)) || req.headers['x-code'] === undefined) { sendJson(res, 403, { error: 'Refusé.' }); return; }
  try {
    if (url.pathname === '/api/ping') { sendJson(res, 200, { ok: true, models: [], search: process.env.TAVILY_KEY ? 'tavily' : 'duckduckgo' }); return; }
    if (url.pathname === '/api/ollama/tags') { ollama('GET', '/api/tags', null, res); return; }
    if (url.pathname === '/api/wacc43') { await wacc43Page(res); return; }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Méthode non autorisée.' }); return; }
    const raw = await readBody(req);
    if (url.pathname === '/api/ollama/chat') { ollama('POST', '/api/chat', raw, res); return; }
    if (url.pathname === '/api/ollama/pull') {
      // installer un modèle : seulement un nom de modèle simple (pas d'adresse)
      const model = String((JSON.parse(raw || '{}') as { model?: unknown }).model ?? '');
      if (!/^[a-z0-9][\w.\-]*(:[\w.\-]+)?$/i.test(model)) { sendJson(res, 400, { error: 'Nom de modèle invalide.' }); return; }
      ollama('POST', '/api/pull', JSON.stringify({ model, stream: true }), res);
      return;
    }
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    if (url.pathname === '/api/search') { sendJson(res, 200, await searchWeb(String(body.q ?? ''), process.env.TAVILY_KEY)); return; }
    if (url.pathname === '/api/fetch') { sendJson(res, 200, await readPage(String(body.url ?? ''))); return; }
    sendJson(res, 404, { error: 'Inconnu.' });
  } catch (e) {
    if (e instanceof WebError) sendJson(res, e.status, { error: e.message });
    else sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

// ── La connexion avec le bureau ──
// Seul le bureau lui-même peut se connecter (et, en développement, la page servie par Vite).
const allowedOrigins = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, ...(DEV ? [`http://localhost:${DEV_PORT}`, `http://127.0.0.1:${DEV_PORT}`] : [])]);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin ?? '';
  if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws' || !allowedOrigins.has(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  const send = (m: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  send({ ...bureau.hello(), build: BUILD } as ServerMsg);
  ws.on('message', async (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(data)); } catch { return; }
    try {
      await handle(m, send);
    } catch (e) {
      send({ t: 'toast', kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  });
});

const str = (v: unknown, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');

async function handle(m: ClientMsg, send: (m: ServerMsg) => void) {
  switch (m.t) {
    case 'start':
      await bureau.start(str(m.prompt), m.team);
      break;
    case 'say':
      bureau.say(str(m.text), m.team);
      break;
    case 'stop':
      bureau.stop();
      break;
    case 'answer':
      bureau.answer(str(m.requestId, 100), m.allow === true);
      break;
    case 'new':
      bureau.close();
      break;
    case 'open':
      bureau.open(str(m.missionId, 40), m.file ? str(m.file, 1000) : undefined);
      break;
    case 'open_root':
      bureau.openRoot();
      break;
    case 'read': {
      const file = str(m.file, 1000);
      const version = m.version ? str(m.version, 120) : undefined;
      const { text, truncated } = await bureau.readText(str(m.missionId, 40), file, version);
      send({ t: 'file_text', missionId: m.missionId, file, text, truncated, version });
      break;
    }
    case 'versions': {
      const file = str(m.file, 1000);
      send({ t: 'versions', missionId: m.missionId, file, list: await bureau.versions(str(m.missionId, 40), file) });
      break;
    }
    case 'team_history':
      send({ t: 'team_history', entries: await bureau.teamHistory() });
      break;
    case 'replay': {
      const { mission, log } = await bureau.replay(str(m.missionId, 40));
      send({ t: 'replay', mission, log });
      break;
    }
    case 'settings':
      bureau.setSettings(m.settings ?? {});
      break;
  }
}

function listen(port: number) {
  server.once('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`  Le port ${port} est déjà pris : le bureau tourne peut-être déjà (http://localhost:${port}).`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(port, HOST, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  🏢  L’open space (Claude Code, avec ton compte Claude)');
    console.log(`  ➜  ${DEV ? `Pont prêt (le bureau : http://localhost:${DEV_PORT})` : url}`);
    console.log(`  📁  Les missions : ${bureau.missionsDir}`);
    console.log(claude ? `  ✓  Claude Code ${claude.version} (${claude.path})` : '  ✗  Claude Code introuvable : le bureau tournera en démo.');
    console.log('  ⏹  Pour arrêter : Ctrl + C');
    console.log('');
    if (args.has('--open') && !DEV) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
      execFile(opener, [url], () => {});
    }
  });
}

listen(PORT);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    bureau.shutdown();
    setTimeout(() => process.exit(0), 300);
  });
}
