// La barre du haut : le nom du bureau, la mission en cours et son chrono, les compteurs (agents,
// recherches, pages lues, rendus), l'énergie de ton abonnement, et les réglages d'affichage.
import { useEffect, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { applySound } from '../audio/sound.ts';
import { replaySpeed, stopReplay } from '../net/link.ts';
import { savePref, useOffice, type Tod } from '../state/store.ts';
import { fmtClock } from './format.ts';
import { togglePanel } from './Panel.tsx';
import { goRoom } from './place.ts';
import { startTour } from './tour.ts';

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <span className="logo-visor"><i /><i /></span>
    </span>
  );
}

/** Le plein écran (le vrai : celui du navigateur, sans barre d'adresse). */
function useFullscreen() {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  const toggle = () => {
    sfx('click');
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => useOffice.getState().toast('info', 'Ton navigateur refuse le plein écran : essaie la touche F11.'));
  };
  return { on, toggle };
}

function useTick(on: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setN((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [on]);
}

const TOD_NEXT: Record<Tod, Tod> = { auto: 'day', day: 'evening', evening: 'night', night: 'auto' };
const TOD_ICON: Record<Tod, string> = { auto: '🕒', day: '☀️', evening: '🌇', night: '🌙' };
const TOD_LABEL: Record<Tod, string> = { auto: 'Selon l’heure', day: 'Jour', evening: 'Soir', night: 'Nuit' };

export function TopBar() {
  const mission = useOffice((s) => s.mission);
  const busySince = useOffice((s) => s.busySince);
  const workMs = useOffice((s) => s.workMs);
  const stats = useOffice((s) => s.stats);
  const files = useOffice((s) => s.files.length);
  const plan = useOffice((s) => s.plan);
  const quota = useOffice((s) => s.quota);
  const replaying = useOffice((s) => s.replaying);
  const connection = useOffice((s) => s.connection);
  const final = useOffice((s) => s.final);
  const vertical = useOffice((s) => s.vertical);
  const filming = useOffice((s) => s.filming);
  const sound = useOffice((s) => s.sound);
  const tod = useOffice((s) => s.tod);
  const room = useOffice((s) => s.room);
  const panelOpen = useOffice((s) => s.panelOpen);
  const full = useFullscreen();
  useTick(busySince !== null);
  const elapsed = workMs + (busySince ? Date.now() - busySince : 0);
  const done = plan.filter((p) => p.status === 'completed').length;
  const current = plan.find((p) => p.status === 'in_progress') ?? plan.find((p) => p.status === 'pending');

  const status = !mission ? null : busySince ? 'live' : final?.ok ? 'done' : mission.status === 'error' ? 'error' : 'stopped';
  const toggle = (k: 'vertical' | 'filming' | 'sound') => {
    sfx('click');
    const v = !useOffice.getState()[k];
    useOffice.setState({ [k]: v });
    if (k !== 'filming') savePref(k, v);
    if (k === 'sound') applySound(v);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <b>L’open space</b>
          <span>{connection === 'demo' ? 'Rediffusion' : 'Roré et son équipe'}</span>
        </div>
      </div>

      <div className="mission-head">
        {mission ? (
          <>
            <span className={`dot ${status}`} />
            <span className="mission-title" title={mission.prompt}>{mission.title}</span>
            <span className="timer">{fmtClock(elapsed)}</span>
          </>
        ) : <span className="muted">Aucune mission en cours</span>}
        {mission && plan.length > 0 && (
          <span className="plan-step" title={current?.text ?? ''}>📋 {done}/{plan.length}{current && busySince ? ` · ${current.text}` : ''}</span>
        )}
      </div>

      {mission && (
        <div className="stats">
          <span title="Agents appelés">🤖 {stats.agents}</span>
          <span title="Recherches sur internet">🔎 {stats.searches}</span>
          <span title="Pages web lues">🌐 {stats.pages}</span>
          <span title="Fichiers rendus">📄 {files}</span>
        </div>
      )}

      {replaying && (
        <div className="replay-bar">
          <span>Rediffusion</span>
          {[1, 2, 4].map((x) => <button key={x} onClick={() => replaySpeed(x)}>×{x}</button>)}
          {connection !== 'demo' && <button onClick={() => { sfx('click'); stopReplay(); }}>Quitter</button>}
        </div>
      )}

      <div className="tools">
        {quota && (
          <span className="energy" title={`Ton abonnement sur 5 heures : ${Math.round(quota.fiveHour * 100)} % utilisés`}>
            <span className="energy-label">Énergie</span>
            <span className="energy-bar"><i style={{ width: `${Math.max(3, 100 - quota.fiveHour * 100)}%` }} /></span>
          </span>
        )}
        <button className={`icon-btn ${room === 'annex' ? 'on' : ''}`} title={room === 'annex' ? 'Retour au bureau (D)' : 'La Pause : la cuisine et les loisirs, où tout le monde se retrouve (D)'} onClick={() => goRoom(room === 'annex' ? 'office' : 'annex')}>☕</button>
        <button className={`icon-btn ${room === 'outside' ? 'on' : ''}`} title={room === 'outside' ? 'Retour au bureau (O)' : 'Dehors : l’entrée, l’herbe au vent et la falaise (O)'} onClick={() => goRoom(room === 'outside' ? 'office' : 'outside')}>🌿</button>
        <button className={`icon-btn ${room === 'sea' ? 'on' : ''}`} title={room === 'sea' ? 'Accoster au ponton (L)' : 'En mer : la barque, le tour de l’île et la pêche (L)'} onClick={() => goRoom(room === 'sea' ? 'outside' : 'sea')}>⛵</button>
        <button className="icon-btn" title="Visite guidée : Roré présente son bureau (T)" onClick={() => void startTour()}>🎤</button>
        <button className="icon-btn" title="Toute l’équipe : les métiers, leurs outils, l’historique" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'team' } }); }}>👥</button>
        <button className="icon-btn" title="Le tiroir de l’analyste : couleurs, types de texte, infos à retenir" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'drawer' } }); }}>🗄️</button>
        <button className="icon-btn" title="Les skills de l’équipe" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'skills' } }); }}>🎓</button>
        <button className="icon-btn" title="Missions précédentes (H)" onClick={() => { sfx('open'); useOffice.setState({ historyOpen: true }); }}>🗂️</button>
        <button className="icon-btn" title={`L’heure du bureau : ${TOD_LABEL[tod]} (N)`} onClick={() => { sfx('click'); const n = TOD_NEXT[tod]; useOffice.setState({ tod: n }); savePref('tod', n); }}>{TOD_ICON[tod]}</button>
        <button className="icon-btn" title={sound ? 'Couper le son (M)' : 'Remettre le son (M)'} onClick={() => toggle('sound')}>{sound ? '🔊' : '🔇'}</button>
        <button className={`icon-btn ${vertical ? 'on' : ''}`} title="Cadre vertical 9:16, pour filmer un reel (V)" onClick={() => toggle('vertical')}>📱</button>
        <button className={`icon-btn ${filming ? 'on' : ''}`} title="Mode tournage : juste le bureau et Roré (F)" onClick={() => toggle('filming')}>🎬</button>
        <button className={`icon-btn ${panelOpen ? 'on' : ''}`} title={panelOpen ? 'Replier le panneau de droite (P)' : 'Ouvrir le panneau de droite (P)'} onClick={() => togglePanel()}>▥</button>
        <button className={`icon-btn ${full.on ? 'on' : ''}`} title={full.on ? 'Quitter le plein écran' : 'Plein écran'} onClick={full.toggle}>{full.on ? '🗗' : '⛶'}</button>
        <button className="icon-btn" title="Réglages" onClick={() => { sfx('open'); useOffice.setState({ settingsOpen: true }); }}>⚙️</button>
      </div>
    </header>
  );
}
