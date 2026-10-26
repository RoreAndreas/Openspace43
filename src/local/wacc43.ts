// La base 43 WACC dans le navigateur : la page WACC43 arrive une fois (par le Worker Cloudflare, ou le serveur
// local), on en extrait la base, gardée en mémoire le temps de la session ; Hares l'interroge ici, sans serveur.
import { extractWacc43, queryWacc43, type Query, type Wacc43 } from '../../shared/wacc43.ts';
import { ApiError, getCode } from './api.ts';

let base: Promise<Wacc43> | null = null;

/** La base (téléchargée et extraite à la première demande). */
export function loadWacc43(): Promise<Wacc43> {
  if (!base) {
    base = (async () => {
      let res: Response;
      try {
        res = await fetch('/api/wacc43', { headers: { 'x-code': getCode() || 'local' } });
      } catch {
        throw new ApiError(0, 'La base 43 WACC ne répond pas : vérifie ta connexion.');
      }
      if (!res.ok) {
        let msg = `La base 43 WACC ne répond pas (${res.status}).`;
        try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* pas de JSON */ }
        throw new ApiError(res.status, msg);
      }
      return extractWacc43(await res.text());
    })();
    // en cas d'échec, on réessaiera à la prochaine demande
    base.catch(() => { base = null; });
  }
  return base;
}

/** Une demande de Hares sur la base. */
export async function askWacc43(q: Query): Promise<string> {
  return queryWacc43(await loadWacc43(), q);
}
