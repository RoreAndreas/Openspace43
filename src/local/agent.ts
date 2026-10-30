// L'équipe au travail, dans le navigateur. Roré (le chef) et l'analyste parlent à l'IA (Workers AI, via le
// Worker) avec un protocole simple : à chaque tour, l'IA répond par un objet JSON { say, action, input }.
// Le bureau exécute l'action (une recherche, une page lue, un fichier écrit, une tâche confiée à l'analyste, à Hares ou à Rook…),
// la montre aussitôt dans le bureau, puis renvoie le résultat à l'IA. Jusqu'à l'action « final ».
import { cut, describeAct } from '../../shared/activity.ts';
import type { OfficeEvent, PlanItem } from '../../shared/protocol.ts';
import { api, ApiError, type ChatMsg } from './api.ts';
import { drawerPrompt, useDrawer } from './drawer.ts';
import { findSkill, skillsPrompt } from './skills.ts';
import { askWacc43 } from './wacc43.ts';

/** Les fichiers de la mission (un petit dossier virtuel, rangé dans le navigateur). */
export interface MissionFiles {
  list(): string[];
  read(name: string): string | null;
  write(name: string, content: string, by: string): string;
}

export interface TeamCtx {
  emit: (ev: OfficeEvent) => void;
  signal: AbortSignal;
  model: string;
  permission: 'auto' | 'ask';
  files: MissionFiles;
  missionTitle: string;
  rules: string;
  /** demande la permission à l'utilisatrice (vrai = oui) */
  ask: (who: string, tool: string, label: string, detail: string) => Promise<boolean>;
  pickName: () => string;
  /** les précisions envoyées pendant que l'équipe travaille */
  takeNotes: () => string[];
  /** un tour de l'IA */
  chat: (messages: ChatMsg[], json: boolean) => Promise<{ text: string; usage: { total_tokens?: number } | null }>;
}

interface Action { say: string; action: string; input: Record<string, unknown> }

const CHEF_STEPS = 14;
const ANALYST_STEPS = 16;
let MAX_HISTORY = 52_000;
let MAX_RESULT = 7_000;
let MAX_DOC = 12_000;
/** Une IA sur ton ordinateur (Ollama) lit lentement : on lui envoie une conversation plus courte (bien plus rapide). */
export function setLightBudget(on: boolean) {
  MAX_HISTORY = on ? 16_000 : 52_000;
  MAX_RESULT = on ? 3_000 : 7_000;
  MAX_DOC = on ? 5_000 : 12_000;
}

const today = () => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// ── Lire la réponse de l'IA ──
export function parseAction(text: string): Action | null {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const tryParse = (s: string) => { try { return JSON.parse(s) as unknown; } catch { return null; } };
  let o = tryParse(t);
  if (!o) {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { t = t.slice(a, b + 1); o = tryParse(t); }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  // certains modèles rangent tout dans un sous-objet, ou appellent l'action « name » / « tool »
  const action = String(r.action ?? r.name ?? r.tool ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  let input = (r.input ?? r.parameters ?? r.arguments ?? r.args ?? {}) as unknown;
  if (typeof input === 'string') input = tryParse(input) ?? { text: input };
  if (!action) {
    if (typeof r.final === 'string' || typeof r.message === 'string' || typeof r.report === 'string') {
      return { say: String(r.say ?? ''), action: 'final', input: { message: r.final ?? r.message ?? r.report, report: r.report ?? r.final ?? r.message } };
    }
    return null;
  }
  return { say: typeof r.say === 'string' ? r.say : '', action, input: (input && typeof input === 'object' ? input : {}) as Record<string, unknown> };
}

/** Garde la conversation sous la taille que le modèle accepte : on oublie d'abord les plus vieux échanges. */
function fit(messages: ChatMsg[]): ChatMsg[] {
  const size = (m: ChatMsg[]) => m.reduce((n, x) => n + x.content.length, 0);
  const out = [...messages];
  while (size(out) > MAX_HISTORY && out.length > 4) out.splice(2, 2);
  if (size(out) > MAX_HISTORY) out[out.length - 1] = { ...out[out.length - 1], content: out[out.length - 1].content.slice(0, 20_000) };
  return out;
}

const clip = (s: string, n: number = MAX_RESULT) => (s.length > n ? s.slice(0, n) + '\n[…coupé]' : s);
const str = (v: unknown, n = 20_000) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)).slice(0, n);

