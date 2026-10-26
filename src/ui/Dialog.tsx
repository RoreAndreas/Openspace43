// En bas de l'écran, comme dans un jeu de rôle : Roré te parle (son texte s'écrit lettre par lettre),
// et tu lui réponds : au clavier ou à la voix. C'est le seul endroit où taper : une demande, et l'équipe s'y met.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ROLES } from '../../shared/activity.ts';
import { sfx } from '../audio/sfx.ts';
import { world } from '../engine/instance.ts';
import { characterPortrait } from '../engine/characters.ts';
import { robotSprite } from '../engine/robots.ts';
import { getCode, HEAVY_MODEL, modelInfo } from '../local/api.ts';
import { useOffice } from '../state/store.ts';
import { tidy } from './tidy.ts';
import { dictationHelp, useDictation } from './voice.ts';

export const EXAMPLES: { label: string; prompt: string }[] = [
  {
    label: '📊 Veille concurrentielle',
    prompt: 'Analyse 3 concurrents de ma marque : positionnement, offre et prix, communication sur les réseaux sociaux et avis clients. Rends-moi un rapport avec un tableau comparatif et 3 pistes pour nous démarquer.',
  },
  {
    label: '📣 Plan de communication',
    prompt: 'Prépare un plan de communication sur 3 mois pour le lancement de notre nouvelle offre : objectifs, cibles, messages clés, canaux, calendrier et indicateurs de suivi.',
  },
  {
    label: '📰 Tendances du mois',
    prompt: 'Fais une veille des tendances marketing et communication du mois dans mon secteur : 5 tendances, avec pour chacune un exemple de marque, la source, et ce qu’on pourrait en faire.',
  },
  {
    label: '🎯 Nos personas',
    prompt: 'Construis 3 personas pour notre cible principale à partir de données publiques (études, statistiques) : besoins, freins, canaux préférés et le message qui leur parle.',
  },
];

/** Après une mission : des idées de retouche. */
export const RETOUCHES: { label: string; prompt: string }[] = [
  { label: '✂️ Plus court', prompt: 'Raccourcis le rapport : une page au plus, avec les points essentiels en tête.' },
  { label: '📋 Un tableau récapitulatif', prompt: 'Ajoute au rapport un tableau récapitulatif des points clés.' },
  { label: '🎨 Avec ma charte', prompt: 'Reprends le rapport avec les couleurs et les types de texte de mon tiroir.' },
  { label: '📣 3 posts LinkedIn', prompt: 'À partir de ce rapport, écris 3 posts LinkedIn prêts à publier, avec un ton professionnel et chaleureux.' },
  { label: '🇬🇧 En anglais', prompt: 'Traduis le rapport en anglais, en gardant la mise en forme.' },
];

const stripMd = (s: string) =>
  tidy(s).replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '').replace(/^\s*[-•]\s+/gm, '• ').replace(/\n{2,}/g, '\n').trim();

/** Le texte de Roré, qui s'écrit lettre par lettre, avec un petit « bip » (comme dans les vieux jeux). */
function useTypewriter(text: string, cps = 55) {
  const [n, setN] = useState(0);
  const shown = useRef('');
  useEffect(() => {
    // si le nouveau texte prolonge celui qui s'affiche, on continue ; sinon on recommence
    if (!text.startsWith(shown.current)) setN(0);
  }, [text]);
  useEffect(() => {
    if (n >= text.length) return;
    const t = setTimeout(() => {
      const step = text.length - n > 260 ? 8 : 2;
      setN((x) => Math.min(text.length, x + step));
      if (n % 6 === 0) sfx('blip', 0.85 + Math.random() * 0.3);
    }, (1000 / cps) * 2);
    return () => clearTimeout(t);
  }, [n, text, cps]);
  const out = text.slice(0, Math.min(n, text.length));
  shown.current = out;
  return { out, done: n >= text.length };
}

/** Le visage de Roré, en grand, qui cligne des yeux (et sourit quand c'est fini). */
function Portrait({ happy }: { happy: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    let blink = 0;
    const draw = () => {
      const chef = world.chef;
      const eyes = happy ? 'happy' : blink > 0 ? 'blink' : chef.eyes === 'blink' ? 'open' : chef.eyes === 'happy' ? 'happy' : chef.eyes;
      g.clearRect(0, 0, 64, 64);
      // son personnage PixelLab s'il en a un (il respire), sinon la tête du robot qui cligne des yeux
      const face = characterPortrait(chef.character);
      if (face) g.drawImage(face, 0, 0, 16, 16, 0, (Math.floor(performance.now() / 1200) % 2) * 4, 64, 64);
      else g.drawImage(robotSprite('chef', 'stand', 'down', 0, eyes), 2, 0, 16, 16, 0, 0, 64, 64);
      if (blink > 0) blink--;
      else if (Math.random() < 0.02) blink = 2;
    };
    draw();
    const t = setInterval(draw, 120);
    return () => clearInterval(t);
  }, [happy]);
  return <canvas ref={ref} width={64} height={64} className="portrait" />;
}

