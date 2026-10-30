// La visite guidée : Roré présente son bureau, coin par coin. La caméra suit,
// et s'il n'y a pas de mission en cours, une équipe de démonstration s'installe le temps de la visite.
import { say, stopVoice, type Line } from '../audio/voice.ts';
import { camera, world } from '../engine/instance.ts';
import { useOffice } from '../state/store.ts';

const STEPS: { line: Line; text: string; shot: [number, number, number] }[] = [
  { line: 'visite-1', text: 'Bienvenue dans l’open space ! Moi, c’est Roré, le chef. Ici, une équipe d’agents IA travaille pour toi.', shot: [176, 186, 1.9] },
  { line: 'visite-6', text: 'Ici, l’analyse. Mon analyste cherche sur internet, analyse et rédige tes rapports marketing et communication.', shot: [258, 188, 1.95] },
  { line: 'visite-5', text: 'Et à côté de lui, son tiroir : tes couleurs, tes types de texte, et tout ce qu’il faut retenir pour la suite.', shot: [306, 196, 2.2] },
  { line: 'visite-7', text: 'Sur ce tableau, j’écris le plan de chaque mission. Et chaque rapport finit sur mon bureau.', shot: [176, 46, 2.05] },
  { line: 'visite-3', text: 'Les autres bureaux, ce sont mes habitués : chacun ses horaires, ses pauses, ses manies. Pour tes missions, j’appelle mon analyste ou Hares.', shot: [176, 110, 1.1] },
  { line: 'visite-8', text: 'Toi, tu me dis ce que tu veux. Je confie le travail. Et tu regardes.', shot: [176, 128, 1] },
];

let run = 0;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startTour() {
  const id = ++run;
  const st = useOffice.getState();
  useOffice.setState({ modal: null, showFinal: false });
  const demo = !st.busySince;
  if (demo) world.demoTeam(true);
  for (let i = 0; i < STEPS.length; i++) {
    if (run !== id) return;
    const s = STEPS[i];
    camera.shot(s.shot[0], s.shot[1], s.shot[2], 60);
    useOffice.setState({ tour: { step: i, text: s.text } });
    if (i === 0 || i === STEPS.length - 1) world.chef.happyUntil = world.time + 2;
    const t0 = Date.now();
    await say(s.line, true);
    // sans la voix (ou si elle est coupée), on laisse le temps de lire
    const minMs = 900 + s.text.length * 38;
    const spent = Date.now() - t0;
    if (spent < minMs) await wait(minMs - spent);
    await wait(350);
  }
  if (run !== id) return;
  endTour(demo);
}

function endTour(demo: boolean) {
  useOffice.setState({ tour: null });
  camera.wide(2);
  if (demo) world.demoTeam(false);
}

export function stopTour() {
  if (!useOffice.getState().tour) return;
  run++;
  stopVoice();
  endTour(true);
}