interface Usage { tokens: number }

/** Un tour de l'IA : envoie la conversation, lit l'action. Redemande une fois si la réponse est illisible. */
async function think(ctx: TeamCtx, messages: ChatMsg[], usage: Usage): Promise<{ act: Action; raw: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (ctx.signal.aborted) throw new DOMException('stop', 'AbortError');
    // d'abord en texte libre ; si la réponse est illisible, on redemande en mode JSON strict
    const res = await ctx.chat(fit(messages), attempt > 0);
    usage.tokens += res.usage?.total_tokens ?? 0;
    const act = parseAction(res.text);
    if (act) return { act, raw: JSON.stringify({ say: act.say, action: act.action, input: act.input }) };
    messages.push({ role: 'assistant', content: res.text.slice(0, 2000) });
    messages.push({ role: 'user', content: 'Ta réponse n’est pas lisible. Réponds uniquement par un objet JSON : {"say": "...", "action": "...", "input": {...}}.' });
  }
  throw new Error('L’IA ne répond pas dans le bon format. Essaie le modèle Llama 3.3 70B dans les réglages.');
}

/** Montre une action dans le bureau, l'exécute, puis la marque comme finie. */
async function act<T>(ctx: TeamCtx, who: string, tool: string, input: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  const id = `${who}-${Math.random().toString(36).slice(2, 9)}`;
  const { kind, label, detail } = describeAct(tool, input);
  ctx.emit({ k: 'act', who, id, kind, tool, label, detail });
  try {
    const out = await run();
    ctx.emit({ k: 'act_done', who, id, ok: true });
    return out;
  } catch (e) {
    ctx.emit({ k: 'act_done', who, id, ok: false });
    throw e;
  }
}

/** Les actions sur les fichiers et les skills, communes à Roré et à l'analyste. */
async function common(ctx: TeamCtx, who: string, a: Action): Promise<string | null> {
  const i = a.input;
  switch (a.action) {
    case 'read_file': {
      const name = str(i.name ?? i.file, 200);
      return act(ctx, who, 'Read', { file_path: name }, async () => ctx.files.read(name) ?? `Le fichier « ${name} » n’existe pas. Fichiers : ${ctx.files.list().join(', ') || 'aucun'}.`)
        .then((t) => clip(t, MAX_DOC));
    }
    case 'write_file': {
      const name = str(i.name ?? i.file, 200);
      const content = str(i.content ?? i.text, 120_000);
      if (!name || !content) return 'Il manque « name » ou « content ».';
      if (ctx.permission === 'ask' && !(await ctx.ask(who, 'Write', `Je peux écrire ${name} ?`, cut(content, 400)))) return 'L’utilisatrice a refusé. Ne réessaie pas ce fichier.';
      const saved = await act(ctx, who, 'Write', { file_path: name }, async () => ctx.files.write(name, content, who));
      return `Fichier « ${saved} » enregistré (${content.length} caractères).`;
    }
    case 'edit_file': {
      const name = str(i.name ?? i.file, 200);
      const find = str(i.find ?? i.old, 20_000);
      const replace = str(i.replace ?? i.new, 40_000);
      const cur = ctx.files.read(name);
      if (cur == null) return `Le fichier « ${name} » n’existe pas.`;
      if (!find || !cur.includes(find)) return 'Le texte à remplacer est introuvable dans le fichier. Relis-le avec read_file.';
      if (ctx.permission === 'ask' && !(await ctx.ask(who, 'Edit', `Je peux modifier ${name} ?`, cut(replace, 400)))) return 'L’utilisatrice a refusé.';
      await act(ctx, who, 'Edit', { file_path: name }, async () => ctx.files.write(name, cur.replace(find, replace), who));
      return `Fichier « ${name} » modifié.`;
    }
    case 'use_skill': {
      const s = findSkill(str(i.name ?? i.skill, 60));
      if (!s) return `Skill introuvable. ${skillsPrompt() || 'Aucun skill installé.'}`;
      return act(ctx, who, 'Skill', { skill: s.name }, async () => clip(s.content, MAX_DOC));
    }
  }
  return null;
}

const FORMAT = `Tu réponds TOUJOURS par un seul objet JSON, sans texte autour : {"say": "...", "action": "...", "input": {...}}
- "say" : une phrase courte et vivante pour ta bulle (tutoiement), ou "".
- "action" et "input" : une des actions ci-dessous, avec ses paramètres.`;