export function Dialog() {
  const connection = useOffice((s) => s.connection);
  const mission = useOffice((s) => s.mission);
  const engine = useOffice((s) => s.engine);
  const claude = useOffice((s) => s.claude);
  const busy = useOffice((s) => s.busySince !== null);
  const replaying = useOffice((s) => s.replaying);
  const chef = useOffice((s) => s.chef);
  const final = useOffice((s) => s.final);
  const tour = useOffice((s) => s.tour);
  const settingsModel = useOffice((s) => s.settings.model);

  let text: string;
  if (tour) text = tour.text;
  else if (connection === 'offline') text = 'Je n’arrive pas à joindre le serveur. Vérifie ta connexion, puis recharge la page.';
  else if (engine === 'claude-code' && claude && !claude.found) text = 'Je ne trouve pas Claude Code sur cet ordinateur. Installe-le (claude.com/claude-code), lance « claude » une fois pour te connecter à ton compte Claude, puis relance « npm start ». En attendant, tire le levier à côté du serveur : on travaillera avec l’IA gratuite (Ollama).';
  else if (engine === 'ollama' && claude && !claude.found) text = 'Je ne trouve pas Ollama, l’IA gratuite de ton ordinateur. Ouvre l’application Ollama (ou installe-la sur ollama.com, sans droits d’administrateur), installe un modèle (par exemple : ollama pull qwen3:4b), puis recharge la page. Ou abaisse le levier, à côté du serveur, pour revenir sur Claude.';
  else if (engine === 'ollama' && !mission && (modelInfo(settingsModel)?.size ?? 0) > HEAVY_MODEL) text = `Attention : le modèle « ${settingsModel.replace('ollama:', '')} » est trop lourd pour la mémoire de la plupart des ordinateurs portables. Ouvre les réglages (⚙️) et clique sur « Installer Qwen 3, 4B » : il est léger et rapide. Ensuite, dis-moi ce dont tu as besoin.`;
  else if (engine === 'cloud' && !mission && !getCode()) text = 'Salut ! Moi, c’est Roré, le chef de l’open space. Pour commencer, entre le code d’accès dans les réglages (⚙️ en haut à droite).';
  else if (!mission) text = `Salut ! Moi, c’est Roré, le chef de l’open space. Dis-moi ce dont tu as besoin : je confie le travail à mon analyste, et tu le regardes faire.${engine === 'ollama' ? ' Aujourd’hui, on travaille avec l’IA gratuite de ton ordinateur : c’est plus lent, sois patiente.' : ''}`;
  else if (chef.typing) text = stripMd(chef.typing);
  else if (final && !busy) text = stripMd(final.text) || (final.ok ? 'C’est prêt !' : 'Mission arrêtée.');
  else if (chef.say) text = stripMd(chef.say);
  else text = busy ? 'Je lis ta demande…' : '';

  const { out } = useTypewriter(text);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [out]);

  return (
    <footer className="dialog">
      <div className="dialog-box">
        <div className="dialog-face"><Portrait happy={!!final?.ok && !busy} /></div>
        <div className="dialog-main">
          <div className="dialog-name">Roré <span>chef de projet</span>{replaying && <em className="pill replay">Rediffusion</em>}</div>
          <div className="dialog-text" ref={box}>{out}<span className="caret" /></div>
        </div>
      </div>
      <Composer />
    </footer>
  );
}

