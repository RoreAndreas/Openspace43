// Les appels qui sortent du navigateur :
//   - au Worker Cloudflare (/api/…), avec le code d'accès : l'IA gratuite, la recherche web, la lecture des pages ;
//   - à l'API Claude, directement, avec ta clé API Claude (si tu t'es connectée à Claude) : la clé ne passe
//     jamais par le serveur ;
//   - sur ton ordinateur (npm start), à Ollama, l'IA gratuite qui tourne sur ton PC, par le serveur local.
import { lsGet, lsSet } from './db.ts';

export interface ModelInfo { id: string; label: string; provider: 'cloudflare' | 'claude' | 'ollama'; /** la taille du modèle (Ollama), en octets */ size?: number }

export const MODELS: ModelInfo[] = [
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'IA gratuite · Llama 3.3 70B (recommandé)', provider: 'cloudflare' },
  { id: '@cf/meta/llama-3.1-8b-instruct', label: 'IA gratuite · Llama 3.1 8B (plus rapide, moins de quota)', provider: 'cloudflare' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (ta clé API Claude)', provider: 'claude' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (ta clé API Claude, économe)', provider: 'claude' },
];

/** Les modèles installés dans Ollama (sur ton ordinateur) : leur identifiant commence par « ollama: ». */
let ollamaModels: ModelInfo[] = [];
export const OLLAMA_PREFIX = 'ollama:';
/** Au-delà de cette taille, un modèle est trop lourd pour la plupart des ordinateurs portables (8 Go). */
export const HEAVY_MODEL = 8e9;
/** Les modèles légers qu'on propose d'installer d'un clic (le premier est recommandé). */
export const LIGHT_MODELS: { name: string; label: string }[] = [
  { name: 'qwen3:4b', label: 'Qwen 3, 4B (2,5 Go, recommandé)' },
  { name: 'llama3.2:3b', label: 'Llama 3.2, 3B (2 Go, le plus rapide)' },
];
const gb = (n: number) => `${(n / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
export const setOllamaModels = (list: { name: string; size: number }[]) => {
  ollamaModels = list.map((m) => ({
    id: OLLAMA_PREFIX + m.name, provider: 'ollama' as const, size: m.size,
    label: `IA gratuite sur ton PC · ${m.name}${m.size ? ` (${gb(m.size)}${m.size > HEAVY_MODEL ? ', trop lourd pour un portable ?' : ''})` : ''}`,
  }));
};
/** Les modèles proposés : sur ton ordinateur avec l'IA gratuite, ceux d'Ollama ; en ligne, Cloudflare et Claude. */
export const availableModels = (local: boolean): ModelInfo[] => (local ? ollamaModels : MODELS);

export const modelInfo = (id: string): ModelInfo | undefined =>
  MODELS.find((m) => m.id === id) ?? ollamaModels.find((m) => m.id === id) ?? (id.startsWith(OLLAMA_PREFIX) ? { id, label: id.slice(OLLAMA_PREFIX.length), provider: 'ollama' } : undefined);

export const getCode = () => lsGet<string>('code', '');
export const setCode = (c: string) => lsSet('code', c.trim());

/** La clé API Claude (créée sur platform.claude.com). Elle reste dans ce navigateur. */
export const getClaudeKey = () => lsGet<string>('claudeKey', '');
export const setClaudeKey = (k: string) => lsSet('claudeKey', k.trim());

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-code': getCode() },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError(0, 'Le serveur Cloudflare ne répond pas. Vérifie ta connexion.');
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Erreur ${res.status}.`);
  return data as T;
}

export interface SearchHit { title: string; url: string; snippet: string }
export interface Page { url: string; title: string; text: string; truncated: boolean }
export interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string }
export interface ChatOut { text: string; usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null; model: string }

// ── L'API Claude, en direct depuis le navigateur ──
const CLAUDE = 'https://api.anthropic.com/v1';

function claudeHeaders(key = getClaudeKey()): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    // l'appel part du navigateur de l'utilisatrice, avec sa propre clé
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

async function claudeError(res: Response): Promise<ApiError> {
  let msg = '';
  try { msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? ''; } catch { /* vide */ }
  if (res.status === 401 || res.status === 403) return new ApiError(res.status, 'Clé API Claude refusée : vérifie-la dans les réglages (« Se connecter à Claude »).');
  if (res.status === 429) return new ApiError(429, 'Claude limite le débit pour l’instant : réessaie dans une minute.');
  if (res.status === 529) return new ApiError(529, 'Claude est très demandé en ce moment : réessaie dans un instant.');
  if (/credit|balance|billing/i.test(msg)) return new ApiError(res.status, 'Ton compte API Claude n’a plus de crédit : recharge-le sur platform.claude.com.');
  return new ApiError(res.status, `Claude a répondu une erreur (${res.status})${msg ? ` : ${msg}` : ''}.`);
}

/** Regroupe les messages qui se suivent avec le même rôle (l'API Claude veut une alternance stricte). */
function alternate(messages: ChatMsg[]) {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  if (out[0]?.role !== 'user') out.unshift({ role: 'user', content: 'Commence.' });
  return out;
}

