# L'open space : notes pour Claude Code

Un bureau en pixel art où l'on regarde une équipe d'agents IA travailler : Roré (le chef, rôle `chef`) et un
seul analyste (rôle `analyse`), pour une responsable marketing et communication. Hébergé sur Cloudflare.
D'après « Le Bureau des agents » (VibesMoney, MIT).

## Quatre moteurs (et le levier)

- **Version locale** (`npm start`, `server/`) : le pont Node lance Claude Code avec le compte Claude de l'utilisateur
  (`claude -p`, stream-json, `--agents` : un seul `analyste`). Le navigateur le détecte (WebSocket `/ws` sur localhost)
  et envoie `team` (règlement + tiroir + skills) avec chaque `start`/`say` ; les skills sont copiés dans `.skills/` de la
  mission ; les lignes de `a-retenir.md` rejoignent le tiroir (`src/net/link.ts`).
- **En ligne, IA gratuite** : Worker Cloudflare + Workers AI (`worker/index.ts`), équipe dans le navigateur (`src/local/`).
- **En ligne, Claude** : clé API Claude de l'utilisatrice (« Se connecter à Claude »), appels directs du navigateur à
  `api.anthropic.com` (`src/local/api.ts`, `claude`). Jamais d'identifiants d'abonnement Claude dans la version en ligne :
  Anthropic ne l'autorise pas.
- **En local, IA gratuite** : Ollama sur le PC. Le bureau tourne dans le navigateur (`bureau.init('ollama')`, moteur
  `ollama`) ; le serveur local relaie `/api/ollama/tags|chat` vers Ollama (`OLLAMA_HOST`, par défaut 127.0.0.1:11434)
  et sert `/api/search`, `/api/fetch`, `/api/ping` (code partagé avec le Worker : `shared/web.ts`). Ces routes exigent le
  bon `Host`, une origine du bureau et l'en-tête `x-code`.
- **Le levier** (meuble `lever`, `pullLever` dans `src/net/link.ts`) : en local, il bascule `brain` (`claude` ↔ `free`,
  dans localStorage) et recharge la page ; en ligne, il passe le modèle de Workers AI à Claude (clé API) et inversement.

## Les commandes

