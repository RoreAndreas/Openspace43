// La base 43 WACC (le site WACC43, https://43wacc.pages.dev) : les données Damodaran (pays, industries),
// les taux US Treasury et 8 000 sociétés cotées (exports S&P Capital IQ). La page embarque tout dans
// « const DATA = {…} » ; on l'en extrait, puis Hares l'interroge : filtrer, classer, médianes et quartiles,
// valeurs aberrantes (Tukey), et le CMPC calculé comme dans WACC43 (moteur/wacc_core.py).
// Syntaxe « effaçable » uniquement : ce fichier est lu tel quel par Node et par Vite.

export interface Societe {
  nom: string; ticker?: string; place?: string; pays: string; continent?: string; zone?: string;
  industrie?: string; activite?: string; presentation?: string;
  beta_1an?: number; beta_3ans?: number; beta_u?: number;
  capitalisation?: number; dette?: number; fonds_propres?: number; gearing?: number; is_desendettement?: number; is_effectif?: number;
  annees?: number[]; ca?: Record<string, number>; ebitda?: Record<string, number>; rn?: Record<string, number>;
  statut?: string;
}

export interface Wacc43 {
  mature: number;
  rf: Record<string, number>;
  pays: Record<string, { crp?: number; ds?: number; tax?: number; continent?: string; zone?: string }>;
  industries: Record<string, { beta: number; de: number; spread: number }>;
  adjustment: { rows: [number, number][]; correction: number };
  defaults?: Record<string, unknown>;
  comparables: { source?: string; societes: Record<string, Societe> };
}

/** Extrait la base de la page WACC43. */
export function extractWacc43(html: string): Wacc43 {
  const start = html.indexOf('const DATA = ');
  if (start < 0) throw new Error('La page WACC43 ne contient pas la base (« const DATA »).');
  const from = start + 'const DATA = '.length;
  // la fin du bloc : « ; » en fin de ligne (fins de ligne Unix ou Windows)
  const m = /;\r?\n/.exec(html.slice(from, from + 20_000_000));
  const d = JSON.parse(m ? html.slice(from, from + m.index) : html.slice(from)) as Wacc43;
  if (!d.comparables?.societes) throw new Error('La base WACC43 n’a pas de sociétés.');
  return d;
}

// ── Les champs calculés d'une société (sur le dernier exercice connu) ──
const last = (m?: Record<string, number>) => {
  if (!m) return undefined;
  const ys = Object.keys(m).filter((k) => typeof m[k] === 'number').sort();
  return ys.length ? m[ys[ys.length - 1]] : undefined;
};
const prev = (m?: Record<string, number>) => {
  if (!m) return undefined;
  const ys = Object.keys(m).filter((k) => typeof m[k] === 'number').sort();
  return ys.length > 1 ? m[ys[ys.length - 2]] : undefined;
};
const div = (a?: number, b?: number) => (a === undefined || b === undefined || !b ? undefined : a / b);

/** Les champs qu'on peut filtrer, classer et résumer (bruts et calculés). */
export const FIELDS: Record<string, string> = {
  capitalisation: 'capitalisation boursière (millions)',
  dette: 'dette totale (millions)',
  fonds_propres: 'fonds propres (millions)',
  ca: 'chiffre d’affaires du dernier exercice (millions)',
  ebitda: 'EBITDA du dernier exercice (millions)',
  rn: 'résultat net du dernier exercice (millions)',
  marge_ebitda: 'EBITDA / chiffre d’affaires',
  marge_nette: 'résultat net / chiffre d’affaires',
  croissance_ca: 'croissance du chiffre d’affaires sur un an',
  levier: 'dette totale / EBITDA (dette brute : la trésorerie manque aux exports)',
  gearing: 'dette / fonds propres',
  ve: 'valeur d’entreprise (capitalisation + dette)',
  ve_ebitda: 'VE / EBITDA',
  ve_ca: 'VE / chiffre d’affaires',
  per: 'capitalisation / résultat net (PER)',
  beta_u: 'bêta désendetté',
  beta_3ans: 'bêta coté 3 ans',
  beta_1an: 'bêta coté 1 an',
  is_effectif: 'taux d’impôt effectif',
};

