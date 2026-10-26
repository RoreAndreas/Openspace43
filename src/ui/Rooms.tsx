// Les fenêtres qu'on ouvre en cliquant dans le bureau. Tout y vient du vrai travail de l'équipe :
// la fiche d'un agent (sa mission, chacune de ses actions, son rapport), le plan de Roré et son
// historique, l'équipe et ses outils, la machine, les rendus, le tiroir et les skills.
import { useEffect, useMemo, useState } from 'react';
import { ACTIVE_ROLES, ROLE_TOOLS, ROLES, TOOL_INFO } from '../../shared/activity.ts';
import type { PlanItem, Role } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { world } from '../engine/instance.ts';
import { savePref, teamList, useOffice, type ActView, type Tod } from '../state/store.ts';
import { useShallow } from 'zustand/react/shallow';
import { fileIcon, fmtClock, fmtDate, fmtDuration, fmtSize, plural, readable, tilde } from './format.ts';
import { mdToHtml } from './md.ts';
import { Avatar } from './Panel.tsx';
import { tidy } from './tidy.ts';
import { bureau } from '../local/bureau.ts';
import { characterInfo } from '../engine/characters.ts';
import { CharactersRoom } from './Characters.tsx';
import { DrawerRoom, RulesRoom, SkillsRoom } from './Extras.tsx';
import { JukeboxRoom } from './Jukebox.tsx';
import { startTour } from './tour.ts';

const ICON: Record<string, string> = {
  search: '🔎', web: '🌐', read: '📖', write: '✍️', edit: '✏️', bash: '💻', plan: '📋', skill: '🎓', mcp: '🔌', other: '⚙️',
};