export const claude = {
  /** Vérifie la clé (la liste des modèles : rien n'est facturé). */
  async check(key: string) {
    let res: Response;
    try { res = await fetch(`${CLAUDE}/models?limit=1`, { headers: claudeHeaders(key) }); } catch { throw new ApiError(0, 'Impossible de joindre Claude. Vérifie ta connexion.'); }
    if (!res.ok) throw await claudeError(res);
  },
  async chat(model: string, messages: ChatMsg[], signal?: AbortSignal): Promise<ChatOut> {
    if (!getClaudeKey()) throw new ApiError(401, 'Connecte-toi d’abord à Claude dans les réglages (« Se connecter à Claude »), ou choisis l’IA gratuite.');
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    let res: Response;
    try {
      res = await fetch(`${CLAUDE}/messages`, {
        method: 'POST', headers: claudeHeaders(), signal,
        body: JSON.stringify({ model, max_tokens: 4000, temperature: 0.3, system, messages: alternate(messages) }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new ApiError(0, 'Impossible de joindre Claude. Vérifie ta connexion.');
    }
    if (!res.ok) throw await claudeError(res);
    const d = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (d.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    const total = (d.usage?.input_tokens ?? 0) + (d.usage?.output_tokens ?? 0);
    return { text, usage: { total_tokens: total }, model };
  },
};

// ── Ollama : l'IA gratuite sur ton ordinateur (par le serveur local, qui la relaie) ──
export const ollama = {
  /** Les modèles installés (vide si Ollama n'est pas lancé). */
  async models(): Promise<{ name: string; size: number }[]> {
    try {
      const r = await fetch('/api/ollama/tags', { headers: { 'x-code': 'local' } });
      if (!r.ok) return [];
      const d = (await r.json()) as { models?: { name?: string; size?: number }[] };
      // les plus légers d'abord : ils répondent plus vite sur un ordinateur portable
      return (d.models ?? []).filter((m) => m.name && !/embed/i.test(m.name)).sort((a, b) => (a.size ?? 0) - (b.size ?? 0)).map((m) => ({ name: m.name!, size: m.size ?? 0 }));
    } catch { return []; }
  },
  /** Installe un modèle (il se télécharge dans Ollama) ; onProgress reçoit la part faite (0 à 1). */
  async pull(name: string, onProgress: (done: number, status: string) => void, signal?: AbortSignal) {
    let res: Response;
    try {
      res = await fetch('/api/ollama/pull', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-code': 'local' }, body: JSON.stringify({ model: name, stream: true }) });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new ApiError(0, 'Le bureau ne joint plus le serveur local : relance « npm start ».');
    }
    if (!res.ok || !res.body) {
      let msg = '';
      try { msg = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* vide */ }
      throw new ApiError(res.status, msg || `Ollama a refusé le téléchargement (${res.status}).`);
    }
    // Ollama envoie une ligne JSON par étape : { status, total, completed } ou { error }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let d: { status?: string; total?: number; completed?: number; error?: string };
        try { d = JSON.parse(line); } catch { continue; }
        if (d.error) throw new ApiError(500, `Ollama : ${d.error}`);
        onProgress(d.total ? (d.completed ?? 0) / d.total : d.status === 'success' ? 1 : 0, d.status ?? '');
      }
    }
  },
  async chat(model: string, messages: ChatMsg[], signal?: AbortSignal, json = false): Promise<ChatOut> {
    const name = model.startsWith(OLLAMA_PREFIX) ? model.slice(OLLAMA_PREFIX.length) : model;
    let res: Response;
    try {
      res = await fetch('/api/ollama/chat', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-code': 'local' },
        body: JSON.stringify({
          model: name, messages, stream: false, think: false, keep_alive: '20m',
          ...(json ? { format: 'json' } : {}),
          // une fenêtre de 8 000 jetons (la conversation est raccourcie pour y tenir) et des réponses de 2 000 jetons au plus
          options: { temperature: 0.3, num_ctx: 8192, num_predict: 2000 },
        }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new ApiError(0, 'Le bureau ne joint plus le serveur local : relance « npm start ».');
    }
    let d: { message?: { content?: string }; error?: string; prompt_eval_count?: number; eval_count?: number } = {};
    try { d = await res.json(); } catch { /* vide */ }
    if (!res.ok) {
      if (res.status === 404 || /not found/i.test(d.error ?? '')) throw new ApiError(404, `Le modèle « ${name} » n’est pas installé dans Ollama. Choisis-en un autre dans les réglages.`);
      // le modèle ne tient pas dans la mémoire de l'ordinateur
      if (/out of memory|failed to allocate|unable to allocate|requires more system memory|insufficient memory|not enough memory/i.test(d.error ?? '')) {
        throw new ApiError(507, `Le modèle « ${name} » est trop gros pour la mémoire de ton ordinateur. Installe un modèle léger dans les réglages (⚙️, puis « Installer Qwen 3, 4B »), puis relance la mission.`);
      }
      throw new ApiError(res.status, d.error ?? `Ollama a répondu une erreur (${res.status}).`);
    }
    // un modèle « qui réfléchit » (Qwen 3…) peut écrire sa réflexion avant la réponse : on la retire
    const text = (d.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { text, usage: { total_tokens: (d.prompt_eval_count ?? 0) + (d.eval_count ?? 0) }, model: name };
  },
};

export const api = {
  ping: () => call<{ ok: boolean; models: string[]; search: string }>('ping'),
  chat: (model: string, messages: ChatMsg[], signal?: AbortSignal, json = false) => call<ChatOut>('chat', { model, messages, json }, signal),
  search: (q: string, signal?: AbortSignal) => call<{ hits: SearchHit[]; engine: string }>('search', { q }, signal),
  page: (url: string, signal?: AbortSignal) => call<Page>('fetch', { url }, signal),
  /** la recherche de Rook (Tavily) : une réponse résumée et des résultats datés */
  tavily: (opts: Record<string, unknown>, signal?: AbortSignal) => call<{ answer: string; hits: (SearchHit & { date: string; score: number })[] }>('tavily', opts, signal),
  tavilyExtract: (urls: string[], signal?: AbortSignal) => call<{ pages: { url: string; text: string; truncated: boolean }[]; failed: string[] }>('tavily/extract', { urls }, signal),
};