export function fieldOf(s: Societe, f: string): number | undefined {
  switch (f) {
    case 'ca': return last(s.ca);
    case 'ebitda': return last(s.ebitda);
    case 'rn': return last(s.rn);
    case 'marge_ebitda': return div(last(s.ebitda), last(s.ca));
    case 'marge_nette': return div(last(s.rn), last(s.ca));
    case 'croissance_ca': { const a = last(s.ca), b = prev(s.ca); return a !== undefined && b ? a / b - 1 : undefined; }
    case 'levier': return div(s.dette, last(s.ebitda));
    case 've': return s.capitalisation !== undefined ? s.capitalisation + (s.dette ?? 0) : undefined;
    case 've_ebitda': { const e = last(s.ebitda); return s.capitalisation !== undefined && e && e > 0 ? (s.capitalisation + (s.dette ?? 0)) / e : undefined; }
    case 've_ca': return div(s.capitalisation !== undefined ? s.capitalisation + (s.dette ?? 0) : undefined, last(s.ca));
    case 'per': { const r = last(s.rn); return s.capitalisation !== undefined && r && r > 0 ? s.capitalisation / r : undefined; }
  }
  const v = (s as unknown as Record<string, unknown>)[f];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// ── Les statistiques ──
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stats(values: number[]) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return { n: v.length, min: v[0], q1: quantile(v, 0.25), mediane: quantile(v, 0.5), q3: quantile(v, 0.75), max: v[v.length - 1], moyenne: v.reduce((a, b) => a + b, 0) / v.length };
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const has = (hay: unknown, needle: unknown) => {
  const n = norm(needle);
  return !n || norm(hay).includes(n);
};
const pct = (x?: number, d = 2) => (x === undefined ? '—' : `${(x * 100).toFixed(d).replace('.', ',')} %`);
const num = (x?: number, d = 2) => (x === undefined ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: d }));
const show = (f: string, x?: number) => (x === undefined ? '—' : /marge|croissance|is_|gearing/.test(f) ? pct(x, 1) : num(x, /beta|ve_|per|levier/.test(f) ? 2 : 0));

/** Les noms de pays qu'on écrit souvent autrement que Damodaran (en français, ou en anglais courant). */
const ALIASES: Record<string, string> = {
  'ivory coast': 'cote d ivoire', 'cote divoire': 'cote d ivoire', 'senegal': 'senegal', 'afrique du sud': 'south africa', 'maroc': 'morocco',
  'algerie': 'algeria', 'tunisie': 'tunisia', 'egypte': 'egypt', 'cameroun': 'cameroon', 'nigeria': 'nigeria', 'kenya': 'kenya', 'ghana': 'ghana',
  'etats unis': 'united states', 'usa': 'united states', 'royaume uni': 'united kingdom', 'uk': 'united kingdom', 'allemagne': 'germany',
  'espagne': 'spain', 'italie': 'italy', 'belgique': 'belgium', 'suisse': 'switzerland', 'pays bas': 'netherlands', 'chine': 'china',
  'japon': 'japan', 'inde': 'india', 'bresil': 'brazil', 'mexique': 'mexico', 'arabie saoudite': 'saudi arabia', 'emirats arabes unis': 'united arab emirates',
  'turquie': 'turkey', 'grece': 'greece', 'pologne': 'poland', 'irlande': 'ireland', 'autriche': 'austria', 'suede': 'sweden', 'norvege': 'norway',
  'danemark': 'denmark', 'finlande': 'finland', 'ethiopie': 'ethiopia', 'tanzanie': 'tanzania', 'ouganda': 'uganda', 'zambie': 'zambia',
  'namibie': 'namibia', 'mauritanie': 'mauritania', 'guinee': 'guinea', 'gabon': 'gabon', 'congo': 'congo', 'rdc': 'democratic republic of congo',
};

