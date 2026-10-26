# Les versions

## Open space v0.4.0 (26 octobre 2026)

- **Roré, le chef de projet**, remplace Lilou : un commandant spatial en uniforme blanc, avec une cape orange.
- **Des personnages en pixel art** (générés avec PixelLab) remplacent les robots : Nyx la hacker, Merlain le mage du code, Boulon le robot ingénieur, Margaux l'analyste, Zaza la styliste, Rook l'explorateur. Chacun a sa silhouette, sa palette et sa façon d'attendre : Nyx trépigne, les runes de Merlain scintillent, l'écran de Boulon cligne, Rook regarde autour de lui, Roré surveille l'équipe.
- **La galerie des personnages** (panneau de droite) : leur caractère, leurs accessoires, leur palette, un aperçu animé.
- **Changer le personnage d'un agent**, depuis sa fiche ; il le garde d'une mission à l'autre. Roré aussi, depuis la galerie.
- Ajouter un personnage : une entrée dans `src/characters/catalog.json`, puis `python scripts/characters.py` (voir le README).
- Le robot de chaque métier reste là quand un personnage n'est pas encore chargé, ou si on le choisit.

## Open space v0.3.2 (26 octobre 2026)

- Claude Code : une version ancienne (sans l'option `--restricted` ni le mode « auto ») démarre quand même ; une erreur de version ou de connexion donne un message clair.
- Ollama répond plus vite : la conversation envoyée est plus courte, et les réponses sont limitées.
- Lilou ne part se promener qu'après 2 minutes sans rien à faire, puis revient à l'accueil (ou à son bureau).

## Open space v0.3.1 (26 octobre 2026)

- Un modèle Ollama trop gros pour la mémoire du PC donne un message clair, et les réglages s'ouvrent.
- Installer un modèle léger d'un clic, dans les réglages (Qwen 3 4B ou Llama 3.2 3B), avec la progression.
- La taille de chaque modèle est affichée ; Lilou prévient quand le modèle choisi est trop lourd.
- Au lancement, Claude Code est bien trouvé sous Windows (dans `.local\bin`), et l'avertissement de construction a disparu.

## Open space v0.3.0 (26 octobre 2026)

- **Le levier**, à côté du serveur : il change le cerveau de l'équipe. Orange : Claude. Vert : l'IA gratuite.
- **L'IA gratuite sur ton ordinateur** : Ollama (sans compte, sans droits d'administrateur). Le serveur local relaie aussi la recherche web et la lecture des pages.
- **La note « Comment ça marche »**, sur un pupitre à côté du bureau de Lilou.
- **Lilou se promène** quand elle n'a rien à faire : la machine à café, la fontaine, les fenêtres, le jukebox… Elle a aussi une nouvelle veste blanche.
- **Le jukebox joue tes liens YouTube** : lecture, pause, suivant, en boucle (la liste ou un morceau), aléatoire, volume. Un petit lecteur reste en bas à gauche.
- **Des idées de mission en bulles grises**, dans le chat en bas ; après une mission, des idées de retouche.
- **Le panneau de droite se replie** (la languette, le bouton ▥ ou la touche P), et un bouton plein écran.
- Le chat ne déborde plus sur un téléphone.

## Open space v0.2.0 (25 octobre 2026)

La version Cloudflare, pour une responsable marketing et communication.

- Lilou, la cheffe de projet, et un seul analyste (recherche, analyse, rédaction des rapports).
- Hébergé sur Cloudflare : un Worker (Workers AI gratuit, recherche web, lecture de pages) protégé par un code d'accès.
- Aucune donnée sur le serveur : missions, rapports, tiroir et skills restent dans le navigateur (sauvegarde et effacement dans les réglages).
- Le tiroir de l'analyste : couleurs, types de texte, informations à retenir (il peut y ranger lui-même une note).
- Les skills (format SKILL.md) : deux de départ, installation depuis un fichier, un lien ou un texte collé.
- Allégé : plus de musique, de voix ni de démo enregistrée ; le serveur local Claude Code est retiré (Claude pourra être rebranché dans le Worker).

D'après Le Bureau des agents (VibesMoney) :

## v0.1.0 (14 octobre 2026)

La première version publique.

- Max, le chef de projet, et son équipe de vrais sous-agents Claude Code : recherche, code, design, rédaction, analyse.
- Le bureau en pixel art, dessiné en code : les robots vont à leur poste, et chaque bulle montre ce qu'ils font vraiment.
- Les rapports, les fichiers rendus, les sites créés affichés dans un écran (ordinateur ou téléphone), le code et ses versions.
- Le plan au tableau et son historique, toute l'équipe et ses outils, l'historique des agents passés au bureau.
- Rejouer une mission sans relancer l'équipe, une démo hors ligne.
- Le mode tournage (caméra automatique, cadre vertical), la visite guidée avec la voix de Max, le jukebox, et quelques surprises.
