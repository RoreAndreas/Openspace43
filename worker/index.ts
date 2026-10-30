// Le Worker Cloudflare de l'open space. Il ne stocke rien : il sert le bureau (fichiers statiques) et fait
// trois choses pour le navigateur, toutes protégées par le code d'accès :
//   POST /api/chat    une réponse de l'IA (Workers AI, gratuit dans la limite du quota quotidien)
//   POST /api/search  une recherche sur internet (Tavily si une clé est configurée, sinon DuckDuckGo)
//   POST /api/fetch   le texte d'une page web (nettoyé et raccourci)
//   POST /api/tavily, /api/tavily/extract  la recherche et la lecture de pages de Rook (Tavily, avec le secret TAVILY_KEY ou CLE_TAVILY)
//   GET  /api/ping    vérifie le code d'accès
//   GET  /api/wacc43  la base 43 WACC de Hares (la page publiée de WACC43, relayée telle quelle : le navigateur l'extrait)
// Les missions, les rapports, le tiroir et les skills restent dans le navigateur de l'utilisatrice.
import { readPage, searchWeb, tavilyExtract, tavilySearch, WebError } from '../shared/web.ts';

interface Env {
  AI: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  /** le code d'accès (secret Cloudflare : npx wrangler secret put ACCESS_CODE) */
  ACCESS_CODE?: string;
  /** facultatif : une clé Tavily (la recherche de Rook, et une recherche web plus fiable pour tous), sous l'un ou l'autre nom */
  TAVILY_KEY?: string;
  CLE_TAVILY?: string;
  /** l'adresse du site WACC43, dont la page embarque la base de Hares (variable du Worker) */
  WACC43_URL?: string;
}

/** Les modèles autorisés (le premier est celui par défaut). */
const MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];
const MAX_BODY = 200_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

const fail = (status: number, message: string) => json({ error: message }, status);

/** La clé Tavily : le secret TAVILY_KEY, ou CLE_TAVILY. */
const tavilyKey = (env: Env) => env.TAVILY_KEY || env.CLE_TAVILY || undefined;

/** Comparaison à temps constant (le code d'accès ne se devine pas caractère par caractère). */
function same(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (!env.ACCESS_CODE) return fail(503, 'Le code d’accès n’est pas encore configuré sur Cloudflare (secret ACCESS_CODE).');
    if (!same(req.headers.get('x-code') ?? '', env.ACCESS_CODE)) return fail(401, 'Code d’accès incorrect.');
    // une page d'un autre site ne peut pas appeler l'API à la place du bureau
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'Origine refusée.');

    try {
      if (url.pathname === '/api/ping') return json({ ok: true, models: MODELS, search: tavilyKey(env) ? 'tavily' : 'duckduckgo' });
      if (url.pathname === '/api/wacc43') return await wacc43(env);
      if (req.method !== 'POST') return fail(405, 'Méthode non autorisée.');
      const raw = await req.text();
      if (raw.length > MAX_BODY) return fail(413, 'Demande trop longue.');
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      switch (url.pathname) {
        case '/api/chat': return await chat(env, body);
        case '/api/search': return json(await searchWeb(String(body.q ?? ''), tavilyKey(env)));
        case '/api/fetch': return json(await readPage(String(body.url ?? '')));
        case '/api/tavily': return json(await tavilySearch(tavilyKey(env), body));
        case '/api/tavily/extract': return json(await tavilyExtract(tavilyKey(env), body.urls));
      }
      return fail(404, 'Inconnu.');
    } catch (e) {
      if (e instanceof WebError) return fail(e.status, e.message);
      return fail(500, e instanceof Error ? e.message : String(e));
    }
  },
};

// ── La base 43 WACC (Hares) ──
// Le Worker ne la lit pas (8 Mo de JSON dépasseraient son temps de calcul gratuit) : il relaie la page de WACC43,
// gardée une heure dans le cache de Cloudflare ; c'est le navigateur qui en extrait la base et l'interroge.
async function wacc43(env: Env) {
  const src = env.WACC43_URL || 'https://43wacc.pages.dev/';
  const r = await fetch(src, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!r.ok || !r.body) return fail(502, 'La base 43 WACC ne répond pas (site WACC43).');
  return new Response(r.body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, max-age=900', 'X-Content-Type-Options': 'nosniff' } });
}

// ── L'IA ──
const ACTION_SCHEMA = {
  type: 'object',
  properties: { say: { type: 'string' }, action: { type: 'string' }, input: { type: 'object', additionalProperties: true } },
  required: ['action', 'input'],
};

async function chat(env: Env, body: Record<string, unknown>) {
  const model = MODELS.includes(String(body.model)) ? String(body.model) : MODELS[0];
  const messages = Array.isArray(body.messages)
    ? (body.messages as { role?: unknown; content?: unknown }[])
      .filter((m) => m && ['system', 'user', 'assistant'].includes(String(m.role)))
      .map((m) => ({ role: String(m.role), content: String(m.content ?? '').slice(0, 60_000) }))
    : [];
  if (!messages.length) return fail(400, 'Aucun message.');
  const base = { messages, max_tokens: Math.min(Number(body.max_tokens) || 3000, 4000), temperature: 0.3 };
  const quota = (e: unknown) => /neuron|quota|daily|limit|429|capacity/i.test(e instanceof Error ? e.message : String(e));
  let out: unknown;
  try {
    // d'habitude en texte libre (le bureau sait y lire l'objet JSON) ; en mode JSON strict si le bureau
    // le demande (après une réponse illisible)
    out = await env.AI.run(model, body.json === true ? { ...base, response_format: { type: 'json_schema', json_schema: ACTION_SCHEMA } } : base);
  } catch (e) {
    if (quota(e)) return fail(429, 'Le quota gratuit de l’IA est épuisé pour aujourd’hui (remis à zéro à minuit UTC).');
    if (body.json !== true) throw e;
    try { out = await env.AI.run(model, base); } catch (e2) {
      if (quota(e2)) return fail(429, 'Le quota gratuit de l’IA est épuisé pour aujourd’hui (remis à zéro à minuit UTC).');
      throw e2;
    }
  }
  const o = (out ?? {}) as Record<string, unknown>;
  const r = o.response;
  const text = typeof r === 'string' ? r : r && typeof r === 'object' ? JSON.stringify(r) : '';
  return json({ text, usage: o.usage ?? null, model });
}