/** Trouve une clé d'un dictionnaire par son nom, même approximatif (accents, majuscules, nom français). */
function findKey<T>(dict: Record<string, T>, name: unknown): string | undefined {
  const raw = norm(name);
  const n = ALIASES[raw] ?? raw;
  if (!n) return undefined;
  const keys = Object.keys(dict);
  return keys.find((k) => norm(k) === n) ?? keys.find((k) => norm(k).startsWith(n)) ?? keys.find((k) => norm(k).includes(n) || n.includes(norm(k)));
}

// ── Les demandes ──
export type Query = Record<string, unknown>;

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(/[,;]/).map((x) => x.trim()) : []);
const numOrUndef = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : undefined);

/** Les sociétés qui passent les filtres (secteur, lieu, statut, seuils, exclusions). */
export function selectSocietes(d: Wacc43, q: Query): Societe[] {
  const f = (q.filtres ?? q.filters ?? q) as Record<string, unknown>;
  const min = (q.min ?? {}) as Record<string, unknown>;
  const max = (q.max ?? {}) as Record<string, unknown>;
  const out = listOf(q.exclure ?? q.retirer).map(norm);
  const inds = listOf(f.industrie ?? f.industry);
  const list = Object.values(d.comparables.societes).filter((s) => {
    if (inds.length && !inds.some((i) => has(s.industrie, i) || has(s.activite, i))) return false;
    if (!has(s.pays, f.pays ?? f.country)) return false;
    if (!has(s.zone, f.zone)) return false;
    if (!has(s.continent, f.continent)) return false;
    if (!has(s.place, f.place)) return false;
    if (f.statut && norm(s.statut) !== norm(f.statut)) return false;
    if (f.nom && !has(s.nom, f.nom)) return false;
    if (f.activite && !has(`${s.activite} ${s.presentation}`, f.activite)) return false;
    for (const [k, v] of Object.entries(min)) { const x = fieldOf(s, k), b = numOrUndef(v); if (b !== undefined && (x === undefined || x < b)) return false; }
    for (const [k, v] of Object.entries(max)) { const x = fieldOf(s, k), b = numOrUndef(v); if (b !== undefined && (x === undefined || x > b)) return false; }
    if (out.length && out.some((o) => norm(s.nom).includes(o) || norm(s.ticker) === o)) return false;
    return true;
  });
  return list;
}

/** Retire les valeurs aberrantes d'un champ (règle de Tukey : hors de [Q1 − 1,5 × IQR ; Q3 + 1,5 × IQR]). */
export function tukey(list: Societe[], field: string): { kept: Societe[]; removed: { s: Societe; v: number }[]; bounds?: [number, number] } {
  const st = stats(list.map((s) => fieldOf(s, field)).filter((x): x is number => x !== undefined));
  if (!st || st.n < 4) return { kept: list, removed: [] };
  const iqr = st.q3 - st.q1;
  const lo = st.q1 - 1.5 * iqr, hi = st.q3 + 1.5 * iqr;
  const kept: Societe[] = [], removed: { s: Societe; v: number }[] = [];
  for (const s of list) {
    const v = fieldOf(s, field);
    if (v !== undefined && (v < lo || v > hi)) removed.push({ s, v }); else kept.push(s);
  }
  return { kept, removed, bounds: [lo, hi] };
}