export function Shell({ title, sub, wide, children, onClose }: { title: React.ReactNode; sub?: React.ReactNode; wide?: boolean; children: React.ReactNode; onClose?: () => void }) {
  const close = onClose ?? (() => useOffice.setState({ modal: null }));
  return (
    <div className="modal-back" onClick={close}>
      <div className={`modal room ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="room-title"><b>{title}</b>{sub && <span>{sub}</span>}</div>
          <button className="close" onClick={close} aria-label="Fermer">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Les fenêtres du bureau (une seule ouverte à la fois). */
export function Rooms() {
  const modal = useOffice((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'agent': return <AgentRoom id={modal.id} />;
    case 'board': return <BoardRoom />;
    case 'clock': return <ClockRoom />;
    case 'machine': return <MachineRoom />;
    case 'jukebox': return <JukeboxRoom />;
    case 'team': return <TeamRoom role={modal.role} />;
    case 'files': return <FilesRoom />;
    case 'preview': return <PreviewRoom missionId={modal.missionId} file={modal.file} />;
    case 'drawer': return <DrawerRoom />;
    case 'skills': return <SkillsRoom />;
    case 'rules': return <RulesRoom />;
    case 'howto': return <HowtoRoom />;
    case 'characters': return <CharactersRoom pick={modal.pick} />;
  }
}

// ── La fiche d'un agent ──
function AgentRoom({ id }: { id: string }) {
  const a = useOffice((s) => s.agents[id]);
  const live = world.actors.get(id);
  const html = useMemo(() => (a?.report ? mdToHtml(tidy(a.report)) : ''), [a?.report]);
  if (!a) return <Shell title="Cet agent n’est plus là">Il a quitté le bureau.</Shell>;
  const role = ROLES[a.role];
  const working = a.status === 'working' || a.status === 'reporting';
  return (
    <Shell title={<>{a.name}</>} sub={`${role.icon} ${role.label} · ${a.task}`}>
      <div className="agent-hero" style={{ ['--c' as string]: role.color }}>
        <Avatar role={a.role} name={a.name} size={72} />
        <div>
          <span className={`pill-status ${a.status}`}>{working ? (live?.seated ? 'Au travail' : 'En chemin') : a.status === 'done' ? 'A rendu son travail' : 'N’a pas pu finir'}</span>
          <p className="now">{working && a.act ? <><i>{ICON[a.act.kind]}</i>{a.act.label}</> : a.status === 'done' ? 'Son rapport est sur le bureau de Roré.' : working ? 'Il s’installe à son poste…' : ''}</p>
          <p className="small muted">Un vrai agent IA, avec seulement les outils de son métier : {ROLE_TOOLS[a.role].filter((t) => t !== 'Tiroir' || useOffice.getState().engine === 'cloud').map((t) => TOOL_INFO[t] ?? t).join(', ')}.</p>
          {live?.character && <p className="small muted">Son personnage : <b>{characterInfo(live.character)?.name}</b>, {characterInfo(live.character)?.archetype.toLowerCase()}. {characterInfo(live.character)?.temperament}</p>}
          <div className="row">
            {a.role === 'analyse' && <button className="btn small" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'drawer' } }); }}>🗄️ Ouvrir son tiroir</button>}
            <button className="btn small" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'characters', pick: { role: a.role, name: a.name, agent: a.id } } }); }}>🎭 Changer de personnage</button>
          </div>
        </div>
      </div>
      <section className="room-sec">
        <h4>Sa mission, écrite par Roré</h4>
        <p className="brief">{tidy(a.prompt)}</p>
      </section>
      {a.acts.length > 0 && (
        <section className="room-sec">
          <h4>Ce qu’il a fait <span className="count">{plural(a.acts.length, 'action', 'actions')}</span></h4>
          <ActList acts={a.acts} />
        </section>
      )}
      {html && (
        <section className="room-sec">
          <h4>Son rapport</h4>
          <div className="md report" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      )}
      {a.leftAt && (
        <p className="small muted">{fmtDuration(a.leftAt - a.hiredAt)} de travail{a.tools ? ` · ${plural(a.tools, 'outil utilisé', 'outils utilisés')}` : ''}{a.tokens ? ` · ${a.tokens.toLocaleString('fr-FR')} jetons` : ''}</p>
      )}
    </Shell>
  );
}

function ActList({ acts }: { acts: ActView[] }) {
  return (
    <ul className="act-list">
      {acts.slice(-40).map((x) => (
        <li key={x.id} className={x.ok === false ? 'fail' : ''}>
          <i>{ICON[x.kind]}</i>
          <div>
            <span>{x.label}</span>
            {x.detail && x.detail !== x.label && <code>{(() => { const d = tidy(x.detail); return d.length > 160 ? d.slice(0, 159) + '…' : d; })()}</code>}
          </div>
          <time>{new Date(x.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        </li>
      ))}
    </ul>
  );
}

// ── Le tableau : le plan, qui fait quoi, et l'historique du plan ──
function planChanges(prev: PlanItem[] | null, next: PlanItem[]): string[] {
  if (!prev) return [`Roré écrit le plan : ${plural(next.length, 'étape', 'étapes')}`];
  const out: string[] = [];
  for (const it of next) {
    const before = prev.find((p) => p.text === it.text);
    if (!before) out.push(`+ ${it.text}`);
    else if (before.status !== it.status && it.status === 'completed') out.push(`✓ ${it.text}`);
    else if (before.status !== it.status && it.status === 'in_progress') out.push(`▶ ${it.text}`);
  }
  return out;
}

function BoardRoom() {
  const plan = useOffice((s) => s.plan);
  const history = useOffice((s) => s.planHistory);
  const team = useOffice(useShallow(teamList));
  const done = plan.filter((p) => p.status === 'completed').length;
  const steps = useMemo(() => history.map((h, i) => ({ at: h.at, lines: planChanges(i ? history[i - 1].items : null, h.items) })).filter((x) => x.lines.length), [history]);
  return (
    <Shell title="Le tableau de Roré" sub={plan.length ? `${done} étape${done > 1 ? 's' : ''} faite${done > 1 ? 's' : ''} sur ${plan.length}` : 'Le plan de la mission, et qui fait quoi'}>
      {plan.length > 0 ? (
        <>
          <div className="progress"><i style={{ width: `${(done / plan.length) * 100}%` }} /></div>
          <ul className="plan big">{plan.map((p, i) => <li key={i} className={p.status}><i />{p.text}</li>)}</ul>
        </>
      ) : <p className="muted">Pas encore de plan : Roré en écrit un dès qu’une mission a plusieurs étapes.</p>}
      <section className="room-sec">
        <h4>Qui fait quoi <span className="count">{plural(team.length, 'agent', 'agents')}</span></h4>
        {team.length ? (
          <div className="who">
            {team.map((a) => (
              <button key={a.id} className={`who-row ${a.status}`} style={{ ['--c' as string]: ROLES[a.role].color }} onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }}>
                <Avatar role={a.role} name={a.name} size={26} />
                <b>{a.name}</b>
                <span className="who-task">{a.task}</span>
                <span className="who-state">{a.status === 'done' ? '✓ rapport rendu' : a.status === 'failed' ? '✕ pas fini' : a.status === 'reporting' ? '📄 rend son rapport' : '… au travail'}</span>
              </button>
            ))}
          </div>
        ) : <p className="muted small">Personne pour l’instant.</p>}
      </section>
      {steps.length > 0 && (
        <section className="room-sec">
          <h4>L’historique du plan</h4>
          <ol className="timeline">
            {steps.map((s, i) => (
              <li key={i}>
                <time>{new Date(s.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                <div>{s.lines.map((l, j) => <span key={j}>{l}</span>)}</div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Shell>
  );
}

// ── L'horloge ──
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

const TODS: [Tod, string][] = [['auto', 'Selon l’heure'], ['day', '☀️ Jour'], ['evening', '🌇 Soir'], ['night', '🌙 Nuit']];

function ClockRoom() {
  const now = useClock();
  const tod = useOffice((s) => s.tod);
  const busySince = useOffice((s) => s.busySince);
  const workMs = useOffice((s) => s.workMs);
  const mission = useOffice((s) => s.mission);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <Shell title="L’horloge du bureau" sub={now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
      <div className="big-clock"><span>{hh}</span><i>:</i><span>{mm}</span><small>{ss}</small></div>
      {mission && (busySince
        ? <p className="center">Mission en cours depuis <b>{fmtClock(workMs + (now.getTime() - busySince))}</b> · {mission.title}</p>
        : <p className="center">Dernière mission : <b>{fmtClock(workMs)}</b> de travail · {mission.title}</p>)}
      <p className="center muted small">Ton équipe ne dort jamais : elle travaille à 3 h du matin comme à midi.</p>
      <div className="seg">
        {TODS.map(([v, l]) => (
          <button key={v} className={tod === v ? 'on' : ''} onClick={() => { sfx('click'); useOffice.setState({ tod: v }); savePref('tod', v); }}>{l}</button>
        ))}
      </div>
    </Shell>
  );
}

// ── La machine (le serveur) : le moteur, le modèle, les données ──
function MachineRoom() {
  const claude = useOffice((s) => s.claude);
  const engine = useOffice((s) => s.engine);
  const settings = useOffice((s) => s.settings);
  const mission = useOffice((s) => s.mission);
  const dir = useOffice((s) => s.dir);
  const local = engine === 'claude-code';
  const rows: [string, React.ReactNode][] = engine === 'ollama' ? [
    ['Moteur', claude?.found ? 'Ollama, l’IA gratuite qui tourne sur ton ordinateur' : 'Ollama ne répond pas (ou n’a aucun modèle)'],
    ['Cerveau de l’équipe', claude?.version || '—'],
    ['Quota', 'aucun : c’est ton ordinateur qui travaille (plus lent, mais gratuit et privé)'],
    ['Recherche web', 'par le serveur local (DuckDuckGo, ou Tavily si une clé est configurée)'],
    ['Tes données', 'sur ton ordinateur uniquement : missions, fichiers, tiroir, skills.'],
  ] : local ? [
    ['Moteur', claude?.found ? `Claude Code ${claude.version}, avec ton compte Claude` : 'Claude Code introuvable sur cet ordinateur'],
    ['Cerveau de l’équipe', settings.model || 'le modèle par défaut de Claude Code'],
    ['Permissions', settings.permission === 'auto' ? 'automatiques : l’agent lève la main pour les gestes risqués' : 'demandées avant chaque fichier'],
    ['Dossier du bureau', dir ? tilde(dir) : '—'],
    ['Règlement, tiroir, skills', 'dans ce navigateur, envoyés à l’équipe avec chaque demande'],
  ] : [
    ['Moteur', claude?.path ?? 'Cloudflare Workers AI'],
    ['Cerveau de l’équipe', mission?.model ?? claude?.version ?? settings.model],
    ['Quota', claude?.path?.startsWith('Claude') ? 'facturé à l’usage sur ton compte API Claude' : 'offre gratuite : 10 000 neurons par jour, remis à zéro à minuit UTC'],
    ['Recherche web', 'par le serveur Cloudflare (DuckDuckGo, ou Tavily si une clé est configurée)'],
    ['Tes données', 'dans ce navigateur uniquement : missions, fichiers, tiroir, skills. Le serveur ne garde rien.'],
  ];
  return (
    <Shell title="La machine" sub="Ce qui tourne derrière le bureau">
      <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <section className="room-sec">
        <h4>Comment ça marche</h4>
        <p className="small">Roré et l’analyste sont de vrais agents IA. À chaque étape, l’IA choisit une action (chercher sur internet, lire une page, écrire un fichier, confier une tâche…) ; le bureau la montre aussitôt : un robot qui tape, une bulle, un rapport posé sur le bureau de Roré.</p>
        <p className="small muted">{engine === 'ollama' ? 'Version locale, IA gratuite : Roré et l’analyste parlent à Ollama, sur ton ordinateur. Le levier, à côté du serveur, les remet sur Claude.' : local ? 'Version locale : Roré est une vraie séance Claude Code lancée dans le dossier de la mission, et l’analyste un vrai sous-agent Claude Code, avec ton compte Claude.' : 'Version en ligne : le serveur Cloudflare ne fait que relayer (l’IA gratuite, la recherche, la lecture des pages). Avec ta clé API Claude, les appels partent directement de ton navigateur chez Claude.'}</p>
        <p className="small muted">D’après « Le Bureau des agents » de VibesMoney (licence MIT).</p>
      </section>
      <div className="row"><button className="btn small" onClick={() => useOffice.setState({ modal: null, settingsOpen: true })}>⚙️ Réglages</button></div>
    </Shell>
  );
}

// ── La note posée près du bureau de Roré : comment ça marche ──
function HowtoRoom() {
  const engine = useOffice((s) => s.engine);
  return (
    <Shell title="Comment ça marche" sub="La note posée sur le pupitre, à côté du bureau de Roré">
      <ol className="steps big">
        <li><b>Tu dis à Roré ce que tu veux</b>, au clavier ou à la voix. Les bulles grises, sous sa réponse, te donnent des idées.</li>
        <li><b>Il fait le plan et appelle l’analyste</b>, qui file à son poste.</li>
        <li><b>Tu le regardes travailler</b>, en vrai : chaque bulle, c’est ce qu’il fait à cet instant.</li>
        <li><b>Ils te rendent le travail</b> : les rapports arrivent sur l’imprimante (« Les rendus »), à lire ou télécharger.</li>
      </ol>
      <section className="room-sec">
        <h4>Le levier, à côté du serveur</h4>
        <p className="small">Il choisit le cerveau de l’équipe. <b style={{ color: 'var(--orange)' }}>Orange : Claude</b>{engine === 'cloud' ? ' (avec ta clé API Claude)' : ' (Claude Code, avec ton compte Claude)'}. <b style={{ color: 'var(--green)' }}>Vert : l’IA gratuite</b>{engine === 'cloud' ? ' (Cloudflare Workers AI)' : ' (Ollama, qui tourne sur ton ordinateur)'}. Clique dessus pour basculer, entre deux missions.</p>
      </section>
      <section className="room-sec">
        <h4>Prends les commandes de Roré</h4>
        <p className="small">Double-clique sur lui, puis fais-le marcher avec les flèches. Échap (ou un nouveau double-clic) lui rend la main : en pleine mission, il retourne à son bureau.</p>
      </section>
      <section className="room-sec">
        <h4>La Pause</h4>
        <p className="small">La porte « PAUSE », à droite (ou ☕, ou la touche D) : une cuisine et une salle de loisirs où tout le monde se retrouve. Clique sur quelqu’un : il te parle. Si tu diriges Roré, fais-lui passer la porte, approche-le d’un collègue et appuie sur Espace.</p>
      </section>
      <section className="room-sec">
        <h4>Les autres objets</h4>
        <p className="small">Le caisson à côté de l’analyste, c’est son tiroir (tes couleurs, tes types de texte, ce qu’il faut retenir). Le tableau, c’est le plan de Roré. Les archives, les missions passées. Le jukebox joue tes liens YouTube. Et clique sur le reste : il y a des surprises.</p>
      </section>
      <div className="row">
        <button className="btn small primary" onClick={() => { useOffice.setState({ modal: null }); void startTour(); }}>🎤 La visite guidée</button>
        <button className="btn small" onClick={() => useOffice.setState({ modal: { kind: 'machine' } })}>🖥️ La machine</button>
      </div>
    </Shell>
  );
}

// ── Toute l'équipe : les métiers et leurs outils, la mission en cours, l'historique ──
function TeamRoom({ role }: { role?: Role }) {
  const [tab, setTab] = useState<'roles' | 'now' | 'history'>(role ? 'roles' : 'now');
  const team = useOffice(useShallow(teamList));
  const settings = useOffice((s) => s.settings);
  const history = useOffice((s) => s.teamHistory);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (tab === 'history' && connection === 'live') send({ t: 'team_history' }); }, [tab, connection, send]);
  const working = (r: Role) => [...world.actors.values()].filter((a) => a.role === r && a.seated).length;
  const roles: Role[] = ACTIVE_ROLES;
  const missions = useMemo(() => {
    const m = new Map<string, { title: string; at: number; entries: NonNullable<typeof history> }>();
    for (const e of history ?? []) {
      if (!m.has(e.missionId)) m.set(e.missionId, { title: e.missionTitle, at: e.at, entries: [] });
      m.get(e.missionId)!.entries.push(e);
    }
    return [...m.entries()];
  }, [history]);
  return (
    <Shell title="Toute l’équipe" sub="Roré et son analyste : de vrais agents IA, chacun avec son métier et ses outils" wide>
      <div className="seg tabs">
        <button className={tab === 'now' ? 'on' : ''} onClick={() => setTab('now')}>Cette mission</button>
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Les métiers</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>L’historique</button>
      </div>
      {tab === 'now' && (team.length ? (
        <div className="who">
          {team.map((a) => (
            <button key={a.id} className={`who-row ${a.status}`} style={{ ['--c' as string]: ROLES[a.role].color }} onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }}>
              <Avatar role={a.role} name={a.name} size={26} />
              <b>{a.name}</b>
              <span className="who-task">{ROLES[a.role].icon} {a.task}</span>
              <span className="who-state">{a.status === 'done' ? '✓ rapport rendu' : a.status === 'failed' ? '✕ pas fini' : a.act ? a.act.label : '… au travail'}</span>
            </button>
          ))}
        </div>
      ) : <p className="muted">Personne au bureau pour l’instant. Donne une mission à Roré : il appellera l’analyste.</p>)}
      {tab === 'roles' && (
        <div className="roles">
          {roles.map((r) => (
            <div key={r} className={`role-card ${role === r ? 'focus' : ''}`} style={{ ['--c' as string]: ROLES[r].color }}>
              <div className="role-head"><Avatar role={r} size={34} /><div><b>{ROLES[r].icon} {ROLES[r].label}</b><span>{r === 'chef' ? 'Roré' : 'l’analyste'} · cerveau : {settings.model ? settings.model.split('/').pop() : 'par défaut'}</span></div>{working(r) > 0 && <em>{working(r)} au travail</em>}</div>
              <p>{ROLES[r].what}</p>
              <div className="tools">{ROLE_TOOLS[r].map((t) => <span key={t} title={TOOL_INFO[t] ?? t}>{t}<small>{TOOL_INFO[t] ?? ''}</small></span>)}</div>
            </div>
          ))}
        </div>
      )}
      {tab === 'history' && (
        connection !== 'live' ? <p className="muted">Chargement du bureau…</p>
          : !history ? <p className="muted">Chargement…</p>
            : !missions.length ? <p className="muted">Pas encore d’historique.</p>
              : (
                <div className="hist-team">
                  {missions.map(([id, m]) => (
                    <section key={id}>
                      <h4>{m.title} <span className="count">{fmtDate(m.at)}</span></h4>
                      {m.entries.map((e) => (
                        <div key={e.id} className={`hist-row ${e.status}`} style={{ ['--c' as string]: ROLES[e.role].color }}>
                          <button onClick={() => setOpen(open === e.id ? null : e.id)}>
                            <Avatar role={e.role} name={e.name} size={22} />
                            <b>{e.name}</b>
                            <span>{ROLES[e.role].label} · {e.task}</span>
                            <em>{e.status === 'done' ? '✓' : e.status === 'failed' ? '✕' : '…'} {e.ms ? fmtDuration(e.ms) : ''}</em>
                          </button>
                          {open === e.id && e.report && <div className="md small" dangerouslySetInnerHTML={{ __html: mdToHtml(tidy(e.report)) }} />}
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              )
      )}
    </Shell>
  );
}

// ── L'imprimante : les rendus de la mission ──
function FilesRoom() {
  const files = useOffice((s) => s.files);
  const mission = useOffice((s) => s.mission);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  if (!mission || !files.length) {
    return <Shell title="Les rendus" sub="L’imprimante du bureau"><p className="muted">Rien d’imprimé pour l’instant : les fichiers de l’équipe arriveront ici.</p></Shell>;
  }
  return (
    <Shell title="Les rendus" sub={`${plural(files.length, 'fichier', 'fichiers')} · ${mission.title}`}>
      <FileActions files={files} missionId={mission.id} disabled={replaying} send={send} />
    </Shell>
  );
}

export function FileActions({ files, missionId, disabled, send }: { files: ReturnType<typeof useOffice.getState>['files']; missionId: string; disabled: boolean; send: ReturnType<typeof useOffice.getState>['send'] }) {
  const agents = useOffice((s) => s.agents);
  return (
    <div className="files">
      {files.map((f) => (
        <div key={f.path} className="file">
          <span className="file-icon">{fileIcon(f.ext)}</span>
          <div className="file-id">
            <b title={f.path}>{f.name}</b>
            <span className="small muted">{fmtSize(f.size)} · par {f.by === 'chef' ? 'Roré' : agents[f.by]?.name ?? 'l’équipe'}</span>
          </div>
          {!disabled && (f.ext === 'html' || f.ext === 'htm') && (
            <button className="btn small primary" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'preview', missionId, file: f.path } }); }}>Voir le site</button>
          )}
          {!disabled && readable(f.ext) && (
            <button className="btn small" onClick={() => { sfx('open'); useOffice.setState({ modal: null, viewer: { missionId, file: f.path } }); send({ t: 'read', missionId, file: f.path }); send({ t: 'versions', missionId, file: f.path }); }}>Lire</button>
          )}
          {!disabled && <button className="btn small ghost" onClick={() => send({ t: 'open', missionId, file: f.path })}>Télécharger</button>}
        </div>
      ))}
    </div>
  );
}

// ── L'aperçu d'un site fait par l'équipe, dans un écran (bac à sable : il ne peut rien toucher) ──
function PreviewRoom({ missionId, file }: { missionId: string; file: string }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [nonce, setNonce] = useState(0);
  const send = useOffice((s) => s.send);
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => { void bureau.fileText(missionId, file).then(setHtml); }, [missionId, file, nonce]);
  const close = () => useOffice.setState({ modal: null });
  return (
    <div className="modal-back" onClick={close}>
      <div className="monitor" onClick={(e) => e.stopPropagation()}>
        <div className="monitor-bar">
          <span className="dots"><i /><i /><i /></span>
          <span className="addr">🔒 {file}</span>
          <div className="seg small">
            <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>💻 Ordinateur</button>
            <button className={device === 'phone' ? 'on' : ''} onClick={() => setDevice('phone')}>📱 Téléphone</button>
          </div>
          <button className="btn small" onClick={() => setNonce((n) => n + 1)} title="Recharger">↻</button>
          <button className="btn small" title="Le code de la page, et ses versions successives" onClick={() => { useOffice.setState({ modal: null, viewer: { missionId, file } }); send({ t: 'read', missionId, file }); send({ t: 'versions', missionId, file }); }}>&lt;/&gt; Code et versions</button>
          <button className="btn small" onClick={() => send({ t: 'open', missionId, file })}>Télécharger</button>
          <button className="close" onClick={close} aria-label="Fermer">×</button>
        </div>
        <div className={`monitor-screen ${device}`}>
          {html !== null && <iframe key={nonce} title={file} srcDoc={html} sandbox="allow-scripts allow-forms allow-popups" referrerPolicy="no-referrer" />}
        </div>
      </div>
    </div>
  );
}