export function AskBar() {
  const asks = useOffice(useShallow((s) => Object.values(s.asks)));
  const agents = useOffice((s) => s.agents);
  const send = useOffice((s) => s.send);
  const a = asks[0];
  if (!a) return null;
  const who = a.who === 'chef' ? 'Roré' : agents[a.who]?.name ?? 'Un agent';
  const role = a.who === 'chef' ? 'chef' : agents[a.who]?.role ?? 'renfort';
  const answer = (allow: boolean) => { sfx(allow ? 'yes' : 'no'); send({ t: 'answer', requestId: a.requestId, allow }); };
  return (
    <div className="askbar">
      <div className="askbar-head">🙋 <b style={{ color: ROLES[role].color }}>{who}</b> te demande la permission{asks.length > 1 ? ` (et ${asks.length - 1} autre${asks.length > 2 ? 's' : ''})` : ''}</div>
      <div className="askbar-label">{a.label}</div>
      {!a.full && a.detail && <pre className="askbar-detail">{a.detail}</pre>}
      <div className="askbar-actions">
        <button className="btn primary" onClick={() => answer(true)}>Autoriser</button>
        <button className="btn" onClick={() => answer(false)}>Refuser</button>
      </div>
    </div>
  );
}

function Composer() {
  const mission = useOffice((s) => s.mission);
  const busy = useOffice((s) => s.busySince !== null);
  const replaying = useOffice((s) => s.replaying);
  const send = useOffice((s) => s.send);
  const draft = useOffice((s) => s.draft);
  const demo = useOffice((s) => s.connection === 'demo');
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  // un exemple choisi ailleurs (ou « demander une retouche ») remplit la zone de texte
  useEffect(() => {
    if (!draft) return;
    setText(draft === ' ' ? '' : draft);
    useOffice.setState({ draft: '' });
    setTimeout(() => area.current?.focus(), 30);
  }, [draft]);

  const getBase = useCallback(() => textRef.current, []);
  const dict = useDictation(getBase, setText);

  const mode: 'new' | 'steer' | 'retouch' = !mission ? 'new' : busy ? 'steer' : 'retouch';
  const placeholder = mode === 'new'
    ? 'Dis à Roré ce que tu veux… (par exemple : analyse 3 concurrents de ma marque)'
    : mode === 'steer' ? 'Une précision pour Roré ? Il la lira entre deux étapes.' : 'Demande une retouche à Roré… ou lance une nouvelle mission.';

  const submit = () => {
    const t = text.trim();
    if (!t || replaying) return;
    if (dict.listening) dict.stop();
    sfx('send');
    if (mode === 'new') send({ t: 'start', prompt: t });
    else send({ t: 'say', text: t });
    setText('');
  };

  // des idées de mission (ou de retouche), en petites bulles grises, comme dans le chat de Hares
  const ideas = busy || replaying || demo || text.trim() ? [] : mode === 'new' ? EXAMPLES : mode === 'retouch' ? RETOUCHES : [];
  const pick = (prompt: string) => { sfx('click'); setText(prompt); setTimeout(() => { const el = area.current; if (el) { el.focus(); el.setSelectionRange(prompt.length, prompt.length); } }, 20); };

  return (
    <div className="composer">
      {ideas.length > 0 && (
        <div className="ideas" role="list" aria-label={mode === 'new' ? 'Des idées de mission' : 'Des idées de retouche'}>
          {ideas.map((e) => <button key={e.label} role="listitem" className="idea" title={e.prompt} onClick={() => pick(e.prompt)}>{e.label}</button>)}
        </div>
      )}
      <div className={`composer-row ${dict.listening ? 'listening' : ''}`}>
        <textarea
          ref={area}
          value={text}
          rows={2}
          placeholder={demo ? 'C’est une rediffusion.' : replaying ? 'Rediffusion en cours…' : placeholder}
          disabled={replaying}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
        />
        <button
          className={`mic ${dict.listening ? 'on' : ''}`}
          title={dict.listening ? 'Arrêter la dictée' : 'Dicter (en français)'}
          aria-label="Dicter"
          disabled={replaying}
          onClick={() => (dict.listening ? dict.stop() : dict.start())}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
        </button>
        {busy && !replaying ? (
          <>
            {text.trim() && <button className="btn primary send" onClick={submit}>Envoyer</button>}
            <button className="btn stop" onClick={() => { sfx('click'); send({ t: 'stop' }); }}>■ Arrêter</button>
          </>
        ) : (
          <button className="btn primary send" disabled={!text.trim() || replaying} onClick={submit}>
            {mode === 'new' ? 'C’est parti' : 'Envoyer'} <span aria-hidden="true">➜</span>
          </button>
        )}
        {mode === 'retouch' && !replaying && (
          <button className="btn ghost" title="Range cette mission et repars de zéro" onClick={() => { sfx('click'); send({ t: 'new' }); }}>＋ Nouvelle mission</button>
        )}
      </div>
      {dict.problem && (
        <div className="hint" onClick={dict.clearProblem}>🎙️ {dictationHelp(dict.problem)}</div>
      )}
    </div>
  );
}
