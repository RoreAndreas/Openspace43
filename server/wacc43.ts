// La base 43 WACC pour le Hares de Claude Code (version locale) : on la dépose dans le dossier caché .wacc43
// de la mission, en fichiers que Read et Grep savent lire (une ligne par société, avec les ratios calculés).
// La page WACC43 vient de cet ordinateur (WACC43_HTML, sinon le dépôt 43 rangé à côté de l'open space),
// sinon du site publié (WACC43_URL).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractWacc43, fieldOf, FIELDS, type Wacc43 } from '../shared/wacc43.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let cached: { at: number; base: Wacc43 } | null = null;

/** La page WACC43 (texte HTML). */
export async function wacc43Html(): Promise<string> {
  const local = process.env.WACC43_HTML ?? path.resolve(ROOT, '..', '43', 'DATA', 'Provider', 'Analysis', 'WACC43', 'PFILES', 'site', 'index.html');
  try {
    return await readFile(local, 'utf8');
  } catch {
    const r = await fetch(process.env.WACC43_URL ?? 'https://43wacc.pages.dev/');
    if (!r.ok) throw new Error('La base 43 WACC ne répond pas.');
    return await r.text();
  }
}

async function base(): Promise<Wacc43> {
  if (cached && Date.now() - cached.at < 3600_000) return cached.base;
  cached = { at: Date.now(), base: extractWacc43(await wacc43Html()) };
  return cached.base;
}

const LISEZ_MOI = `# La base 43 WACC (pour Hares)

- societes.jsonl : une société par ligne (exports S&P Capital IQ, montants en millions). Champs bruts et calculés
  sur le dernier exercice. Cherche avec Grep (par exemple "industrie":"Telecommunication Services" ou "pays":"Nigeria").
- pays.json : prime de risque pays (crp), spread de défaut (ds), taux d'IS (tax), zone (Damodaran).
- industries.json : bêta désendetté (beta), D/E sectoriel (de), couverture des intérêts (spread) (Damodaran).
- taux.json : taux US Treasury moyens (« 2026-30 » = 30 ans, moyenne 2026), en %.
- methode.json : prime de marché mature et table d'ajustement du spread de la dette.

CMPC (méthode indirecte de WACC43) :
- taux sans risque local = taux US / 100 + prime pays ; taux de la dette = taux US / 100 + spread de défaut
- bêta ré-endetté = bêta désendetté × (1 + gearing × (1 − IS)) ; coût des fonds propres = taux local + bêta × prime mature + primes de taille et spécifique
- spread de la dette : première ligne de la table où « spread » sectoriel ≤ seuil, + correction ; coût de la dette après impôt = (spread + taux de la dette) × (1 − IS)
- poids : fonds propres = 1 / (1 + gearing) ; CMPC = Re × E/V + Rd × D/V ; en monnaie locale : (1 + CMPC) × (1 + inflation locale) / (1 + inflation de référence) − 1

Limites : la trésorerie manque aux exports (levier = dette brute / EBITDA) ; le statut groupe ou filiale est déduit des descriptions.

Champs calculés : ${Object.entries(FIELDS).map(([k, v]) => `${k} (${v})`).join(' ; ')}.
`;

/** Dépose la base dans le dossier .wacc43 de la mission. Vrai si elle y est. */
export async function writeWacc43(folder: string): Promise<boolean> {
  let d: Wacc43;
  try { d = await base(); } catch { return false; }
  const dir = path.join(folder, '.wacc43');
  await mkdir(dir, { recursive: true });
  const calc = ['ca', 'ebitda', 'rn', 'marge_ebitda', 'marge_nette', 'croissance_ca', 'levier', 've', 've_ebitda', 've_ca', 'per'];
  const lines = Object.values(d.comparables.societes).map((s) => {
    const { presentation, ...rest } = s;
    const extra: Record<string, number> = {};
    for (const f of calc) { const v = fieldOf(s, f); if (v !== undefined) extra[f === 'ca' || f === 'ebitda' || f === 'rn' ? `${f}_dernier` : f] = Math.round(v * 10000) / 10000; }
    return JSON.stringify({ ...rest, ...extra, description: (presentation ?? '').slice(0, 300) });
  });
  await writeFile(path.join(dir, 'societes.jsonl'), lines.join('\n') + '\n');
  await writeFile(path.join(dir, 'pays.json'), JSON.stringify(d.pays, null, 1));
  await writeFile(path.join(dir, 'industries.json'), JSON.stringify(d.industries, null, 1));
  await writeFile(path.join(dir, 'taux.json'), JSON.stringify(d.rf, null, 1));
  await writeFile(path.join(dir, 'methode.json'), JSON.stringify({ prime_marche_mature: d.mature, ajustement_spread: d.adjustment }, null, 1));
  await writeFile(path.join(dir, 'LISEZ-MOI.md'), LISEZ_MOI);
  return true;
}