const FILE_ACTIONS = `- read_file {"name": "rapport.md"} : lire un fichier de la mission.
- write_file {"name": "rapport-sujet.md", "content": "..."} : créer ou remplacer un fichier (Markdown de préférence).
- use_skill {"name": "..."} : lire la méthode d'un skill installé avant de l'appliquer.`;

function context(ctx: TeamCtx): string {
  const files = ctx.files.list();
  return [
    ctx.rules ? `## Le règlement du bureau (écrit par ta patronne)\n${ctx.rules}` : '',
    drawerPrompt(),
    skillsPrompt(),
    files.length ? `## Fichiers déjà dans la mission\n${files.map((f) => `- ${f}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

// ── L'analyste ──
function analystPrompt(ctx: TeamCtx, name: string): string {
  return `Tu es ${name}, l'analyste de l'open space : tu travailles pour une responsable marketing et communication. Roré, le chef de projet, t'a confié une tâche précise. Tout ce que tu fais s'affiche en direct dans un bureau en pixel art.
Nous sommes le ${today()}.

${FORMAT}

Actions :
- web_search {"query": "..."} : chercher sur internet (résultats : titres, liens, extraits).
- web_fetch {"url": "https://..."} : lire le texte d'une page.
${FILE_ACTIONS}
- edit_file {"name": "...", "find": "texte exact à remplacer", "replace": "nouveau texte"} : retoucher un fichier.
- remember {"text": "..."} : ranger dans ton tiroir une information durable à retenir pour les prochaines missions (un fait sur la marque, une préférence de ta patronne). Pas pour les résultats de cette mission.
- final {"report": "..."} : rendre ton rapport à Roré et terminer. Le rapport résume en 10 lignes au plus ce que tu as trouvé, donne le nom du fichier écrit et les sources principales.

Ta façon de travailler :
1. Va droit au but : 2 à 4 recherches, 2 à 5 pages lues, pas plus de 14 actions en tout.
2. Écris le livrable dans un fichier Markdown de la mission (write_file), structuré, avec les sources (lien et date du relevé).
3. Respecte les références de ton tiroir (couleurs, typographies, ton) et les skills utiles.
4. N'invente aucun chiffre : ce qui n'est pas sourcé est présenté comme une estimation.
5. Réponds en français.

${context(ctx)}`;
}

/** L'analyste fait sa tâche et rend son rapport (le texte renvoyé à Roré). */
async function runAnalyst(ctx: TeamCtx, title: string, instructions: string): Promise<string> {
  const id = `analyste-${Date.now().toString(36)}`;
  const name = ctx.pickName();
  const t0 = Date.now();
  const usage: Usage = { tokens: 0 };
  let tools = 0;
  ctx.emit({ k: 'hire', id, role: 'analyse', type: 'analyste', name, task: cut(title || 'Analyse', 48), prompt: cut(instructions, 2000) });
  const messages: ChatMsg[] = [
    { role: 'system', content: analystPrompt(ctx, name) },
    { role: 'user', content: `Ta tâche, confiée par Roré :\n${instructions}` },
  ];
  const leave = (ok: boolean) => ctx.emit({ k: 'leave', who: id, ok, tokens: usage.tokens, tools, ms: Date.now() - t0 });
  try {
    for (let step = 0; step < ANALYST_STEPS; step++) {
      ctx.emit({ k: 'think', who: id });
      const { act: a, raw } = await think(ctx, messages, usage);
      messages.push({ role: 'assistant', content: raw });
      if (a.say.trim()) ctx.emit({ k: 'say', who: id, text: cut(a.say, 220) });
      const i = a.input;
      let result: string | null = null;
      if (a.action === 'final' || a.action === 'report') {
        const report = str(i.report ?? i.message ?? a.say, 20_000).trim() || 'Travail terminé.';
        ctx.emit({ k: 'report', who: id, text: report });
        leave(true);
        return report;
      }
      tools++;
      if (a.action === 'web_search') {
        const q = str(i.query ?? i.q, 300);
        result = await act(ctx, id, 'WebSearch', { query: q }, async () => {
          const r = await api.search(q, ctx.signal);
          return r.hits.length
            ? r.hits.map((h, n) => `${n + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`).join('\n')
            : 'Aucun résultat. Reformule la recherche.';
        }).catch((e) => `La recherche a échoué : ${e instanceof Error ? e.message : e}`);
      } else if (a.action === 'web_fetch') {
        const url = str(i.url, 1000);
        result = await act(ctx, id, 'WebFetch', { url }, async () => {
          const p = await api.page(url, ctx.signal);
          return `Page : ${p.title || p.url}\nAdresse : ${p.url}\nLue le ${today()}\n\n${p.text}${p.truncated ? '\n[…page coupée]' : ''}`;
        }).catch((e) => `Impossible de lire cette page : ${e instanceof Error ? e.message : e}. Essaie une autre source.`);
      } else if (a.action === 'remember') {
        const text = str(i.text ?? i.value ?? i.note, 600).trim();
        result = text
          ? await act(ctx, id, 'Tiroir', { value: text }, async () => { useDrawer.getState().addNote(text, 'analyste', ctx.missionTitle); return 'Rangé dans ton tiroir.'; })
          : 'Il manque « text ».';
      } else {
        result = await common(ctx, id, a);
      }
      if (result === null) { tools--; result = 'Action inconnue. Actions possibles : web_search, web_fetch, read_file, write_file, edit_file, use_skill, remember, final.'; }
      messages.push({ role: 'user', content: `Résultat de ${a.action} :\n${clip(result)}` });
    }
    const report = 'J’ai atteint ma limite d’actions. Le travail fait est dans les fichiers de la mission.';
    ctx.emit({ k: 'report', who: id, text: report });
    leave(true);
    return report;
  } catch (e) {
    leave(false);
    throw e;
  }
}

// ── Rook, le chercheur (la veille, avec Tavily) ──
function rookPrompt(ctx: TeamCtx): string {
  return `Tu es Rook, l'explorateur de l'open space : le chercheur et la veille. Curieux, rigoureux, tu rapportes des sources fraîches et datées. Tu travailles pour une responsable marketing et communication ; Roré, le chef de projet, t'a confié une tâche précise. Tout ce que tu fais s'affiche en direct dans un bureau en pixel art.
Nous sommes le ${today()}.

${FORMAT}

Actions :
- tavily {"query": "...", "sujet": "general|news|finance", "periode": "day|week|month|year", "profondeur": "basic|advanced", "sites": ["exemple.com"], "exclure": ["exemple.com"], "pays": "france", "nombre": 6} : chercher avec Tavily. Tu reçois une réponse résumée et des résultats (titre, lien, date, extrait, pertinence). Seul "query" est obligatoire. "news" + "periode" pour l'actualité récente ; "sites" pour fouiller des sites précis ; "advanced" seulement pour une question pointue (elle coûte le double).
- tavily_extract {"urls": ["https://...", "https://..."]} : lire le texte de 1 à 5 pages d'un coup.
- web_fetch {"url": "https://..."} : lire une page sans Tavily (si tavily_extract échoue).
${FILE_ACTIONS}
- edit_file {"name": "...", "find": "texte exact à remplacer", "replace": "nouveau texte"} : retoucher un fichier.
- final {"report": "..."} : rendre ton rapport à Roré et terminer. 10 lignes au plus : ce que tu as trouvé, le nom du fichier écrit, les sources principales.

Ta façon de travailler :
1. 3 à 6 recherches ciblées, puis lis les meilleures pages (tavily_extract) : pas plus de 14 actions en tout.
2. Pour une veille, cherche d'abord l'actualité ("sujet": "news" et une "periode"), puis les sources officielles.
3. Écris le livrable dans un fichier Markdown de la mission (write_file) : les faits, puis un tableau des sources (titre, lien, date, fiabilité).
4. Date chaque information. Écarte les sources sans date ou douteuses, ou signale-les. N'invente rien.
5. Réponds en français.

${context(ctx)}`;
}

/** Les réglages de recherche de Rook, en français ou en anglais, traduits pour Tavily. */
const tavilyOpts = (i: Record<string, unknown>) => ({
  query: str(i.query ?? i.q ?? i.recherche, 400),
  topic: i.sujet ?? i.topic,
  time_range: i.periode ?? i.période ?? i.time_range,
  depth: i.profondeur ?? i.depth ?? i.search_depth,
  include_domains: i.sites ?? i.include_domains ?? i.domaines,
  exclude_domains: i.exclure ?? i.exclude_domains,
  country: i.pays ?? i.country,
  max_results: i.nombre ?? i.max_results,
});

/** Rook fait sa recherche (Tavily, sinon la recherche du bureau) et rend son rapport. */
async function runRook(ctx: TeamCtx, title: string, instructions: string): Promise<string> {
  const id = `rook-${Date.now().toString(36)}`;
  const t0 = Date.now();
  const usage: Usage = { tokens: 0 };
  let tools = 0;
  ctx.emit({ k: 'hire', id, role: 'recherche', type: 'rook', name: 'Rook', task: cut(title || 'Recherche', 48), prompt: cut(instructions, 2000) });
  const messages: ChatMsg[] = [
    { role: 'system', content: rookPrompt(ctx) },
    { role: 'user', content: `Ta tâche, confiée par Roré :\n${instructions}` },
  ];
  const leave = (ok: boolean) => ctx.emit({ k: 'leave', who: id, ok, tokens: usage.tokens, tools, ms: Date.now() - t0 });
  /** sans clé Tavily, la recherche du bureau (DuckDuckGo) prend le relais */
  let noTavily = false;
  try {
    for (let step = 0; step < ANALYST_STEPS; step++) {
      ctx.emit({ k: 'think', who: id });
      const { act: a, raw } = await think(ctx, messages, usage);
      messages.push({ role: 'assistant', content: raw });
      if (a.say.trim()) ctx.emit({ k: 'say', who: id, text: cut(a.say, 220) });
      const i = a.input;
      if (a.action === 'final' || a.action === 'report') {
        const report = str(i.report ?? i.message ?? a.say, 20_000).trim() || 'Travail terminé.';
        ctx.emit({ k: 'report', who: id, text: report });
        leave(true);
        return report;
      }
      tools++;
      let result: string | null;
      if (a.action === 'tavily' || a.action === 'tavily_search' || a.action === 'web_search') {
        const o = tavilyOpts(i);
        result = await act(ctx, id, noTavily ? 'WebSearch' : 'Tavily', noTavily ? { query: o.query } : o, async () => {
          if (!noTavily) {
            try {
              const r = await api.tavily(o, ctx.signal);
              const list = r.hits.map((h, n) => `${n + 1}. ${h.title}${h.date ? ` (${h.date})` : ''} · pertinence ${h.score}\n   ${h.url}\n   ${h.snippet}`).join('\n');
              return r.hits.length ? `${r.answer ? `Réponse résumée : ${r.answer}\n\n` : ''}${list}` : 'Aucun résultat. Élargis la période ou reformule.';
            } catch (e) {
              if (!(e instanceof ApiError && e.status === 501)) throw e;
              noTavily = true;
            }
          }
          const r = await api.search(o.query, ctx.signal);
          const list = r.hits.map((h, n) => `${n + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`).join('\n');
          return `(Tavily n’est pas configuré : recherche simple, sans date ni période.)\n${list || 'Aucun résultat. Reformule la recherche.'}`;
        }).catch((e) => `La recherche a échoué : ${e instanceof Error ? e.message : e}`);
      } else if (a.action === 'tavily_extract' || a.action === 'extract') {
        const urls = (Array.isArray(i.urls) ? i.urls : [i.url ?? i.urls]).map((u) => str(u, 1000)).filter(Boolean).slice(0, 5);
        result = await act(ctx, id, 'TavilyExtract', { urls }, async () => {
          const r = await api.tavilyExtract(urls, ctx.signal);
          const pages = r.pages.map((p) => `### ${p.url}\nLue le ${today()}\n${clip(p.text, Math.floor(MAX_DOC / Math.max(1, r.pages.length)))}${p.truncated ? '\n[…page coupée]' : ''}`).join('\n\n');
          return `${pages || 'Aucune page lue.'}${r.failed.length ? `\n\nIllisibles : ${r.failed.join(', ')} (essaie web_fetch).` : ''}`;
        }).catch((e) => `Lecture impossible : ${e instanceof Error ? e.message : e}. Essaie web_fetch, une page à la fois.`);
      } else if (a.action === 'web_fetch') {
        const url = str(i.url, 1000);
        result = await act(ctx, id, 'WebFetch', { url }, async () => {
          const p = await api.page(url, ctx.signal);
          return `Page : ${p.title || p.url}\nAdresse : ${p.url}\nLue le ${today()}\n\n${p.text}${p.truncated ? '\n[…page coupée]' : ''}`;
        }).catch((e) => `Impossible de lire cette page : ${e instanceof Error ? e.message : e}. Essaie une autre source.`);
      } else result = await common(ctx, id, a);
      if (result === null) { tools--; result = 'Action inconnue. Actions possibles : tavily, tavily_extract, web_fetch, read_file, write_file, edit_file, use_skill, final.'; }
      messages.push({ role: 'user', content: `Résultat de ${a.action} :\n${clip(result, Math.max(MAX_RESULT, 6000))}` });
    }
    const report = 'J’ai atteint ma limite d’actions. Le travail fait est dans les fichiers de la mission.';
    ctx.emit({ k: 'report', who: id, text: report });
    leave(true);
    return report;
  } catch (e) {
    leave(false);
    throw e;
  }
}

// ── Hares, le financier ──
function haresPrompt(ctx: TeamCtx): string {
  return `Tu es Hares, le financier de l'open space : un spartiate méthodique. Tu travailles sur la base 43 WACC de ta patronne (le site WACC43) : 8 000 sociétés cotées (exports S&P Capital IQ, montants en millions), les primes de risque pays et les bêtas sectoriels Damodaran, les taux US Treasury. Roré, le chef de projet, t'a confié une tâche précise. Tout ce que tu fais s'affiche en direct dans un bureau en pixel art.
Nous sommes le ${today()}.

${FORMAT}

Actions :
- base43 {"source": "resume"} : ce que contient la base (zones, industries, champs). Commence par là si tu ne connais pas les noms exacts.
- base43 {"source": "societes", "filtres": {"industrie": "Telecom", "continent": "Afrique", "zone": "...", "pays": "...", "statut": "groupe|filiale", "nom": "...", "activite": "mot de la description"}, "min": {"marge_ebitda": 0.1}, "max": {"levier": 4}, "exclure": ["nom de société"], "aberrants": ["ve_ebitda"], "tri": "capitalisation", "ordre": "desc|asc", "garder": 20, "stats": ["beta_u", "gearing", "ve_ebitda"], "colonnes": ["capitalisation", "marge_ebitda"], "limite": 15} : un échantillon de sociétés, ses médianes et quartiles, et un tableau. Champs : capitalisation, dette, fonds_propres, ca, ebitda, rn, marge_ebitda, marge_nette, croissance_ca, levier, gearing, ve, ve_ebitda, ve_ca, per, beta_u, beta_3ans, beta_1an, is_effectif. Les demandes ne se cumulent pas : redonne tous les filtres à chaque fois.
- base43 {"source": "pays", "nom": "Côte d'Ivoire"} : prime de risque pays, spread de défaut, taux d'IS.
- base43 {"source": "industries", "nom": "Telecom"} : bêta désendetté et D/E sectoriels (Damodaran). Sans "nom" : la liste.
- base43 {"source": "taux", "annee": 2026, "maturite": "30"} : le taux US Treasury moyen.
- base43 {"source": "cmpc", "pays": "...", "industrie": "...", "annee": 2026, "maturite": "30", "prime_taille": 0, "prime_specifique": 0, "inflation_locale": 0.03, "inflation_ref": 0.025, "comparables": {"filtres": {...}}, "gearing_cible": 0.4} : le CMPC, méthode indirecte, détaillé (comme WACC43). Avec "comparables", le bêta et le gearing sont les médianes de l'échantillon.
${FILE_ACTIONS}
- edit_file {"name": "...", "find": "texte exact à remplacer", "replace": "nouveau texte"} : retoucher un fichier.
- final {"report": "..."} : rendre ton rapport à Roré et terminer. 10 lignes au plus : les chiffres clés, le nom du fichier écrit, les limites.

Ta façon de travailler :
1. Lis d'abord le skill qui s'applique (use_skill), puis interroge la base : 3 à 8 demandes base43 suffisent.
2. Chaque chiffre vient de la base : cite la demande qui l'a produit (filtres, effectif). N'invente rien. Signale les limites de la base : la trésorerie manque (levier en dette brute), le statut groupe ou filiale est déduit des descriptions.
3. Écris le livrable dans un fichier Markdown de la mission (write_file) : la méthode, l'échantillon, les tableaux, les médianes, les sociétés écartées et pourquoi.
4. Réponds en français.

${context(ctx)}`;
}

/** Hares fait sa tâche sur la base 43 WACC et rend son rapport. */
async function runHares(ctx: TeamCtx, title: string, instructions: string): Promise<string> {
  const id = `hares-${Date.now().toString(36)}`;
  const t0 = Date.now();
  const usage: Usage = { tokens: 0 };
  let tools = 0;
  ctx.emit({ k: 'hire', id, role: 'hares', type: 'hares', name: 'Hares', task: cut(title || 'Base 43 WACC', 48), prompt: cut(instructions, 2000) });
  const messages: ChatMsg[] = [
    { role: 'system', content: haresPrompt(ctx) },
    { role: 'user', content: `Ta tâche, confiée par Roré :\n${instructions}` },
  ];
  const leave = (ok: boolean) => ctx.emit({ k: 'leave', who: id, ok, tokens: usage.tokens, tools, ms: Date.now() - t0 });
  try {
    for (let step = 0; step < ANALYST_STEPS; step++) {
      ctx.emit({ k: 'think', who: id });
      const { act: a, raw } = await think(ctx, messages, usage);
      messages.push({ role: 'assistant', content: raw });
      if (a.say.trim()) ctx.emit({ k: 'say', who: id, text: cut(a.say, 220) });
      if (a.action === 'final' || a.action === 'report') {
        const report = str(a.input.report ?? a.input.message ?? a.say, 20_000).trim() || 'Travail terminé.';
        ctx.emit({ k: 'report', who: id, text: report });
        leave(true);
        return report;
      }
      tools++;
      let result: string | null;
      if (a.action === 'base43' || a.action === 'wacc43' || a.action === 'base') {
        result = await act(ctx, id, 'Base43', a.input, () => askWacc43(a.input))
          .catch((e) => `La base 43 WACC n’a pas répondu : ${e instanceof Error ? e.message : e}`);
      } else result = await common(ctx, id, a);
      if (result === null) { tools--; result = 'Action inconnue. Actions possibles : base43, read_file, write_file, edit_file, use_skill, final.'; }
      messages.push({ role: 'user', content: `Résultat de ${a.action} :\n${clip(result, Math.max(MAX_RESULT, 6000))}` });
    }
    const report = 'J’ai atteint ma limite d’actions. Le travail fait est dans les fichiers de la mission.';
    ctx.emit({ k: 'report', who: id, text: report });
    leave(true);
    return report;
  } catch (e) {
    leave(false);
    throw e;
  }
}

// ── Roré, le chef ──
export function chefPrompt(ctx: TeamCtx): string {
  return `Tu es Roré, le chef de projet de l'open space : une équipe d'agents IA au service d'une responsable marketing et communication (ta patronne). Tout ce que tu fais s'affiche en direct dans un bureau en pixel art.
Nous sommes le ${today()}.
Ton équipe :
- Rook, le chercheur : la recherche et la veille sur internet avec Tavily (actualités récentes, sites précis, sources datées). Confie-lui la collecte d'informations fraîches : veille concurrentielle, actualité d'un secteur, revue de presse, sources à rassembler ;
- l'analyste : il cherche sur internet, analyse et rédige les rapports marketing et communication ;
- Hares, le financier : il interroge la base 43 WACC de ta patronne (sociétés cotées comparables, primes de risque pays, bêtas sectoriels, taux sans risque) et calcule médianes, multiples et CMPC. Confie-lui tout ce qui touche à la finance, à la valorisation, au coût du capital ou aux comparables.
Tu leur confies le travail avec "delegate" et tu reçois leur rapport.

${FORMAT}

Actions :
- plan {"steps": [{"text": "...", "status": "pending|in_progress|completed"}]} : écrire ou mettre à jour le plan (3 à 5 étapes courtes).
- delegate {"to": "rook", "analyste" ou "hares", "title": "2 à 4 mots", "instructions": "consignes précises : quoi chercher, quoi rendre, sous quelle forme, nom du fichier à écrire"} : confier une tâche à Rook, à l'analyste ou à Hares. Pour une veille suivie d'une analyse : Rook d'abord (il rassemble les sources), puis l'analyste (il analyse son fichier).
${FILE_ACTIONS}
- final {"message": "..."} : terminer la mission. 5 lignes au plus : ce qui a été fait, le nom du fichier rendu, la prochaine étape que tu conseilles.

Ta façon de travailler :
1. Pour une simple question ou une salutation, réponds directement avec final.
2. Sinon : plan, puis delegate (une tâche à la fois). Vérifie le rapport et le fichier (read_file) : cohérence, sources, chiffres, respect du tiroir. Demande une correction si besoin, puis mets le plan à jour et termine avec final.
3. Ne fais pas les recherches toi-même : tu organises, tu vérifies, tu assembles.
4. Si une information manque, fais l'hypothèse la plus raisonnable et dis-la.
5. Réponds en français, n'invente jamais de chiffres, cite les fichiers par leur nom.

${context(ctx)}`;
}

function toPlan(v: unknown): PlanItem[] {
  const arr = Array.isArray(v) ? v : [];
  const items = arr.map((x, n): PlanItem => {
    if (typeof x === 'string') return { text: cut(x, 90), status: n === 0 ? 'in_progress' : 'pending' };
    const o = (x ?? {}) as Record<string, unknown>;
    const st = String(o.status ?? '');
    return { text: cut(o.text ?? o.content ?? o.step ?? '', 90), status: st === 'completed' || st === 'done' ? 'completed' : st === 'in_progress' ? 'in_progress' : 'pending' };
  }).filter((p) => p.text);
  return items.slice(0, 8);
}

/**
 * Un tour de travail de Roré : la mission (ou une retouche). `history` est sa mémoire de la mission
 * (gardée entre les retouches). Renvoie son dernier message.
 */
export async function runChef(ctx: TeamCtx, history: ChatMsg[], userText: string): Promise<string> {
  if (!history.length) history.push({ role: 'system', content: chefPrompt(ctx) });
  else history[0] = { role: 'system', content: chefPrompt(ctx) };
  history.push({ role: 'user', content: history.length <= 1 ? `La mission :\n${userText}` : `Nouvelle demande de ta patronne (retouche ou suite) :\n${userText}` });
  const usage: Usage = { tokens: 0 };
  let plan: PlanItem[] = [];
  let lastSay = '';
  for (let step = 0; step < CHEF_STEPS; step++) {
    for (const note of ctx.takeNotes()) history.push({ role: 'user', content: `Précision de ta patronne, en cours de route : ${note}` });
    ctx.emit({ k: 'think', who: 'chef' });
    const { act: a, raw } = await think(ctx, history, usage);
    history.push({ role: 'assistant', content: raw });
    if (a.say.trim()) { lastSay = a.say.trim(); ctx.emit({ k: 'say', who: 'chef', text: cut(lastSay, 400) }); }
    const i = a.input;
    let result: string | null;
    switch (a.action) {
      case 'final': {
        const msg = str(i.message ?? i.report ?? a.say, 8000).trim() || lastSay || 'C’est fait.';
        if (plan.length) ctx.emit({ k: 'plan', items: plan.map((p) => ({ ...p, status: 'completed' })) });
        return msg;
      }
      case 'plan': {
        const items = toPlan(i.steps ?? i.items ?? i.plan);
        if (items.length) { plan = items; ctx.emit({ k: 'plan', items }); }
        result = items.length ? 'Plan noté.' : 'Plan vide : donne "steps".';
        break;
      }
      case 'delegate':
      case 'delegate_to_analyst':
      case 'analyst':
      case 'hares':
      case 'delegate_to_hares':
      case 'rook':
      case 'delegate_to_rook': {
        const instructions = str(i.instructions ?? i.task ?? i.prompt, 6000).trim();
        if (!instructions) { result = 'Il manque « instructions ».'; break; }
        const to = `${a.action} ${str(i.to ?? i.agent ?? i.who, 40)}`;
        const who = /hares|financ/i.test(to) ? 'hares' : /rook|cherch|veille/i.test(to) ? 'rook' : 'analyste';
        const task = str(i.title ?? i.description, 60);
        const report = who === 'hares' ? await runHares(ctx, task, instructions)
          : who === 'rook' ? await runRook(ctx, task, instructions)
            : await runAnalyst(ctx, task, instructions);
        result = `Rapport ${who === 'hares' ? 'de Hares' : who === 'rook' ? 'de Rook' : "de l'analyste"} :\n${report}`;
        break;
      }
      default:
        result = await common(ctx, 'chef', a);
        if (result === null) result = 'Action inconnue. Actions possibles : plan, delegate, read_file, write_file, use_skill, final.';
    }
    history.push({ role: 'user', content: `Résultat de ${a.action} :\n${clip(result)}` });
  }
  return lastSay || 'J’ai atteint ma limite d’étapes : le travail fait est dans les fichiers de la mission.';
}

/** Un message d'erreur lisible pour l'utilisatrice. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
