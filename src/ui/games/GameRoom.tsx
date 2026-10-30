// La fenêtre des mini-jeux : ceux de la Pause, et la pêche (Dehors).
import { useOffice } from '../../state/store.ts';
import { Shell } from '../Rooms.tsx';
import { Fishing } from './Fishing.tsx';
import { PingPong } from './PingPong.tsx';
import { SpartanRun } from './SpartanRun.tsx';

export function GameRoom({ game }: { game: 'pingpong' | 'arcade' | 'fishing' }) {
  const close = () => useOffice.setState({ modal: null });
  if (game === 'fishing') return <Shell wide title="🎣 La pêche au large" sub="Lance, attends la touche, ferre au bon moment" onClose={close}><Fishing /></Shell>;
  return game === 'pingpong'
    ? <Shell wide title="🏓 Ping-pong" sub="Roré contre un collègue, en 5 points" onClose={close}><PingPong onClose={close} /></Shell>
    : <Shell wide title="🕹️ Spartan Run" sub="La borne d’arcade de la Pause" onClose={close}><SpartanRun /></Shell>;
}
