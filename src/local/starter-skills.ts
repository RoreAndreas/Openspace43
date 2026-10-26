// Les skills installés d'office (désactivables) : deux méthodes de base pour une responsable marketing
// et communication, et trois pour Hares, tirées de son onglet dans WACC43 (échantillon, CMPC, multiples).
// Chacun est un SKILL.md complet.

export const STARTER_SKILLS: string[] = [
  `---
name: rapport-marketing
description: Structure et règles de rédaction d'un rapport marketing ou communication clair, sourcé et actionnable.
---
# Rapport marketing

À utiliser pour tout rapport rendu à la responsable marketing et communication.

## Structure
1. **Titre** et date du rapport.
2. **L'essentiel en 5 lignes** : les conclusions, d'abord.
3. **Contexte et question posée** (2 à 3 phrases).
4. **Constats** : par thème, avec les chiffres clés et leur source (lien + date du relevé).
5. **Tableau de synthèse** quand on compare (marques, canaux, offres, publics).
6. **Recommandations** : 3 à 5 actions concrètes, chacune avec l'objectif visé, le canal et une priorité (haute, moyenne, basse).
7. **Sources** : la liste des liens consultés.

## Règles
- Phrases courtes, vocabulaire du métier (cible, persona, positionnement, notoriété, engagement, conversion).
- Aucun chiffre sans source. Ce qui n'est pas sourcé est présenté comme une estimation.
- Respecte les références du tiroir : ton, typographies, couleurs de la charte (cite-les quand tu proposes des visuels).
- Fichier Markdown, nommé simplement (rapport-sujet.md).
`,
  `---
name: veille-concurrentielle
description: Méthode pour analyser des concurrents ou des marques de référence (offre, prix, communication, réseaux sociaux, avis).
---
# Veille concurrentielle

## Pour chaque concurrent
- **Positionnement** : promesse, cible, ton de marque.
- **Offre et prix** : gammes, prix publics relevés sur le site officiel (avec la date).
- **Communication** : canaux actifs (site, Instagram, LinkedIn, TikTok, Facebook, newsletter), fréquence et formats, campagnes récentes.
- **Image** : ce que disent les avis clients (points forts, points faibles), avec la source.

## Méthode
1. Commence par le site officiel, puis une recherche « nom + avis » et « nom + campagne ».
2. Lis 2 à 4 pages au plus par concurrent : va à l'essentiel.
3. Termine par un tableau comparatif (une ligne par concurrent) et 3 opportunités de différenciation.
4. Note les liens et la date de chaque relevé.
`,
  `---
name: hares-echantillon
description: Hares — constituer et affiner un échantillon de sociétés cotées comparables dans la base 43 WACC (filtres, seuils, aberrants, médianes et quartiles).
---
# Échantillon de comparables (Hares)

La méthode de l'onglet HARES de WACC43, appliquée à la base 43 WACC (8 000 sociétés cotées, exports S&P Capital IQ, montants en millions).

## Démarche, étape par étape (chaque étape s'applique au résultat de la précédente)
1. **Partir large** : l'industrie (champ industrie, ou un mot de l'activité), puis le lieu (continent, zone, pays, place de cotation). Note l'effectif à chaque étape.
2. **Le statut** : groupe ou filiale. Il est déduit des descriptions S&P (« subsidiary of… ») : dis-le quand tu t'en sers.
3. **Les seuils** : marge d'EBITDA, levier (dette / EBITDA), multiples (VE/EBITDA, PER), capitalisation. Un seuil par critère, motivé.
4. **Les valeurs aberrantes** : règle de Tukey sur le multiple ou le bêta étudié (hors de Q1 − 1,5 × IQR à Q3 + 1,5 × IQR). Chaque société retirée est nommée, avec sa valeur.
5. **Retirer à la main** les sociétés non comparables (activité différente, holding diversifiée), en disant pourquoi.
6. **Résumer** : effectif final, médiane, Q1 et Q3 des grandeurs utiles (bêta désendetté, gearing, marge, VE/EBITDA, PER), et le tableau des sociétés retenues.

## Règles
- Un échantillon de 5 à 20 sociétés est l'idéal ; en dessous de 5, élargis la zone avant d'assouplir les seuils.
- Toujours la médiane, jamais la moyenne seule : les multiples ont des queues longues.
- Limites à rappeler : la trésorerie manque aux exports (levier en dette brute), les montants sont dans la devise de l'export.
- Livrable : un fichier Markdown (echantillon-sujet.md) avec la méthode, le fil des étapes et leurs effectifs, les écartées et pourquoi, le tableau final.
`,
  `---
name: hares-cmpc
description: Hares — calculer un coût moyen pondéré du capital (CMPC, WACC) par la méthode indirecte de WACC43, avec les données Damodaran et les taux US Treasury de la base 43 WACC.
---
# CMPC, méthode indirecte (Hares)

## Les ingrédients (base 43 WACC)
- **Taux sans risque** : taux US Treasury moyen de l'année (30 ans par défaut, ou 10 ans).
- **Prime de risque pays** et **spread de défaut** du pays (Damodaran), **taux d'IS** du pays.
- **Bêta désendetté** et **D/E (gearing)** du secteur (Damodaran), ou les médianes d'un échantillon de comparables (skill hares-echantillon).
- **Prime de marché mature** (Damodaran).

## Le calcul (identique à WACC43)
1. Taux sans risque local = taux US + prime de risque pays.
2. Bêta ré-endetté (Hamada) = bêta désendetté × (1 + gearing × (1 − IS)).
3. Coût des fonds propres = taux local + bêta ré-endetté × prime de marché + prime de taille + prime spécifique.
4. Coût de la dette = (spread selon la table d'ajustement + taux US + spread de défaut du pays) × (1 − IS).
5. Poids : fonds propres = 1 / (1 + gearing), dette = le reste.
6. CMPC = coût des fonds propres × E/V + coût de la dette × D/V.
7. En monnaie locale : (1 + CMPC) × (1 + inflation locale) / (1 + inflation de référence) − 1.

## Règles
- Présente chaque étape avec sa valeur et sa source ; dis quand une valeur par défaut a été retenue.
- Avec des comparables : le bêta est la médiane des bêtas désendettés de l'échantillon, ré-endettée au gearing médian (ou au gearing cible s'il est donné).
- Termine par une sensibilité simple : le CMPC à ± 1 point de prime spécifique et à ± 0,1 de bêta.
- Livrable : cmpc-sujet.md.
`,
  `---
name: hares-multiples
description: Hares — valoriser une société par les multiples de comparables cotés (VE/EBITDA, VE/CA, PER) à partir de la base 43 WACC.
---
# Valorisation par les comparables (Hares)

1. **L'échantillon** : constitue-le avec le skill hares-echantillon (même secteur, zone proche, taille comparable), aberrants retirés.
2. **Les multiples** : médiane, Q1 et Q3 de VE/EBITDA, VE/CA et PER sur l'échantillon (multiples négatifs ou nuls exclus).
3. **L'application** : agrégat de la société valorisée × multiple médian, avec la fourchette Q1–Q3.
   - VE/EBITDA et VE/CA donnent une **valeur d'entreprise** : passe aux fonds propres en retirant la dette nette (et les intérêts minoritaires s'il y en a).
   - Le PER donne directement la **valeur des fonds propres**.
4. **La synthèse** : un tableau multiple par multiple (bas, médian, haut) et une fourchette retenue, motivée (le multiple le plus pertinent pour le secteur pèse plus).

## Règles
- Le levier des comparables est en dette brute (trésorerie absente des exports) : la VE des comparables est donc majorée, dis-le.
- Montants dans la devise de l'export S&P : convertis avant de comparer à la société valorisée, et cite le taux retenu.
- Livrable : valorisation-sujet.md.
`,
];