function societes(d: Wacc43, q: Query): string {
  let list = selectSocietes(d, q);
  const lines: string[] = [];
  lines.push(`${list.length} société${list.length > 1 ? 's' : ''} dans l'échantillon (sur ${Object.keys(d.comparables.societes).length} dans la base).`);
  // les valeurs aberrantes, retirées une à une avec leur raison
  for (const field of listOf(q.aberrants ?? q.outliers)) {
    const t = tukey(list, field);
    if (t.removed.length && t.bounds) {
      lines.push(`Valeurs aberrantes de ${field} (Tukey, hors de ${show(field, t.bounds[0])} à ${show(field, t.bounds[1])}) : ${t.removed.length} retirée${t.removed.length > 1 ? 's' : ''} : ${t.removed.slice(0, 12).map((r) => `${r.s.nom} (${show(field, r.v)})`).join(', ')}${t.removed.length > 12 ? '…' : ''}.`);
      list = t.kept;
    } else lines.push(`Aucune valeur aberrante de ${field}.`);
  }
  const tri = String(q.tri ?? q.sort ?? '');
  if (tri) {
    const desc = String(q.ordre ?? q.order ?? 'desc') !== 'asc';
    list = [...list].sort((a, b) => {
      const x = fieldOf(a, tri), y = fieldOf(b, tri);
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return desc ? y - x : x - y;
    });
  }
  const keep = numOrUndef(q.garder ?? q.top);
  if (keep !== undefined) { list = list.slice(0, Math.max(1, keep)); lines.push(`Gardées : les ${list.length} premières${tri ? ` selon ${tri}` : ''}.`); }
  // les statistiques demandées (par défaut : bêta désendetté, gearing, marge, VE/EBITDA)
  const fields = listOf(q.stats).length ? listOf(q.stats) : ['beta_u', 'gearing', 'marge_ebitda', 've_ebitda', 'per'];
  for (const field of fields) {
    const st = stats(list.map((s) => fieldOf(s, field)).filter((x): x is number => x !== undefined));
    lines.push(st
      ? `${field} (${FIELDS[field] ?? field}) : médiane ${show(field, st.mediane)}, Q1 ${show(field, st.q1)}, Q3 ${show(field, st.q3)}, moyenne ${show(field, st.moyenne)}, min ${show(field, st.min)}, max ${show(field, st.max)} (${st.n} valeurs)`
      : `${field} : aucune valeur.`);
  }
  // le tableau (les premières lignes)
  const limit = Math.min(50, numOrUndef(q.limite ?? q.limit) ?? 15);
  const cols = listOf(q.colonnes ?? q.columns).length ? listOf(q.colonnes ?? q.columns) : ['capitalisation', 'marge_ebitda', 'levier', 've_ebitda', 'beta_u'];
  if (list.length) {
    lines.push('', `| Société | Pays | Industrie | Statut | ${cols.join(' | ')} |`, `|${'---|'.repeat(4 + cols.length)}`);
    for (const s of list.slice(0, limit)) lines.push(`| ${s.nom} (${s.ticker ?? ''}, ${s.place ?? ''}) | ${s.pays} | ${s.industrie ?? ''} | ${s.statut ?? '—'} | ${cols.map((c) => show(c, fieldOf(s, c))).join(' | ')} |`);
    if (list.length > limit) lines.push(`… et ${list.length - limit} autres.`);
  }
  return lines.join('\n');
}

function pays(d: Wacc43, q: Query): string {
  const names = listOf(q.nom ?? q.pays ?? q.name);
  if (!names.length) return `Pays de la base (${Object.keys(d.pays).length}) : ${Object.keys(d.pays).join(', ')}.`;
  return names.map((n) => {
    const k = findKey(d.pays, n);
    if (!k) return `${n} : introuvable dans la base Damodaran.`;
    const p = d.pays[k];
    return `${k} : prime de risque pays ${pct(p.crp)}, spread de défaut ${pct(p.ds)}, taux d'IS ${pct(p.tax, 1)}${p.zone ? `, zone ${p.zone}` : ''}.`;
  }).join('\n');
}

function industries(d: Wacc43, q: Query): string {
  const names = listOf(q.nom ?? q.industrie ?? q.name);
  if (!names.length) return `Industries Damodaran (${Object.keys(d.industries).length}) : ${Object.keys(d.industries).join(', ')}.`;
  return names.map((n) => {
    const k = findKey(d.industries, n);
    if (!k) return `${n} : introuvable parmi les industries Damodaran.`;
    const i = d.industries[k];
    return `${k} : bêta désendetté ${num(i.beta, 3)}, D/E sectoriel ${num(i.de, 3)}, couverture des intérêts (spread) ${num(i.spread, 3)}.`;
  }).join('\n');
}

