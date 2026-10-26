// Le bureau, côté navigateur (il remplace le serveur local de la version d'origine). Il reçoit les demandes
// de l'interface (ClientMsg), fait travailler Roré et l'analyste, et renvoie au bureau ce qui se passe
// (ServerMsg), exactement comme le faisait le pont avec Claude Code : le reste du bureau ne voit pas la différence.
// Tout est rangé dans ce navigateur (IndexedDB) : missions, fichiers, enregistrements. Rien sur le serveur.
import { countStats, emptyStats, NAMES } from '../../shared/activity.ts';
import type { ClientMsg, FileInfo, Logged, MissionInfo, OfficeEvent, ServerMsg, Settings, TeamEntry, VersionInfo } from '../../shared/protocol.ts';
import { playReplay } from '../net/link.ts';
import { useOffice } from '../state/store.ts';
import { runChef, errorText, setLightBudget, type MissionFiles, type TeamCtx } from './agent.ts';
import { api, ApiError, availableModels, claude, getClaudeKey, getCode, modelInfo, MODELS, ollama, setOllamaModels, type ChatMsg } from './api.ts';
import { dbDel, dbGet, dbSet, lsGet, lsSet } from './db.ts';
import { download, zip } from './zip.ts';

interface FileRec { content: string; at: number; by: string; versions: { at: number; by: string; content: string }[] }
type FileMap = Record<string, FileRec>;

interface Current {
  mission: MissionInfo;
  log: Logged[];
  files: FileMap;
  history: ChatMsg[];
  names: Set<string>;
  ctrl: AbortController | null;
  notes: string[];
  asks: Map<string, (allow: boolean) => void>;
  busySince: number | null;
}

const MAX_MISSIONS = 30;
const MAX_VERSIONS = 8;
const MAX_LOG = 3000;
export const RULES_TEMPLATE = `Qui je suis :
(par exemple : « Je suis responsable marketing et communication chez … Nos clients sont … Nos concurrents principaux sont … »)

Comment travailler pour moi :
- Réponds-moi en français, simplement.
- Va droit au but : je veux des livrables prêts à servir.
`;

const DEFAULT_SETTINGS: Settings = { model: MODELS[0].id, permission: 'auto' };

function titleOf(prompt: string) {
  const first = prompt.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  let t = first.replace(/[.!?:;,]+$/, '');
  if (t.length > 46) t = t.slice(0, 46).replace(/\s+\S*$/, '') + '…';
  return t ? t[0].toUpperCase() + t.slice(1) : 'Mission';
}

/** Un nom de fichier simple et sûr (pas de dossier, pas de caractère bizarre). */
export function safeName(raw: string) {
  let n = String(raw ?? '').split(/[\\/]/).pop()!.normalize('NFC').replace(/[^\w.\-À-ÿ ]+/g, '').replace(/\s+/g, '-').replace(/^\.+/, '').slice(0, 80);
  if (!n) n = 'rapport.md';
  if (!/\.[a-z0-9]{1,6}$/i.test(n)) n += '.md';
  return n;
}

const ext = (n: string) => (n.split('.').pop() ?? '').toLowerCase();

class LocalBureau {
  settings: Settings = { ...DEFAULT_SETTINGS };
  missions: MissionInfo[] = [];
  current: Current | null = null;
  /** sur ton ordinateur, avec l'IA gratuite d'Ollama (au lieu de Cloudflare) */
  local = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private out(m: ServerMsg) { useOffice.getState().receive(m); }
  private get settingsKey() { return this.local ? 'settings-ollama' : 'settings'; }
  private models() { return availableModels(this.local); }