- `npm start` : version locale (vérifie Node, construit, lance `server/index.ts` sur http://localhost:4848).
- `npm run dev` : le bureau avec Vite (http://localhost:5174) ; `/api` est relayé vers `npx wrangler dev` (port 8787).
- `npm run check` : les types (client, Worker, serveur local). `npm run build` : la construction. Les deux doivent passer.
- `npm run deploy` : construction + `wrangler deploy` (normalement fait par Cloudflare à chaque push sur `main`).

## Comment c'est fait

- **`worker/index.ts`** : le seul code serveur. Il ne stocke rien. `/api/chat` (Workers AI, modèles autorisés dans
  `MODELS`), `/api/search` (Tavily si `TAVILY_KEY`, sinon DuckDuckGo), `/api/fetch` (texte d'une page, adresses
  privées refusées), `/api/ping`. Tout passe par le secret `ACCESS_CODE` (en-tête `x-code`) et refuse les autres origines.
- **`src/local/`** : le bureau tourne dans le navigateur.
  - `agent.ts` : les boucles de Roré (`runChef`) et de l'analyste (`runAnalyst`). L'IA répond par un objet JSON
    `{ say, action, input }` ; chaque action devient des `OfficeEvent` (`act`, `act_done`, `hire`, `report`, `leave`…).
  - `bureau.ts` : remplace l'ancien serveur local. Il reçoit les `ClientMsg`, renvoie des `ServerMsg` au store, et range
    missions, journaux, fichiers et mémoire de Roré dans IndexedDB (`db.ts`). 30 missions au plus.
  - `drawer.ts` (le tiroir : couleurs, types de texte, notes ; localStorage), `skills.ts` (format SKILL.md, skills de
    départ dans `starter-skills.ts`), `api.ts` (appels au Worker, code d'accès), `zip.ts` (téléchargements).
- **`shared/protocol.ts`** et **`shared/activity.ts`** : les événements, les métiers (`ACTIVE_ROLES`), les outils et
  les phrases des bulles (`describeAct`).
- **`src/state/store.ts`** (zustand) range les événements et les transmet au moteur (`src/engine/`).
- **`src/engine/`** : le monde, le dessin (le décor et les robots sont dessinés en code), la caméra, les clics.
  Le tiroir est le meuble `cabinet` (`furniture.ts`, `layout.ts`, `hits.ts`, `ui/interact.ts`).
- **Les personnages** : le catalogue `src/characters/catalog.json` (identité, rôles, personnalité `idle`, tenue
  `outfit`). Ce sont des robots du bureau, au gabarit d'origine (20 × 24, ancrage aux pieds) : `robots.ts` dessine une
  tenue (couleurs + pièces `Part`) sur le robot ; `robotSprite(clé, …)` prend un personnage ou un métier (son robot
  d'origine, inchangé). `src/engine/characters.ts` : `idleEffect` (la personnalité au repos, jouée par `world.ts`) et
  qui porte quoi (`lookFor`, `setLook`, localStorage `bureau:looks`, par prénom ; jamais deux fois le même s'il en
  reste un libre). La galerie : `ui/Characters.tsx` (fenêtre `characters`).
- **Piloter Roré** : double-clic sur lui (`Office.tsx`) → `ui/drive.ts` (flèches, E, Échap) → `world.drive` / `steer` ; `ui/pressE.ts`
  trouve ce qui est à portée (`nearRore`) et place l'étiquette « E · … » ;
  pendant ce temps ses tâches attendent (`driveStep` dans `world.update`), collisions sur `walkGrid`, caméra qui suit.
- **La Pause** (`room: 'annex'` dans le store ; à droite : porte dans le mur de droite du bureau, dans celui de gauche de la Pause ; ☕, touche D) :
  `engine/annex.ts` (plan, activités `SPOTS`, vie des personnages `Pal`, discussions et jeux à deux, `talk`, `poke`,
  pilotage de Roré), `engine/annexDraw.ts` (pièce, meubles, rendu, lumière). Elle vit aussi quand on n'y est pas. Côté
  interface : `ui/place.ts` (`goRoom`, les portes), `ui/AnnexLayer.tsx` (prénoms et bulles). Les goûts (`hobbies`) et
  les répliques (`lines`) de chacun sont dans le catalogue des personnages. Le jukebox y joue aussi (`annex.musicOn`, `jukeboxLights`).
- **Dehors** (`room: 'outside'`, derrière la porte d'entrée en bas du bureau ; 🌿, touche O) : `engine/outside.ts` (le bord de la
  falaise `coastY`, `HORIZON`, la grille, `Walker` pour Roré et les collègues, places assises `SEATS` avec leur regard, chemins `PATHS`,
  vent `gust`), `engine/outsideDraw.ts` (deux plans : le sol en 3/4 comme le bureau, et un fond en perspective, ciel, mer jusqu'à
  l'horizon, phare au loin ; maison de bord de mer avec l'enseigne 43, fumée de cheminée, prairie animée, pins, manche à air, lumière), `audio/outside.ts` (vent, mer et
  musique lofi en Web Audio, sans fichier ; coupé avec le son). `goRoom` (`ui/place.ts`) repasse toujours par le bureau. Le jeu de
  pêche se branche sur `outside.onFish`.
- **Les heures de travail** (`workHours` dans le store, préférence `bureau:workHours`, `isWorkTime` ; champ dans les Réglages) :
  pendant, seul Roré sort ; en dehors, `syncOutside` (`ui/place.ts`) envoie trois collègues dehors (`outside.setGuests`) et les
  retire de la Pause (`annex.setAway`, `Pal.away` ; `annex.pals` ne liste que ceux qui sont là, `annex.everyone` tout le monde).
- **S'asseoir** : E sur un pouf, un tabouret, le canapé (`annex.seatNear/sitRore/standRore`), le canapé ou son fauteuil au bureau
  (`world.seatNear/sitChef/standChef`, `SOFA_SEATS`), le banc et le tronc (`outside.seatNear/sitRore/standRore`). Une flèche ou « E · Se lever » le relève.
- **Les mini-jeux** (fenêtre `game`) : `ui/games/` (`PingPong.tsx`, `SpartanRun.tsx`, boucle à pas fixe et scores
  localStorage `bureau:jeux` dans `common.ts`). Ouverts par un clic sur la table de ping-pong ou une borne (`interactAnnex`).
- **Hares** (rôle `hares`, s'assoit au coin Analyse) : le financier, sur la base 43 WACC. `shared/wacc43.ts` extrait `DATA` de la page
  WACC43 et l'interroge (sociétés, pays, industries, taux, CMPC identique à `moteur/wacc_core.py`). En ligne, `/api/wacc43` du Worker
  relaie la page (pas de parsing côté Worker) et le navigateur l'interroge (`src/local/wacc43.ts`, action `base43` de `runHares`) ;
  en local, `server/wacc43.ts` (route et dossier `.wacc43` pour le sous-agent Claude Code `hares`). Skills : `hares-*` dans `starter-skills.ts`.
- **Les thèmes des coins** : `DESKS` et `CHAIRS` dans `furniture.ts`, `themedRug` dans `room.ts` (un style par métier).
- **`src/ui/`** : l'interface React. `Extras.tsx` : le tiroir, les skills, le règlement, la sauvegarde. `Jukebox.tsx` : la
  liste YouTube et le petit lecteur (`src/audio/music.ts` pilote l'iframe youtube-nocookie par `postMessage`).
- La note « Comment ça marche » est le meuble `note` (fenêtre `howto` dans `Rooms.tsx`). Roré se promène après 2 minutes
  d'inactivité (`stroll`, `IDLE_STROLL` dans `world.ts`). `findClaude` lit `claude --help` : sans `--restricted` ni mode
  « auto » (version ancienne), le pont s'en passe (`supports`). Le panneau de droite se replie (`panelOpen`, touche P).

## Les règles

- **Français, tutoiement, phrases courtes** dans tout ce que l'utilisatrice lit. Roré est un homme : accords au masculin. La patronne (l’utilisatrice) reste au féminin.
- **Moins de données** : rien côté serveur ; pas de fichier de musique ni de voix ; la musique vient des liens YouTube
  de l'utilisatrice (youtube-nocookie.com, seule exception à la CSP : `frame-src`) ; pas d'image externe.
- **Sécurité** : jamais de secret dans le dépôt (`.dev.vars` est ignoré) ; les pages HTML créées par l'équipe s'affichent
  dans un iframe `sandbox` sans `allow-same-origin`.
- **zustand** : un sélecteur qui renvoie un nouveau tableau ou objet passe par `useShallow`.
- **Serveur local** : Node ≥ 22.18 exécute le TypeScript directement ; dans `server/` et `shared/`, imports en `.ts` et
  syntaxe effaçable seulement (pas d'`enum`, pas de `namespace`). Sous Windows, `findClaude` gère `claude.exe` et `claude.cmd`.
