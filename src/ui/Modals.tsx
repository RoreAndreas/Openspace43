// Les fenêtres par-dessus le bureau : la carte du rendu final, la lecture d'un fichier,
// les missions précédentes, les réglages, et les petites notifications.
import { useMemo, useRef, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { isWorkTime, savePref, useOffice, type WorkHours } from '../state/store.ts';
import { api, availableModels, claude, getClaudeKey, getCode, HEAVY_MODEL, LIGHT_MODELS, modelInfo, MODELS, ollama, OLLAMA_PREFIX, setClaudeKey, setCode } from '../local/api.ts';
import { bureau } from '../local/bureau.ts';
import { pullLever } from '../net/link.ts';
import { dbClear, lsClear } from '../local/db.ts';
import { download } from '../local/zip.ts';
import { backupData, restoreData } from './Extras.tsx';
import { FileList } from './Panel.tsx';
import { fmtDate, fmtDuration, plural } from './format.ts';
import { mdToHtml } from './md.ts';
import { tidy } from './tidy.ts';

/** La mission est rendue : Roré te présente le travail de l'équipe. */
export function FinalCard() {
  const show = useOffice((s) => s.showFinal);
  const final = useOffice((s) => s.final);
  const mission = useOffice((s) => s.mission);
  const stats = useOffice((s) => s.stats);
  const workMs = useOffice((s) => s.workMs);
  const files = useOffice((s) => s.files.length);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  const html = useMemo(() => (final?.text ? mdToHtml(tidy(final.text)) : ''), [final?.text]);
  if (!show || !final || !mission) return null;
  const close = () => useOffice.setState({ showFinal: false });
  return (
    <div className="final" role="dialog" aria-label="Le rendu de la mission">
      <button className="close" onClick={close} aria-label="Fermer">×</button>
      <div className="final-head">
        <span className="final-badge"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <div>
          <b>Mission accomplie</b>
          <span>{mission.title} · {fmtDuration(workMs)}</span>
        </div>
      </div>
      <div className="final-stats">
        <span>🤖 {plural(stats.agents, 'agent', 'agents')}</span>
        <span>🔎 {plural(stats.searches, 'recherche', 'recherches')}</span>
        <span>🌐 {plural(stats.pages, 'page lue', 'pages lues')}</span>
        <span>📄 {plural(files, 'rendu', 'rendus')}</span>
      </div>
      {html && <div className="md final-text" dangerouslySetInnerHTML={{ __html: html }} />}
      {files > 0 && <FileList />}
      {!replaying && (
        <div className="final-actions">
          <button className="btn" onClick={() => send({ t: 'open', missionId: mission.id })}>Tout télécharger (.zip)</button>
          <button className="btn" onClick={() => { close(); useOffice.setState({ draft: ' ' }); }}>Demander une retouche</button>
          <button className="btn primary" onClick={() => { sfx('click'); close(); send({ t: 'new' }); }}>Nouvelle mission</button>
        </div>
      )}
    </div>
  );
}

/** Lire un rendu (rapport, tableau…) sans quitter le bureau. */
export function Viewer() {
  const viewer = useOffice((s) => s.viewer);
  const send = useOffice((s) => s.send);
  const agents = useOffice((s) => s.agents);
  const versions = useOffice((s) => (s.viewer ? s.versions[`${s.viewer.missionId}|${s.viewer.file}`] : undefined));
  const html = useMemo(() => {
    if (!viewer?.text) return '';
    const ext = viewer.file.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'md' || ext === 'markdown') return mdToHtml(viewer.text);
    if (['html', 'htm', 'css', 'js', 'ts', 'py', 'json', 'svg'].includes(ext)) return '';
    if (ext === 'csv') {
      const sep = viewer.text.includes(';') && !viewer.text.split('\n')[0].includes(',') ? ';' : ',';
      const rows = viewer.text.trim().split('\n').slice(0, 200).map((r) => r.split(sep));
      const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/^"|"$/g, '');
      return `<table>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
    }
    return '';
  }, [viewer]);
  if (!viewer) return null;
  const close = () => useOffice.setState({ viewer: null });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{viewer.file}</b>
          <div className="row">
            {versions && versions.length > 1 && (
              <select
                className="versions"
                title="L’historique des versions de ce fichier"
                value={viewer.version ?? ''}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  useOffice.setState({ viewer: { ...viewer, text: undefined, version: v } });
                  send({ t: 'read', missionId: viewer.missionId, file: viewer.file, version: v });
                }}
              >
                <option value="">Version actuelle</option>
                {versions.slice(1).map((v, i) => (
                  <option key={v.id} value={v.id}>
                    v{versions.length - 1 - i} · {new Date(v.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {v.by === 'chef' ? 'Roré' : agents[v.by]?.name ?? 'l’équipe'}
                  </option>
                ))}
              </select>
            )}
            <button className="btn small" onClick={() => send({ t: 'open', missionId: viewer.missionId, file: viewer.file })}>Télécharger</button>
            <button className="close" onClick={close} aria-label="Fermer">×</button>
          </div>
        </div>
        <div className="modal-body">
          {viewer.text === undefined ? <p className="muted">Ouverture…</p>
            : html ? <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
              : <pre className="plain">{viewer.text}</pre>}
          {viewer.truncated && <p className="small muted">(Fichier long : seul le début est affiché.)</p>}
        </div>
      </div>
    </div>
  );
}

/** Les missions précédentes : on peut les rejouer (pour filmer) ou ouvrir leur dossier. */
export function History() {
  const open = useOffice((s) => s.historyOpen);
  const missions = useOffice((s) => s.missions);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  if (!open) return null;
  const close = () => useOffice.setState({ historyOpen: false });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal history" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>Missions précédentes</b><button className="close" onClick={close} aria-label="Fermer">×</button></div>
        <div className="modal-body">
          {connection !== 'live' && <p className="muted">Chargement du bureau…</p>}
          {connection === 'live' && !missions.length && <p className="muted">Aucune mission pour l’instant. La première t’attend en bas de l’écran.</p>}
          {missions.map((m) => (
            <div key={m.id} className="hist">
              <div className="hist-id">
                <b>{m.title}</b>
                <span className="small muted">
                  {fmtDate(m.createdAt)} · {fmtDuration(m.workMs)} · {plural(m.stats.agents, 'agent', 'agents')} · {plural(m.files.length, 'rendu', 'rendus')}
                  {m.status === 'working' ? ' · en cours' : m.status === 'done' ? '' : m.status === 'stopped' ? ' · arrêtée' : ' · en erreur'}
                </span>
              </div>
              <div className="row">
                <button className="btn small" title="Rejoue la mission (sans relancer l’équipe) : parfait pour filmer" onClick={() => { sfx('click'); close(); send({ t: 'replay', missionId: m.id }); }}>▶ Rejouer</button>
                <button className="btn small ghost" onClick={() => send({ t: 'open', missionId: m.id })}>.zip</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Le code d'accès : sans lui, le serveur Cloudflare refuse de faire travailler l'équipe. */
function AccessCode() {
  const [code, setC] = useState(getCode());
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | string>('idle');
  const check = async () => {
    setCode(code);
    setState('checking');
    try { await api.ping(); setState('ok'); sfx('check'); } catch (e) { setState(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <form className="field" onSubmit={(e) => { e.preventDefault(); void check(); }}>
      <span>Le code d’accès</span>
      <div className="drawer-add">
        <input id="access-code" className="text" type="password" autoComplete="current-password" placeholder="Le code choisi sur Cloudflare" value={code} onChange={(e) => { setC(e.target.value); setState('idle'); }} />
        <button className="btn small primary" type="submit" disabled={!code.trim() || state === 'checking'}>{state === 'checking' ? 'Vérification…' : 'Enregistrer'}</button>
      </div>
      {state === 'ok' && <small className="ok-text">✓ Code accepté : l’équipe est prête.</small>}
      {state !== 'idle' && state !== 'ok' && state !== 'checking' && <small className="err-text">{state}</small>}
      {state === 'idle' && <small className="muted">Il reste dans ce navigateur. Il protège ton quota gratuit : personne d’autre ne peut faire travailler l’équipe.</small>}
    </form>
  );
}

/** « Se connecter à Claude » (version Cloudflare) : ta clé API Claude, créée avec ton compte Claude. */
function ClaudeLogin() {
  const send = useOffice((s) => s.send);
  const model = useOffice((s) => s.settings.model);
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(getClaudeKey());
  const [state, setState] = useState<'idle' | 'checking' | string>('idle');
  const connect = async () => {
    setState('checking');
    try {
      await claude.check(key);
      setClaudeKey(key);
      setSaved(key.trim());
      setKey('');
      setState('idle');
      sfx('check');
      send({ t: 'settings', settings: { model: 'claude-sonnet-5-5' } });
    } catch (e) { setState(e instanceof Error ? e.message : String(e)); }
  };
  const disconnect = () => {
    setClaudeKey('');
    setSaved('');
    if (modelInfo(model)?.provider === 'claude') send({ t: 'settings', settings: { model: MODELS[0].id } });
  };
  return (
    <div className="field claude-login">
      <span>Claude</span>
      {saved ? (
        <div className="drawer-add">
          <span className="ok-text">✓ Connectée à Claude (clé …{saved.slice(-4)})</span>
          <button className="btn small ghost" onClick={disconnect}>Se déconnecter</button>
        </div>
      ) : (
        <form className="drawer-add" onSubmit={(e) => { e.preventDefault(); void connect(); }}>
          <input id="claude-key" className="text" type="password" autoComplete="off" placeholder="Ta clé API Claude (sk-ant-…)" value={key} onChange={(e) => { setKey(e.target.value); setState('idle'); }} />
          <button className="btn small primary" type="submit" disabled={!key.trim() || state === 'checking'}>{state === 'checking' ? 'Vérification…' : 'Se connecter à Claude'}</button>
        </form>
      )}
      {state !== 'idle' && state !== 'checking' && <small className="err-text">{state}</small>}
      <small className="muted">Crée la clé avec ton compte Claude sur <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer">platform.claude.com</a>. L’usage est facturé à part, à l’usage (ton abonnement Pro ou Max ne peut pas servir ici). La clé reste dans ce navigateur et part directement chez Claude.</small>
    </div>
  );
}

/** Installer un modèle léger dans Ollama, d'un clic (il se télécharge sur ton ordinateur). */
function OllamaInstall() {
  const model = useOffice((s) => s.settings.model);
  const send = useOffice((s) => s.send);
  const [job, setJob] = useState<{ name: string; done: number; status: string } | null>(null);
  const [err, setErr] = useState('');
  const installed = new Set(availableModels(true).map((m) => m.id.slice(OLLAMA_PREFIX.length)));
  const heavy = (modelInfo(model)?.size ?? 0) > HEAVY_MODEL;
  const install = async (name: string) => {
    setErr('');
    setJob({ name, done: 0, status: 'Démarrage…' });
    try {
      await ollama.pull(name, (done, status) => setJob({ name, done, status }));
      await bureau.refreshOllama();
      send({ t: 'settings', settings: { model: OLLAMA_PREFIX + name } });
      sfx('check');
      setJob(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setJob(null);
    }
  };
  return (
    <div className="field">
      <span>Installer un modèle léger</span>
      {heavy && <small className="err-text">Le modèle choisi est très lourd : sur un ordinateur portable, il risque de manquer de mémoire. Installe plutôt un modèle léger.</small>}
      <div className="row">
        {LIGHT_MODELS.map((m) => installed.has(m.name)
          ? <span key={m.name} className="ok-text small">✓ {m.label} : installé</span>
          : <button key={m.name} className="btn small primary" disabled={!!job} onClick={() => void install(m.name)}>⬇ Installer {m.label}</button>)}
      </div>
      {job && (
        <>
          <div className="progress"><i style={{ width: `${Math.round(job.done * 100)}%` }} /></div>
          <small className="muted">{job.name} : {job.done > 0 ? `${Math.round(job.done * 100)} %` : job.status}. Reste sur cette page : le téléchargement prend quelques minutes.</small>
        </>
      )}
      {err && <small className="err-text">{err}</small>}
    </div>
  );
}

/** Le levier, en version réglages : Claude ou l'IA gratuite. */
function Brain() {
  const engine = useOffice((s) => s.engine);
  const model = useOffice((s) => s.settings.model);
  const free = engine === 'ollama' || (engine === 'cloud' && modelInfo(model)?.provider !== 'claude');
  const claudeName = engine === 'cloud' ? 'Claude (ta clé API)' : 'Claude (ton compte, avec Claude Code)';
  const freeName = engine === 'cloud' ? 'IA gratuite (Cloudflare)' : 'IA gratuite (Ollama, sur ton PC)';
  return (
    <div className="field">
      <span>Le cerveau de l’équipe (le levier, à côté du serveur)</span>
      <div className="seg brain">
        <button className={!free ? 'on claude' : ''} onClick={() => { if (free) pullLever(); }}>🟠 {claudeName}</button>
        <button className={free ? 'on free' : ''} onClick={() => { if (!free) pullLever(); }}>🟢 {freeName}</button>
      </div>
      {engine !== 'cloud' && <small className="muted">Sur ton ordinateur, changer de cerveau recharge le bureau (entre deux missions).</small>}
    </div>
  );
}

const CLAUDE_CODE_MODELS: [string, string][] = [['sonnet', 'Sonnet (rapide, recommandé)'], ['opus', 'Opus (le plus fin)'], ['haiku', 'Haiku (éclair, économe)'], ['', 'Le modèle par défaut de Claude Code']];

const DAYS: [number, string][] = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [0, 'Dim']];
const hourLabel = (h: number) => (h === 24 ? 'minuit' : `${h} h`);

/** Les heures de travail : en dehors, les collègues sortent prendre l'air (Dehors). Pendant, seul Roré sort. */
function WorkHoursField() {
  const hours = useOffice((s) => s.workHours);
  const set = (h: WorkHours) => { useOffice.setState({ workHours: h }); savePref('workHours', h); };
  const toggleDay = (d: number) => set({ ...hours, days: hours.days.includes(d) ? hours.days.filter((x) => x !== d) : [...hours.days, d] });
  const now = isWorkTime(hours);
  return (
    <div className="field">
      <span>Les heures de travail</span>
      <div className="row">
        <span className="muted">De</span>
        <select aria-label="Début" value={hours.start} onChange={(e) => set({ ...hours, start: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
        <span className="muted">à</span>
        <select aria-label="Fin" value={hours.end} onChange={(e) => set({ ...hours, end: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </select>
      </div>
      <div className="row">
        {DAYS.map(([d, l]) => (
          <label key={d} className="radio"><input type="checkbox" checked={hours.days.includes(d)} onChange={() => toggleDay(d)} /> {l}</label>
        ))}
      </div>
      <small className="muted">En dehors de ces heures, Rook, Merlain et Hares sortent prendre l’air (🌿 Dehors) avant de rentrer. Les jours non travaillés, le bureau est vide, sauf Boulon en veille. Pendant, seul Roré sort. En ce moment : {now ? 'on travaille' : 'temps libre'}.</small>
    </div>
  );
}

export function SettingsPanel() {
  const engine = useOffice((s) => s.engine);
  const claudeInfo = useOffice((s) => s.claude);
  const open = useOffice((s) => s.settingsOpen);
  const settings = useOffice((s) => s.settings);
  const send = useOffice((s) => s.send);
  const cameraAuto = useOffice((s) => s.cameraAuto);
  const toast = useOffice((s) => s.toast);
  const [confirmErase, setConfirmErase] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!open) return null;
  const close = () => { setConfirmErase(false); useOffice.setState({ settingsOpen: false }); };
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>Réglages du bureau</b><button className="close" onClick={close} aria-label="Fermer">×</button></div>
        <div className="modal-body">
          <Brain />
          {engine === 'ollama' ? (
            <>
              <div className="field">
                <span>Ollama, l’IA gratuite sur cet ordinateur</span>
                {claudeInfo?.found
                  ? <small className="ok-text">✓ Ollama répond : l’équipe travaille gratuitement, sur ton ordinateur.</small>
                  : <small className="err-text">Ollama ne répond pas, ou n’a aucun modèle. Ouvre l’application Ollama (ollama.com : elle s’installe sans droits d’administrateur), puis dans un terminal : ollama pull qwen3:4b</small>}
                <div className="row"><button className="btn small" onClick={() => { void bureau.refreshOllama(); }}>↻ Chercher à nouveau les modèles</button></div>
              </div>
              <label className="field">
                <span>Le cerveau de l’équipe</span>
                <select id="model" value={settings.model} onChange={(e) => send({ t: 'settings', settings: { model: e.target.value } })}>
                  {availableModels(true).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  {!availableModels(true).length && <option value="">Aucun modèle installé</option>}
                </select>
                <small className="muted">Les plus légers sont en premier : sur un ordinateur portable, un modèle de 3 à 8 milliards de paramètres (par exemple qwen3:4b ou llama3.2:3b) répond bien plus vite.</small>
              </label>
              <OllamaInstall />
              <div className="field">
                <span>Les permissions</span>
                <label className="radio"><input type="radio" checked={settings.permission === 'auto'} onChange={() => send({ t: 'settings', settings: { permission: 'auto' } })} /> L’équipe écrit ses fichiers seule</label>
                <label className="radio"><input type="radio" checked={settings.permission === 'ask'} onChange={() => send({ t: 'settings', settings: { permission: 'ask' } })} /> Elle demande avant chaque fichier</label>
              </div>
            </>
          ) : engine === 'claude-code' ? (
            <>
              <div className="field">
                <span>Ton compte Claude (Claude Code sur cet ordinateur)</span>
                {claudeInfo?.found
                  ? <small className="ok-text">✓ Claude Code {claudeInfo.version} : l’équipe travaille avec ton compte Claude.</small>
                  : <small className="err-text">Claude Code n’est pas trouvé. Installe-le (claude.com/claude-code), lance « claude » une fois pour te connecter à ton compte, puis relance « npm start ».</small>}
              </div>
              <label className="field">
                <span>Le cerveau de l’équipe</span>
                <select id="model" value={settings.model} onChange={(e) => send({ t: 'settings', settings: { model: e.target.value } })}>
                  {CLAUDE_CODE_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <div className="field">
                <span>Les permissions</span>
                <label className="radio"><input type="radio" checked={settings.permission === 'auto'} onChange={() => send({ t: 'settings', settings: { permission: 'auto' } })} /> L’équipe décide seule, et lève la main pour les gestes risqués</label>
                <label className="radio"><input type="radio" checked={settings.permission === 'ask'} onChange={() => send({ t: 'settings', settings: { permission: 'ask' } })} /> Elle demande avant chaque fichier</label>
              </div>
            </>
          ) : (
            <>
              <AccessCode />
              <ClaudeLogin />
              <label className="field">
                <span>Le cerveau de l’équipe</span>
                <select id="model" value={settings.model} onChange={(e) => send({ t: 'settings', settings: { model: e.target.value } })}>
                  {MODELS.map((m) => <option key={m.id} value={m.id} disabled={m.provider === 'claude' && !getClaudeKey()}>{m.label}{m.provider === 'claude' && !getClaudeKey() ? ' : connecte-toi d’abord' : ''}</option>)}
                </select>
              </label>
              <div className="field">
                <span>Les permissions</span>
                <label className="radio"><input type="radio" checked={settings.permission === 'auto'} onChange={() => send({ t: 'settings', settings: { permission: 'auto' } })} /> L’équipe écrit ses fichiers seule</label>
                <label className="radio"><input type="radio" checked={settings.permission === 'ask'} onChange={() => send({ t: 'settings', settings: { permission: 'ask' } })} /> Elle demande avant chaque fichier</label>
              </div>
            </>
          )}
          <WorkHoursField />
          <div className="field">
            <span>L’équipe</span>
            <div className="row">
              <button className="btn small" onClick={() => useOffice.setState({ settingsOpen: false, modal: { kind: 'rules' } })}>📜 Le règlement du bureau</button>
              <button className="btn small" onClick={() => useOffice.setState({ settingsOpen: false, modal: { kind: 'drawer' } })}>🗄️ Le tiroir de l’analyste</button>
              <button className="btn small" onClick={() => useOffice.setState({ settingsOpen: false, modal: { kind: 'skills' } })}>🎓 Les skills</button>
            </div>
          </div>
          <div className="field">
            <span>{engine === 'claude-code' ? 'Tes réglages d’équipe (règlement, tiroir, skills : dans ce navigateur)' : 'Tes données (elles ne quittent pas ce navigateur)'}</span>
            <div className="row">
              <button className="btn small" onClick={() => download(`openspace-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backupData(), null, 2), 'application/json')}>💾 Sauvegarder règlement, tiroir et skills</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try { restoreData(await f.text()); toast('info', 'Sauvegarde restaurée.'); } catch (err) { toast('error', err instanceof Error ? err.message : String(err)); }
              }} />
              <button className="btn small" onClick={() => fileRef.current?.click()}>📂 Restaurer</button>
              {!confirmErase
                ? <button className="btn small stop" onClick={() => setConfirmErase(true)}>Tout effacer…</button>
                : <button className="btn small stop" onClick={() => { void dbClear().then(() => { lsClear(); location.reload(); }); }}>Oui, effacer missions, tiroir, skills et code</button>}
            </div>
          </div>
          <div className="field">
            <span>Le spectacle</span>
            <label className="radio"><input type="checkbox" checked={cameraAuto} onChange={(e) => { useOffice.setState({ cameraAuto: e.target.checked }); savePref('cameraAuto', e.target.checked); }} /> En mode tournage, la caméra suit l’action toute seule</label>
          </div>
          <div className="keys">
            <b>Raccourcis</b>
            <span><kbd>V</kbd> cadre vertical (reel)</span>
            <span><kbd>F</kbd> mode tournage</span>
            <span><kbd>C</kbd> caméra auto</span>
            <span><kbd>T</kbd> visite guidée</span>
            <span><kbd>N</kbd> jour, soir, nuit</span>
            <span><kbd>M</kbd> son</span>
            <span><kbd>H</kbd> missions précédentes</span>
            <span><kbd>Échap</kbd> fermer, sortir du tournage</span>
            <span>🥚 Il y a un code secret… (pense aux vieux jeux vidéo)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useOffice((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