  /** Démarre le bureau dans le navigateur : en ligne (Cloudflare), ou sur ton ordinateur avec Ollama. */
  async init(mode: 'cloud' | 'ollama' = 'cloud') {
    this.local = mode === 'ollama';
    setLightBudget(this.local);
    if (this.local) setOllamaModels(await ollama.models());
    this.settings = { ...DEFAULT_SETTINGS, ...lsGet<Partial<Settings>>(this.settingsKey, {}) };
    const models = this.models();
    if (!models.some((m) => m.id === this.settings.model)) this.settings.model = models[0]?.id ?? (this.local ? '' : DEFAULT_SETTINGS.model);
    const list = await dbGet<MissionInfo[]>('missions');
    this.missions = Array.isArray(list) ? list.map((m) => (m.status === 'working' ? { ...m, status: 'stopped' as const } : m)) : [];
    useOffice.setState({ connection: 'live', engine: this.local ? 'ollama' : 'cloud', send: (m: ClientMsg) => { void this.handle(m).catch((e) => useOffice.getState().toast('error', errorText(e))); } });
    this.hello(null);
  }

  private hello(current: { mission: MissionInfo; log: Logged[] } | null) {
    const found = !this.local || this.models().length > 0;
    this.out({ t: 'hello', claude: { found, version: this.modelLabel(), path: this.engineLabel() }, dir: 'ce navigateur', settings: this.settings, quota: null, missions: this.list(), current });
  }

  /** Relit la liste des modèles d'Ollama (après une installation, par exemple). */
  async refreshOllama() {
    if (!this.local) return;
    setOllamaModels(await ollama.models());
    const models = this.models();
    if (!models.some((m) => m.id === this.settings.model)) { this.settings.model = models[0]?.id ?? ''; lsSet(this.settingsKey, this.settings); }
    this.hello(this.current ? { mission: this.current.mission, log: this.current.log } : null);
  }

