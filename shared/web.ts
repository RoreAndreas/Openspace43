// La recherche sur internet et la lecture des pages, partagées par le Worker Cloudflare (en ligne) et par le
// serveur local (npm start, avec l'IA gratuite d'Ollama). Rien n'est gardé : on cherche, on lit, on renvoie.

export interface Hit { title: string; url: string; snippet: string }
export interface PageText { url: string; title: string; text: string; truncated: boolean }

/** Une erreur avec le code HTTP à renvoyer au navigateur. */
export class WebError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const PAGE_CHARS = 7000;
const UA = 'Mozilla/5.0 (compatible; OpenSpace/1.0)';

const decode = (s: string) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Une recherche : Tavily si une clé est donnée, sinon DuckDuckGo. */
export async function searchWeb(q: string, tavilyKey?: string): Promise<{ hits: Hit[]; engine: string }> {
  try { return await search(q, tavilyKey); } catch (e) {
    if (e instanceof WebError) throw e;
    throw new WebError(502, 'La recherche sur internet ne répond pas. Vérifie ta connexion.');
  }
}

async function search(q: string, tavilyKey?: string): Promise<{ hits: Hit[]; engine: string }> {
  const query = q.trim().slice(0, 300);
  if (!query) throw new WebError(400, 'Recherche vide.');
  if (tavilyKey) {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyKey}` },
      body: JSON.stringify({ query, max_results: 6, search_depth: 'basic' }),
    });
    if (!r.ok) throw new WebError(502, `La recherche a échoué (Tavily ${r.status}).`);
    const d = (await r.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return { hits: (d.results ?? []).map((x) => ({ title: x.title ?? '', url: x.url ?? '', snippet: (x.content ?? '').slice(0, 300) })), engine: 'tavily' };
  }
  const r = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: new URLSearchParams({ q: query, kl: 'fr-fr' }).toString(),
  });
  if (!r.ok) throw new WebError(502, `La recherche a échoué (DuckDuckGo ${r.status}). Ajoute une clé Tavily pour plus de fiabilité.`);
  const html = await r.text();
  const hits: Hit[] = [];
  // un bloc par résultat : le lien (class="result__a") puis, s'il existe, l'extrait (class="result__snippet")
  for (const block of html.split(/class="result__body/).slice(1)) {
    if (hits.length >= 6) break;
    const a = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let link = decode(a[1]);
    const u = link.startsWith('//') ? new URL('https:' + link) : link.startsWith('/') ? new URL('https://duckduckgo.com' + link) : null;
    if (u?.searchParams.get('uddg')) link = u.searchParams.get('uddg')!;
    if (!/^https?:\/\//.test(link) || /duckduckgo\.com\/y\.js/.test(link)) continue;
    const snip = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/);
    hits.push({ title: strip(a[2]), url: link, snippet: strip(snip?.[1] ?? '').slice(0, 300) });
  }
  return { hits, engine: 'duckduckgo' };
}

// ── Tavily, l'outil de Rook (le chercheur) : une recherche réglable (actualités, période, sites) et la lecture
// de plusieurs pages d'un coup. Il faut une clé (TAVILY_KEY ou CLE_TAVILY) ; sans elle, le bureau se rabat sur searchWeb.

export interface TavilyHit extends Hit { date: string; score: number }

const pickOne = <T extends string>(v: unknown, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def);
const domains = (v: unknown) => (Array.isArray(v) ? v : []).map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
  .filter((d) => /^[a-z0-9.-]{3,120}$/.test(d)).slice(0, 10);

const noKey = () => new WebError(501, 'Tavily n’est pas configuré : ajoute le secret TAVILY_KEY (ou CLE_TAVILY) sur Cloudflare, ou la variable en local.');

async function tavily<T>(path: 'search' | 'extract', key: string, body: Record<string, unknown>): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`https://api.tavily.com/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch { throw new WebError(502, 'Tavily ne répond pas.'); }
  if (r.status === 401 || r.status === 403) throw new WebError(502, 'La clé Tavily est refusée (TAVILY_KEY ou CLE_TAVILY).');
  if (r.status === 429 || r.status === 432) throw new WebError(429, 'Le quota Tavily est épuisé pour ce mois.');
  if (!r.ok) throw new WebError(502, `Tavily a répondu une erreur (${r.status}).`);
  return (await r.json()) as T;
}