function taux(d: Wacc43, q: Query): string {
  const year = numOrUndef(q.annee ?? q.year);
  const mat = String(q.maturite ?? q.maturity ?? '').replace(/\D/g, '');
  const keys = Object.keys(d.rf).filter((k) => (!year || k.startsWith(String(year))) && (!mat || k.endsWith(`-${mat}`))).sort().reverse();
  return keys.length ? keys.map((k) => `Taux US Treasury ${k.split('-')[1]} ans, moyenne ${k.split('-')[0]} : ${num(d.rf[k], 3)} %`).join('\n') : 'Aucun taux pour ces critères.';
}

/** Le CMPC, méthode indirecte, comme WACC43 (moteur/wacc_core.py : compute). */
export function cmpc(d: Wacc43, q: Query) {
  const notes: string[] = [];
  const year = numOrUndef(q.annee ?? q.year) ?? Number((d.defaults?.year as number) ?? new Date().getFullYear());
  const mat = String(q.maturite ?? q.maturity ?? '30').includes('10') ? '10' : '30';
  const pk = findKey(d.pays, q.pays ?? q.country);
  const p = pk ? d.pays[pk] : undefined;
  if (!pk) notes.push('Pays introuvable : prime de risque et spread de défaut à 1 %, IS à 25 %.');
  const crp = p?.crp ?? 0.01, ds = p?.ds ?? 0.01, tax = numOrUndef(q.is ?? q.tax) ?? p?.tax ?? 0.25;
  const ik = findKey(d.industries, q.industrie ?? q.industry);
  const ind = ik ? d.industries[ik] : undefined;
  if (!ik) notes.push('Industrie introuvable : bêta désendetté 1, D/E 0,5.');
  let betaU = ind?.beta ?? 1, gearing = ind?.de ?? 0.5;
  // le bêta des comparables : la médiane des bêtas désendettés de l'échantillon, ré-endettée au gearing médian
  if (q.comparables || q.filtres) {
    const list = selectSocietes(d, (q.comparables ?? q) as Query);
    const bu = stats(list.map((s) => s.beta_u).filter((x): x is number => typeof x === 'number'));
    const ge = stats(list.map((s) => s.gearing).filter((x): x is number => typeof x === 'number'));
    if (bu && ge) { betaU = bu.mediane; gearing = ge.mediane; notes.push(`Bêta et gearing : médianes de ${bu.n} comparables.`); }
    else notes.push('Pas de comparables exploitables : bêta et gearing sectoriels Damodaran.');
  }
  const cible = numOrUndef(q.gearing_cible ?? q.gearing);
  if (cible !== undefined) gearing = cible;
  const rfPct = d.rf[`${year}-${mat}`];
  if (rfPct === undefined) notes.push(`Taux US ${mat} ans indisponible pour ${year} : 3 % retenu.`);
  const a = rfPct === undefined ? 0.03 : rfPct / 100 + crp;
  const aDette = rfPct === undefined ? 0.03 : rfPct / 100 + ds;
  const c = d.mature ?? 0.06;
  const dPrime = numOrUndef(q.prime_taille ?? q.d) ?? 0;
  const ePrime = numOrUndef(q.prime_specifique ?? q.e) ?? 0;
  const beta = betaU * (1 + gearing * (1 - tax));
  const re = a + beta * c + dPrime + ePrime;
  let spread = ind?.spread ?? 0.05;
  for (const [threshold, s] of d.adjustment?.rows ?? []) if (spread <= threshold) { spread = s + (d.adjustment.correction ?? 0); break; }
  const qe = 1 / (1 + gearing), qd = 1 - qe;
  const rdAvant = spread + aDette;
  const rd = rdAvant * (1 - tax);
  const wacc = re * qe + rd * qd;
  const infRef = numOrUndef(q.inflation_ref) ?? 0.025;
  const infLoc = numOrUndef(q.inflation_locale ?? q.inflation_local);
  const waccLocal = infLoc === undefined ? undefined : (1 + wacc) * (1 + infLoc) / (1 + infRef) - 1;
  return { year, mat, pays: pk, industrie: ik, rfPct, crp, ds, tax, betaU, gearing, beta, c, dPrime, ePrime, re, spread, rdAvant, rd, qe, qd, wacc, infRef, infLoc, waccLocal, notes };
}