  modelLabel() {
    const info = modelInfo(this.settings.model);
    if (info?.provider === 'ollama') return info.id.slice('ollama:'.length);
    return MODELS.find((m) => m.id === this.settings.model)?.label.split(' (')[0].replace('IA gratuite · ', '') ?? this.settings.model;
  }
  engineLabel() {
    const p = modelInfo(this.settings.model)?.provider;
    return p === 'claude' ? 'Claude (ta clé API)' : p === 'ollama' || this.local ? 'Ollama, sur ton ordinateur' : 'Cloudflare Workers AI';
  }
  list() { return [...this.missions].sort((a, b) => b.createdAt - a.createdAt); }
  rules() { return lsGet<string>('rules', '').replace(/\(par exemple[^)]*\)/g, '').trim(); }

  async handle(m: ClientMsg) {
    switch (m.t) {
      case 'start': return this.start(m.prompt);
      case 'say': return this.say(m.text);
      case 'stop': return this.stop();
      case 'answer': { const r = this.current?.asks.get(m.requestId); if (r) r(m.allow === true); return; }
      case 'new': return this.close();
      case 'open': return this.open(m.missionId, m.file);
      case 'open_root': useOffice.setState({ modal: { kind: m.rules ? 'rules' : 'drawer' } }); return;
      case 'read': {
        const { text, truncated } = await this.readText(m.missionId, m.file, m.version);
        this.out({ t: 'file_text', missionId: m.missionId, file: m.file, text, truncated, version: m.version });
        return;
      }
      case 'versions': this.out({ t: 'versions', missionId: m.missionId, file: m.file, list: await this.versions(m.missionId, m.file) }); return;
      case 'team_history': this.out({ t: 'team_history', entries: await this.teamHistory() }); return;
      case 'replay': {
        const mission = this.missions.find((x) => x.id === m.missionId);
        const log = await this.logOf(m.missionId);
        if (!mission || !log.length) throw new Error('Cette mission n’a pas été enregistrée.');
        playReplay(mission, log, 1);
        return;
      }
      case 'settings': {
        const p = m.settings ?? {};
        this.settings = {
          model: typeof p.model === 'string' && this.models().some((x) => x.id === p.model) ? p.model : this.settings.model,
          permission: p.permission === 'ask' || p.permission === 'auto' ? p.permission : this.settings.permission,
        };
        lsSet(this.settingsKey, this.settings);
        this.out({ t: 'settings', settings: this.settings });
        this.hello(this.current ? { mission: this.current.mission, log: this.current.log } : null);
        return;
      }
    }
  }

  // ── Les missions ──
  async start(prompt: string) {
    const text = prompt.trim();
    if (!text) throw new Error('Dis à Roré ce que tu veux.');
    if (this.local) {
      if (!this.models().length) await this.refreshOllama();
      if (!this.settings.model) { useOffice.setState({ settingsOpen: true }); throw new Error('Ollama n’est pas lancé, ou n’a aucun modèle. Ouvre l’application Ollama, installe un modèle (par exemple : ollama pull qwen3:4b), puis réessaie.'); }
    } else if (!getCode()) { useOffice.setState({ settingsOpen: true }); throw new Error('Entre d’abord le code d’accès dans les réglages.'); }
    if (modelInfo(this.settings.model)?.provider === 'claude' && !getClaudeKey()) { useOffice.setState({ settingsOpen: true }); throw new Error('Connecte-toi d’abord à Claude dans les réglages, ou choisis l’IA gratuite.'); }
    if (this.current?.mission.status === 'working') throw new Error('L’équipe est déjà sur une mission. Attends qu’elle la rende, ou arrête-la.');
    if (this.current) this.close();
    const mission: MissionInfo = {
      id: 'm' + Date.now().toString(36), title: titleOf(text), prompt: text, folder: '', createdAt: Date.now(), workMs: 0,
      status: 'working', stats: emptyStats(), files: [], model: this.modelLabel(),
    };
    this.missions = [...this.missions, mission];
    const cur: Current = { mission, log: [], files: {}, history: [], names: new Set(), ctrl: null, notes: [], asks: new Map(), busySince: null };
    this.current = cur;
    await this.trim();
    this.out({ t: 'mission', mission });
    void this.turn(cur, text);
  }

  say(text: string) {
    const cur = this.current;
    const t = text.trim();
    if (!cur) throw new Error('Lance d’abord une mission.');
    if (!t) return;
    if (cur.mission.status === 'working') {
      cur.notes.push(t);
      this.record(cur, { k: 'start', text: t });
      return;
    }
    void this.turn(cur, t);
  }

  private async turn(cur: Current, text: string) {
    const m = cur.mission;
    const ctrl = new AbortController();
    cur.ctrl = ctrl;
    cur.busySince = Date.now();
    if (m.status !== 'working') { m.status = 'working'; m.endedAt = undefined; this.out({ t: 'mission', mission: m }); }
    this.record(cur, { k: 'start', text });
    this.record(cur, { k: 'init', model: this.modelLabel(), auth: this.engineLabel() });
    const ctx: TeamCtx = {
      emit: (ev) => { if (this.current === cur && !ctrl.signal.aborted) this.record(cur, ev); },
      signal: ctrl.signal,
      model: this.settings.model,
      permission: this.settings.permission,
      files: this.filesOf(cur),
      missionTitle: m.title,
      rules: this.rules(),
      ask: (who, tool, label, detail) => new Promise<boolean>((resolve) => {
        const requestId = 'q' + Math.random().toString(36).slice(2, 9);
        cur.asks.set(requestId, (allow) => { cur.asks.delete(requestId); this.record(cur, { k: 'ask_done', requestId, allow }); resolve(allow); });
        ctrl.signal.addEventListener('abort', () => { if (cur.asks.delete(requestId)) resolve(false); });
        this.record(cur, { k: 'ask', who, requestId, tool, label, detail, full: !detail });
      }),
      pickName: () => {
        const name = NAMES.analyse.find((n) => !cur.names.has(n)) ?? `Analyste ${cur.names.size + 1}`;
        cur.names.add(name);
        return name;
      },
      takeNotes: () => cur.notes.splice(0),
      chat: (messages, json) => {
        const provider = modelInfo(this.settings.model)?.provider;
        if (provider === 'claude') return claude.chat(this.settings.model, messages, ctrl.signal);
        if (provider === 'ollama') return ollama.chat(this.settings.model, messages, ctrl.signal, json);
        return api.chat(this.settings.model, messages, ctrl.signal, json);
      },
    };
    const t0 = Date.now();
    try {
      const final = await runChef(ctx, cur.history, text);
      this.finish(cur, true, final, Date.now() - t0, false);
    } catch (e) {
      const stopped = ctrl.signal.aborted;
      if (!stopped) this.record(cur, { k: 'error', message: errorText(e) });
      if (e instanceof ApiError && (e.status === 401 || e.status === 507)) useOffice.setState({ settingsOpen: true });
      this.finish(cur, false, stopped ? 'Mission arrêtée.' : errorText(e), Date.now() - t0, stopped);
    }
  }

  private finish(cur: Current, ok: boolean, text: string, ms: number, stopped: boolean) {
    const m = cur.mission;
    if (m.status !== 'working') return;
    // ceux qui travaillaient encore quittent leur poste
    const present = new Set<string>();
    for (const l of cur.log) { if (l.ev.k === 'hire') present.add(l.ev.id); if (l.ev.k === 'leave') present.delete(l.ev.who); }
    for (const id of present) this.record(cur, { k: 'leave', who: id, ok: false, tokens: 0, tools: 0, ms: 0 }, true);
    for (const [id, r] of cur.asks) { r(false); cur.asks.delete(id); }
    const now = Date.now();
    m.status = ok ? 'done' : stopped ? 'stopped' : 'error';
    m.endedAt = now;
    if (cur.busySince) m.workMs += now - cur.busySince;
    cur.busySince = null;
    m.final = text.slice(0, 20_000);
    this.record(cur, { k: 'end', ok, text: m.final, ms, stopped }, true);
    this.out({ t: 'mission', mission: m });
    this.persist(cur, true);
  }

  stop() {
    const cur = this.current;
    if (!cur || cur.mission.status !== 'working') return;
    cur.ctrl?.abort();
    this.finish(cur, false, 'Mission arrêtée.', 0, true);
  }

  close() {
    const cur = this.current;
    if (!cur) return;
    if (cur.mission.status === 'working') this.stop();
    this.persist(cur, true);
    this.current = null;
    this.out({ t: 'closed', missionId: cur.mission.id });
  }

  // ── L'enregistrement ──
  private record(cur: Current, ev: OfficeEvent, force = false) {
    if (!force && cur.mission.status !== 'working' && ev.k !== 'start') return;
    const at = Date.now();
    countStats(cur.mission.stats, ev);
    this.out({ t: 'ev', missionId: cur.mission.id, at, ev });
    if (ev.k === 'typing') return;
    cur.log.push({ at, ev });
    if (cur.log.length > MAX_LOG) cur.log.splice(0, cur.log.length - MAX_LOG);
    this.persist(cur);
  }

  /** Sauvegarde groupée : au plus une fois toutes les 2 secondes (ou tout de suite à la fin d'une mission). */
  private persist(cur: Current, now = false) {
    const run = () => {
      this.saveTimer = null;
      void dbSet('missions', this.missions);
      void dbSet(`log:${cur.mission.id}`, cur.log);
      void dbSet(`files:${cur.mission.id}`, cur.files);
      void dbSet(`chat:${cur.mission.id}`, cur.history);
    };
    if (now) { if (this.saveTimer) clearTimeout(this.saveTimer); run(); return; }
    if (!this.saveTimer) this.saveTimer = setTimeout(run, 2000);
  }

  /** On ne garde que les missions récentes (moins de données). */
  private async trim() {
    const sorted = this.list();
    for (const old of sorted.slice(MAX_MISSIONS)) {
      await Promise.all([dbDel(`log:${old.id}`), dbDel(`files:${old.id}`), dbDel(`chat:${old.id}`)]);
    }
    this.missions = sorted.slice(0, MAX_MISSIONS);
    await dbSet('missions', this.missions);
  }

  // ── Les fichiers de la mission ──
  private filesOf(cur: Current): MissionFiles {
    return {
      list: () => Object.keys(cur.files),
      read: (name) => cur.files[safeName(name)]?.content ?? cur.files[name]?.content ?? null,
      write: (raw, content, by) => {
        const name = safeName(raw);
        const prev = cur.files[name];
        const now = Date.now();
        const versions = prev ? [...prev.versions, { at: prev.at, by: prev.by, content: prev.content }].slice(-MAX_VERSIONS) : [];
        cur.files[name] = { content, at: now, by, versions };
        const info: FileInfo = { path: name, name, ext: ext(name), size: new Blob([content]).size, at: now, by };
        const files = cur.mission.files;
        const i = files.findIndex((f) => f.path === name);
        if (i >= 0) files[i] = info; else files.push(info);
        this.record(cur, { k: 'file', file: info, isNew: i < 0 });
        return name;
      },
    };
  }

  private async filesFor(missionId: string): Promise<FileMap> {
    if (this.current?.mission.id === missionId) return this.current.files;
    return (await dbGet<FileMap>(`files:${missionId}`)) ?? {};
  }

  private async logOf(missionId: string): Promise<Logged[]> {
    if (this.current?.mission.id === missionId) return this.current.log;
    return (await dbGet<Logged[]>(`log:${missionId}`)) ?? [];
  }

  async readText(missionId: string, file: string, version?: string) {
    const f = (await this.filesFor(missionId))[file];
    if (!f) throw new Error('Ce fichier n’existe plus.');
    const v = version ? f.versions.find((x) => String(x.at) === version) : null;
    return { text: (v ?? f).content, truncated: false };
  }

  async versions(missionId: string, file: string): Promise<VersionInfo[]> {
    const f = (await this.filesFor(missionId))[file];
    if (!f) return [];
    const all = [{ at: f.at, by: f.by, content: f.content }, ...f.versions.slice().reverse()];
    return all.map((v, i) => ({ id: i === 0 ? '' : String(v.at), at: v.at, size: v.content.length, by: v.by }));
  }

  /** « Ouvrir » : télécharge le fichier, ou toute la mission en .zip. */
  async open(missionId: string, file?: string) {
    const files = await this.filesFor(missionId);
    const m = this.missions.find((x) => x.id === missionId);
    if (file) {
      const f = files[file];
      if (!f) throw new Error('Ce fichier n’existe plus.');
      download(file, f.content, ext(file) === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8');
      return;
    }
    const list = Object.entries(files).map(([name, f]) => ({ name, text: f.content }));
    if (m?.final) list.push({ name: 'message-de-lilou.md', text: `# ${m.title}\n\n${m.final}\n` });
    if (!list.length) throw new Error('Cette mission n’a encore rien produit.');
    download(`${safeName(m?.title ?? 'mission').replace(/\.md$/, '')}.zip`, zip(list));
  }

  async teamHistory(): Promise<TeamEntry[]> {
    const out: TeamEntry[] = [];
    for (const m of this.list().slice(0, 20)) {
      const log = await this.logOf(m.id);
      const byId = new Map<string, TeamEntry>();
      for (const l of log) {
        const ev = l.ev;
        if (ev.k === 'hire') byId.set(ev.id, { missionId: m.id, missionTitle: m.title, at: l.at, id: ev.id, name: ev.name, role: ev.role, task: ev.task, status: 'working', tools: 0, tokens: 0, ms: 0, report: '' });
        else if (ev.k === 'report') { const e = byId.get(ev.who); if (e) e.report = ev.text.slice(0, 600); }
        else if (ev.k === 'leave') { const e = byId.get(ev.who); if (e) Object.assign(e, { status: ev.ok ? 'done' : 'failed', tools: ev.tools, tokens: ev.tokens, ms: ev.ms || l.at - e.at }); }
      }
      out.push(...[...byId.values()].reverse());
    }
    return out;
  }

  /** Le texte d'un fichier (pour l'aperçu des pages HTML). */
  async fileText(missionId: string, file: string) { return (await this.filesFor(missionId))[file]?.content ?? ''; }

  /** Vérifie le code d'accès auprès du Worker. */
  async check(): Promise<string | null> {
    try { await api.ping(); return null; } catch (e) { return errorText(e); }
  }
}

export const bureau = new LocalBureau();