/** Une recherche Tavily : la réponse résumée, et les résultats datés. Les options viennent de l'agent : on les vérifie. */
export async function tavilySearch(key: string | undefined, o: Record<string, unknown>): Promise<{ answer: string; hits: TavilyHit[]; engine: 'tavily' }> {
  if (!key) throw noKey();
  const query = String(o.query ?? '').trim().slice(0, 400);
  if (!query) throw new WebError(400, 'Recherche vide.');
  const body: Record<string, unknown> = {
    query,
    search_depth: pickOne(o.depth, ['basic', 'advanced'] as const, 'basic'),
    topic: pickOne(o.topic, ['general', 'news', 'finance'] as const, 'general'),
    max_results: Math.max(1, Math.min(10, Number(o.max_results) || 6)),
    include_answer: 'basic',
  };
  const range = pickOne(o.time_range, ['none', 'day', 'week', 'month', 'year'] as const, 'none');
  if (range !== 'none') body.time_range = range;
  const inc = domains(o.include_domains), exc = domains(o.exclude_domains);
  if (inc.length) body.include_domains = inc;
  if (exc.length) body.exclude_domains = exc;
  if (typeof o.country === 'string' && /^[a-z ]{3,30}$/i.test(o.country) && body.topic === 'general') body.country = o.country.toLowerCase();
  const d = await tavily<{ answer?: string; results?: { title?: string; url?: string; content?: string; score?: number; published_date?: string }[] }>('search', key, body);
  return {
    answer: (d.answer ?? '').slice(0, 1200),
    hits: (d.results ?? []).map((x) => ({ title: x.title ?? '', url: x.url ?? '', snippet: (x.content ?? '').slice(0, 400), date: x.published_date ?? '', score: Math.round((x.score ?? 0) * 100) / 100 })),
    engine: 'tavily',
  };
}

/** Le texte de 1 à 5 pages, lu par Tavily (plus fiable sur les sites qui bloquent les robots). */
export async function tavilyExtract(key: string | undefined, raw: unknown): Promise<{ pages: { url: string; text: string; truncated: boolean }[]; failed: string[] }> {
  if (!key) throw noKey();
  const urls = (Array.isArray(raw) ? raw : [raw]).map(String).filter((u) => { try { return allowed(new URL(u)); } catch { return false; } }).slice(0, 5);
  if (!urls.length) throw new WebError(400, 'Aucune adresse valide.');
  const d = await tavily<{ results?: { url?: string; raw_content?: string }[]; failed_results?: { url?: string }[] }>('extract', key, { urls, extract_depth: 'basic' });
  return {
    pages: (d.results ?? []).map((x) => ({ url: x.url ?? '', text: (x.raw_content ?? '').slice(0, PAGE_CHARS), truncated: (x.raw_content ?? '').length > PAGE_CHARS })),
    failed: (d.failed_results ?? []).map((x) => x.url ?? '').filter(Boolean),
  };
}

/** Pas d'adresse locale ni privée : on ne lit que des pages publiques. */
function allowed(u: URL) {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.startsWith('[')) return false;
  return true;
}

function htmlToText(html: string) {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1).join('\n');
  return { title, text };
}

/** Le texte d'une page web, nettoyé et raccourci. */
export async function readPage(raw: string): Promise<PageText> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new WebError(400, 'Adresse invalide.'); }
  if (!allowed(u)) throw new WebError(400, 'Cette adresse n’est pas autorisée.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(u.toString(), {
      headers: { 'User-Agent': UA, Accept: 'text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!r.ok) throw new WebError(502, `La page répond ${r.status}.`);
    // après une redirection, on revérifie l'adresse finale
    try { if (!allowed(new URL(r.url))) throw new WebError(400, 'Cette adresse n’est pas autorisée.'); } catch (e) { if (e instanceof WebError) throw e; }
    const type = r.headers.get('content-type') ?? '';
    if (!/text|json|xml|markdown/.test(type)) throw new WebError(415, 'Ce n’est pas une page de texte.');
    const body = (await r.text()).slice(0, 2_000_000);
    const { title, text } = /html/.test(type) ? htmlToText(body) : { title: '', text: body };
    return { url: r.url, title, text: text.slice(0, PAGE_CHARS), truncated: text.length > PAGE_CHARS };
  } catch (e) {
    if (e instanceof WebError) throw e;
    if (ctrl.signal.aborted) throw new WebError(504, 'La page met trop de temps à répondre.');
    throw new WebError(502, 'Impossible de lire cette page.');
  } finally {
    clearTimeout(timer);
  }
}