function cmpcText(d: Wacc43, q: Query): string {
  const r = cmpc(d, q);
  return [
    `CMPC — ${r.pays ?? '?'} · ${r.industrie ?? '?'} · ${r.year}, taux US ${r.mat} ans`,
    `Taux sans risque local = taux US ${num(r.rfPct, 3)} % + prime pays ${pct(r.crp)} = ${pct((r.rfPct ?? 3) / 100 + r.crp)}`,
    `Bêta désendetté ${num(r.betaU, 3)}, gearing ${num(r.gearing, 3)}, IS ${pct(r.tax, 1)} → bêta ré-endetté ${num(r.beta, 3)} (Hamada)`,
    `Prime de marché mature ${pct(r.c)}${r.dPrime ? `, prime de taille ${pct(r.dPrime)}` : ''}${r.ePrime ? `, prime spécifique ${pct(r.ePrime)}` : ''}`,
    `Coût des fonds propres = ${pct(r.re)}`,
    `Coût de la dette avant impôt = spread ${pct(r.spread)} + taux US + spread de défaut ${pct(r.ds)} = ${pct(r.rdAvant)} ; après impôt ${pct(r.rd)}`,
    `Poids : fonds propres ${pct(r.qe, 1)}, dette ${pct(r.qd, 1)}`,
    `CMPC (en dollars) = ${pct(r.wacc)}`,
    r.waccLocal !== undefined ? `CMPC en monnaie locale (inflation locale ${pct(r.infLoc)} contre ${pct(r.infRef)}) = ${pct(r.waccLocal)}` : '',
    ...r.notes.map((n) => `Note : ${n}`),
  ].filter(Boolean).join('\n');
}

/** Ce que contient la base (pour commencer). */
export function summaryWacc43(d: Wacc43): string {
  const soc = Object.values(d.comparables.societes);
  const count = (k: keyof Societe) => {
    const m = new Map<string, number>();
    for (const s of soc) { const v = String(s[k] ?? '—'); m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return [
    `Base 43 WACC : ${soc.length} sociétés cotées (${d.comparables.source ?? 'exports S&P Capital IQ'}), ${Object.keys(d.pays).length} pays et ${Object.keys(d.industries).length} industries Damodaran, taux US Treasury ${Object.keys(d.rf).sort()[0]?.slice(0, 4)}–${Object.keys(d.rf).sort().pop()?.slice(0, 4)}, prime de marché mature ${pct(d.mature)}.`,
    `Continents : ${count('continent').map(([k, n]) => `${k} ${n}`).join(', ')}.`,
    `Zones : ${count('zone').map(([k, n]) => `${k} ${n}`).join(', ')}.`,
    `Industries (sociétés) : ${count('industrie').slice(0, 40).map(([k, n]) => `${k} ${n}`).join(', ')}…`,
    `Statut : ${count('statut').map(([k, n]) => `${k} ${n}`).join(', ')}.`,
    `Champs : ${Object.entries(FIELDS).map(([k, v]) => `${k} (${v})`).join(' ; ')}.`,
  ].join('\n');
}

/** Exécute une demande de Hares sur la base. */
export function queryWacc43(d: Wacc43, q: Query): string {
  const src = norm(q.source ?? q.type ?? 'societes');
  if (src.startsWith('resume') || src.startsWith('info')) return summaryWacc43(d);
  if (src.startsWith('pays') || src.startsWith('countr')) return pays(d, q);
  if (src.startsWith('indus')) return industries(d, q);
  if (src.startsWith('taux') || src === 'rf') return taux(d, q);
  if (src.startsWith('cmpc') || src.startsWith('wacc')) return cmpcText(d, q);
  return societes(d, q);
}
