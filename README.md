# L'open space

**Tu dis ce que tu veux. Roré, le chef de projet, confie le travail à son analyste, et tu le regardes faire.**

Un bureau en pixel art où une petite équipe d'agents IA travaille pour une responsable marketing et communication :

- **Roré**, le chef de projet, lit ta demande, écrit le plan, confie le travail et vérifie le rendu ;
- **un analyste**, qui cherche sur internet, analyse et rédige les rapports ;
- **Hares**, le financier, qui interroge ta base 43 WACC (le site WACC43) : échantillons de sociétés cotées comparables, médianes et quartiles, valeurs aberrantes, multiples et CMPC.

Chaque bulle montre ce que l'agent fait vraiment, à cet instant : une recherche, une page lue, un fichier écrit.

> D'après [Le Bureau des agents](https://github.com/devlikemasta/bureau-des-agents) de [VibesMoney](https://vibesmoney.com) (licence MIT).

## Quatre façons de faire travailler l'équipe

| | Où | Le cerveau | Ce que ça coûte |
|---|---|---|---|
| **En ligne, IA gratuite** | Cloudflare (une adresse web) | Workers AI (Llama) | Gratuit, dans la limite du quota quotidien |
| **En ligne, avec Claude** | Cloudflare | Claude, avec **ta clé API Claude** (« Se connecter à Claude » dans les réglages) | Facturé à l'usage sur ton compte API Claude |
| **Sur ton ordinateur, avec ton compte Claude** | Ton PC (`npm start`) | Claude Code, connecté à **ton abonnement Claude** | Ton abonnement Pro ou Max |
| **Sur ton ordinateur, IA gratuite** | Ton PC (`npm start`) | [Ollama](https://ollama.com), une IA qui tourne sur ton PC | Gratuit (plus lent) |

**Le levier**, à côté du serveur dans le bureau, change le cerveau de l'équipe : orange pour Claude, vert pour l'IA
gratuite. Sur ton ordinateur, il passe de Claude Code à Ollama. En ligne, de Claude (ta clé API) à Workers AI.

Pourquoi l'abonnement Claude ne sert que sur ton ordinateur : Anthropic n'autorise pas une application en ligne à
utiliser la connexion d'un compte Pro ou Max. En ligne, on passe donc par une clé API, créée avec ton compte Claude sur
[platform.claude.com](https://platform.claude.com). Sur ton ordinateur, c'est Claude Code lui-même qui travaille, avec
ton compte : c'est prévu et autorisé.

## Ce qu'il y a dedans

- **Le tiroir de l'analyste** : clique sur le caisson à côté de son bureau, ou sur 🗄️. Il contient trois choses :
  - **Couleurs** : la charte, en codes hexadécimaux ;
  - **Types de texte** : les typographies, le ton, les formats attendus ;
  - **À retenir** : ce que l'équipe doit garder en tête pour la suite. L'analyste peut y ranger lui-même une information importante.

  L'analyste et Roré relisent le tiroir avant chaque mission.
- **Les skills** (🎓) : des méthodes écrites, au format `SKILL.md`, le même que les skills de Claude.
  - Deux sont installées d'office : `rapport-marketing` et `veille-concurrentielle`.
  - On en ajoute d'autres depuis un fichier `.md`, un lien (par exemple un SKILL.md sur GitHub) ou un texte collé.
- **Le règlement du bureau** (⚙️, puis 📜) : qui tu es, ton entreprise, comment travailler pour toi.
- **Les rendus** : chaque rapport se lit dans le bureau ou se télécharge, avec l'historique de ses versions. Une mission entière se télécharge en `.zip`.
- **Les missions précédentes** (touche `H`) : on peut les rejouer.
- **La note « Comment ça marche »** : le post-it jaune, à côté du bureau de Roré.
- **La Pause**, à droite du bureau (la porte « PAUSE », le bouton ☕ ou la touche `D`) : une cuisine et une salle de loisirs où tous les personnages se retrouvent. Chacun y fait ce qu'il aime (café, frigo, repas, console, arcade, bibliothèque, danse, sieste), ils discutent entre eux et jouent à deux au ping-pong ou au baby-foot. Clique sur l'un d'eux : il te parle. Quand le jukebox joue, il s'anime là-bas aussi, et on y danse plus volontiers.

### Hares et la base 43 WACC

Hares travaille sur la base du site WACC43 (8 000 sociétés cotées S&P Capital IQ, primes de risque pays et bêtas sectoriels Damodaran, taux US Treasury). Roré lui confie tout ce qui touche à la finance : un échantillon de comparables, un CMPC, une valorisation par les multiples. Trois skills tirés de l'onglet HARES de WACC43 sont installés d'office : `hares-echantillon`, `hares-cmpc`, `hares-multiples`.

- **En ligne** : le Worker relaie la page publiée de WACC43 (variable `WACC43_URL` dans `wrangler.jsonc`, par défaut https://43wacc.pages.dev/), derrière le code d'accès, gardée une heure en cache. C'est le navigateur qui en extrait la base et l'interroge (`shared/wacc43.ts`) : le Worker gratuit n'a pas le temps de lire 8 Mo de JSON.
- **Sur ton ordinateur** : le serveur local lit ta page WACC43 sur le disque (`WACC43_HTML`, sinon le dépôt `43` rangé à côté de l'open space), sinon le site publié. Avec Claude Code, la base est déposée dans le dossier caché `.wacc43` de la mission, une société par ligne.
- **Prendre les commandes de Roré** : double-clic sur lui, puis les flèches pour le faire marcher (la caméra le suit). `Échap` lui rend la main.
- **Un coin par métier, chacun son style** : le code en futuriste (métal sombre, néons cyan, tapis en circuit imprimé), le design en flashy (laqué rose, chaises jaunes, confettis), la recherche en bibliothèque d'explorateur, la rédaction en bureau d'écrivain, l'analyse en corporate (bleu nuit et or).
- **Les idées de mission** : des bulles grises au-dessus du chat. Après une mission, des idées de retouche.
- **Le jukebox** : colle tes liens YouTube. Lecture, pause, suivant, en boucle (la liste ou un morceau), aléatoire. Un petit lecteur reste en bas à gauche (raccourci `J`).
- **L'écran** : le panneau de droite se replie (la languette, le bouton ▥ ou la touche `P`), et un bouton passe en plein écran.

## Tes données

- **Le serveur ne garde rien.** Les missions, les rapports, le tiroir, les skills et le règlement restent dans le navigateur de la personne qui utilise le bureau.
- **Ce que fait Cloudflare** : il relaie trois choses, l'IA, la recherche web et la lecture des pages.
- **Dans les réglages**, on peut sauvegarder le règlement, le tiroir et les skills dans un fichier, les restaurer, ou tout effacer.
- **Les 30 dernières missions** sont gardées.

## Le mettre en ligne sur Cloudflare (une seule fois, sans rien installer)

1. **Créer le projet.** Sur [dash.cloudflare.com](https://dash.cloudflare.com), va dans **Workers & Pages**, puis **Create**, puis **Import a repository**. Choisis le dépôt **openspace**.
2. **Les réglages de construction** :
   - *Build command* : `npm run build`
   - *Deploy command* : `npx wrangler deploy` (la valeur proposée)

   Lance le déploiement.
3. **Le code d'accès.** Une fois le Worker créé, va dans **Settings**, puis **Variables and Secrets**, puis **Add** :
   - *Type* : **Secret**
   - *Name* : `ACCESS_CODE`
   - *Value* : le code de ton choix, long et difficile à deviner.
4. **Facultatif : une recherche web plus fiable.** Ajoute un deuxième secret `TAVILY_KEY`, avec une clé gratuite créée sur [tavily.com](https://tavily.com) (1 000 recherches par mois). Sans cette clé, la recherche passe par DuckDuckGo.
5. **Ouvrir le bureau** à l'adresse du Worker (`https://openspace.<ton-compte>.workers.dev`). Clique sur ⚙️ et entre le code d'accès : le bureau est prêt.

Ensuite, chaque modification poussée sur la branche `main` du dépôt est remise en ligne automatiquement.

### Se connecter à Claude (en ligne)

1. Avec ton compte Claude, va sur [platform.claude.com](https://platform.claude.com), puis **API Keys**, puis **Create Key**. Ajoute un peu de crédit si ton compte API n'en a pas.
2. Dans le bureau : ⚙️, puis **Se connecter à Claude**, puis colle la clé.

La clé est vérifiée, reste dans ce navigateur et part directement chez Claude : elle ne passe jamais par Cloudflare. Le cerveau de l'équipe passe sur Claude Sonnet ; on peut revenir à l'IA gratuite à tout moment.

### L'IA gratuite

- **Workers AI** offre 10 000 « neurons » par jour, remis à zéro à minuit UTC. Ça représente quelques missions par jour avec Llama 3.3 70B, et davantage avec Llama 3.1 8B. Le modèle se choisit dans les réglages.
- **Quand le quota est épuisé**, Roré le dit, et l'équipe reprend le lendemain.

## Sur ton ordinateur, avec ton compte Claude

Il te faut :
- [Node.js](https://nodejs.org) 22.18 ou plus récent (version LTS) ;
- [Claude Code](https://claude.com/claude-code), connecté à ton compte : lance `claude` une fois et connecte-toi.

```bash
git clone https://github.com/RoreAndreas/Openspace.git
cd openspace
npm install
npm start
```

Sous Windows, tu peux aussi double-cliquer sur **`Lancer l'open space.bat`** : il vérifie Node et Claude Code, installe
ce qu'il faut et lance le bureau.

Le bureau s'ouvre sur http://localhost:4848. Il reconnaît Claude Code tout seul, et les réglages affichent « l'équipe travaille avec ton compte Claude ».

- **Où vont les fichiers** : dans `Documents/Open space/Missions`, un dossier par mission.
- **Roré** est une vraie séance Claude Code, et l'analyste un vrai sous-agent Claude Code, avec seulement ses outils.
- **Le règlement, le tiroir et les skills** partent avec chaque demande. Les skills sont copiés dans le dossier caché `.skills` de la mission.
- **Ce que l'analyste retient** : il l'écrit dans `a-retenir.md`, et ces lignes rejoignent son tiroir.

Tu peux aussi demander à Claude Code : « Installe et lance l'open space : https://github.com/RoreAndreas/Openspace ».

## Sur ton ordinateur, avec l'IA gratuite (Ollama)

Pour tester sans compte et sans payer. Ollama s'installe **sans droits d'administrateur**.

1. Installe Ollama depuis [ollama.com](https://ollama.com) et ouvre-le.
2. Dans un terminal, installe un modèle léger : `ollama pull qwen3:4b` (ou `llama3.2:3b`). Les gros modèles marchent aussi, mais sont lents sur un ordinateur portable.
3. Lance le bureau (`npm start` ou `Lancer l'open space.bat`), puis clique sur **le levier**, à côté du serveur : il passe au vert.

Le modèle se choisit dans les réglages (⚙️). La recherche web passe par le serveur local (DuckDuckGo, ou Tavily avec une
variable d'environnement `TAVILY_KEY`). Si Ollama tourne ailleurs, indique son adresse avec `OLLAMA_HOST`.

## Sous le capot

- **`server/`** : la version locale (Node). Le pont lance Claude Code (`claude -p`, en JSON ligne par ligne) dans le dossier de la mission et traduit ce qu'il fait en événements du bureau. Il marche aussi sous Windows.
- **`worker/index.ts`** : le Worker Cloudflare. Il sert le bureau et expose `/api/chat`, `/api/search`, `/api/fetch` et `/api/ping`. Tout est protégé par le code d'accès et rien n'est stocké. La recherche et la lecture des pages sont dans `shared/web.ts`, partagé avec le serveur local.
- **`src/local/`** : l'équipe, dans le navigateur.
  - `agent.ts` : la boucle de travail de Roré et de l'analyste. L'IA répond par `{ say, action, input }`, le bureau exécute l'action et la montre.
  - `bureau.ts` : les missions, les fichiers, l'enregistrement (IndexedDB).
  - `drawer.ts` : le tiroir.
  - `skills.ts` : les skills.
- **`src/engine/`** : le bureau en pixel art (Canvas 2D ; le décor et les robots sont dessinés en code). **`src/ui/`** : l'interface (React).
- **`src/characters/catalog.json`** : les personnages (voir plus bas).

### Les personnages

Chaque agent a un personnage : un robot du bureau, au même gabarit que les autres (20 × 24 pixels, tête-cube, visière), avec sa tenue et son caractère. Roré en commandant spatial (cape orange), Nyx la hacker (capuche, yeux cyan), Merlain le mage du code (chapeau pointu, barbe, bâton), Boulon le robot ingénieur, Margaux l'analyste (chignon, tablette), Zaza la styliste (banane violette, lunettes jaunes), Rook l'explorateur (sac à radar). La galerie (panneau de droite, « 🎭 La galerie ») les présente ; la fiche d'un agent permet de lui en choisir un autre. Il le garde d'une mission à l'autre.

Pour en ajouter un, une entrée dans `src/characters/catalog.json` suffit : son `id`, son nom, ses métiers (`roles`), sa personnalité (`idle` : `breathe`, `bounce`, `shimmer`, `blink`, `check`, `pose`, `scan` ou `supervise`) et sa tenue (`outfit`) : les couleurs de la tête, de la visière, des yeux, du corps, des bras et des jambes, et ses pièces, à choisir parmi celles que le moteur sait dessiner (`hood`, `wizardHat`, `beard`, `robe`, `staff`, `cape`, `bun`, `glasses`, `pompadour`, `sunglasses`, `backpack`… la liste est dans `src/engine/robots.ts`). Toutes les poses (marche dans les 4 directions, travail, lecture, fête, salut) viennent avec.

### Développer

```bash
npm install
npm start            # version locale, avec Claude Code (http://localhost:4848)
npm run dev          # le bureau seul sur http://localhost:5174 ; /api va vers « npx wrangler dev » (2e terminal)
npm run check        # les types (client, Worker, serveur local)
```

Pour `wrangler dev`, mets le code d'accès dans un fichier `.dev.vars` : `ACCESS_CODE=mon-code`. Ce fichier n'est jamais envoyé sur GitHub.

## Merci

- **Le Bureau des agents** de VibesMoney (MIT), d'où vient tout le bureau en pixel art.
- **Les bruitages** : [ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT).
- **La musique** : les vidéos YouTube que tu ajoutes au jukebox (lecteur youtube-nocookie.com).
- **Les polices** : Pixelify Sans et Plus Jakarta Sans (licence OFL).

Licence MIT (voir [LICENSE](LICENSE)).
