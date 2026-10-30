# Les versions

## À venir

- **La pêche au large** (le coin de pêche, au bord de la falaise : clic ou « E · Partir pêcher en barque »), à la manière de *Scale the Depths* : Roré part en barque, on voit la falaise de loin, le pavillon et le phare. L'hameçon descend tout seul ; ← → (ou la souris) pour percuter les poissons et les accrocher (les gros demandent plusieurs coups, le homard a une carapace). Plus on descend, plus les prises sont belles : sardines, maquereaux, rougets, dorades, bars, congres, homards, lottes, poisson-lune. On remonte, on écaille sur l'établi, on vend aux clients du large (une mouette, un phoque, une loutre, un crabe… parfois Nessie, qui paie double), et les pièces paient le matériel : ligne plus longue, hameçon plus lourd, plus de crochets, couteau aiguisé. Tout est gardé dans le navigateur.
- La mer de Dehors bouge davantage : une houle qui avance vers la côte, des moutons d'écume qui naissent et s'effacent. Le vent et les vagues sont plus discrets.

## Open space v0.8.0 (30 octobre 2026)

- **Les habitués** : tous les personnages ont désormais leur bureau dans l'open space, dans le coin de leur métier, et vivent leur journée à l'heure de ton ordinateur. Arrivée le matin, déjeuner dans la Pause, cafés, visites aux collègues, départ le soir (Nyx reste tard ; Boulon ne part jamais, il se met en veille). Un personnage n'est que dans une pièce à la fois : à midi, le bureau se vide et la Pause se remplit.
- **Le bureau suit tes missions** : l'agent appelé passe chez Roré prendre son dossier (ou le rapport du collègue d'avant), puis s'installe ; s'il était en pause ou rentré chez lui, il revient. Après la mission, il retourne à sa place. Une mission réussie : tout le monde applaudit, et une coupe rejoint l'étagère des archives.
- **Hares est toujours là**, à son bureau du coin Analyse, même sans mission.
- **Des petits événements** : l'imprimante se bloque (un collègue vient la réparer), Pixel fait tomber une tasse, un anniversaire avec un gâteau. Le vendredi midi, pizza dans la Pause.
- Clique sur un habitué (ou approche Roré et appuie sur E) : il te répond.
- **Rook part en mission, avec Tavily** : Roré lui confie la recherche et la veille (actualités de la semaine ou du mois, sites précis, revue de presse). Il reçoit une réponse résumée et des résultats datés, lit jusqu'à cinq pages d'un coup, et rend un fichier avec un tableau des sources (lien, date, fiabilité). Le Worker lit la clé `CLE_TAVILY` (ou `TAVILY_KEY`) ; sans clé, Rook cherche avec DuckDuckGo. Avec Claude Code, il utilise la recherche de Claude.
- L'agent appelé en mission porte le prénom de l'habitué qui fait le travail : l'analyste s'appelle Margaux (avant : Marie, Blaise…).
- **Dehors** (🌿, touche O) : derrière la porte d'entrée, un petit pavillon 43 à droite (toit plat, bardage bois, baie vitrée, petit logo 43 au-dessus de la porte), une prairie que le vent parcourt en vagues, des pins parasols couchés par le vent, un chemin de gravier, une manche à air, et le bord de la falaise face au large. Au-delà, un panorama en perspective : la mer jusqu'à l'horizon, le soleil (ou la lune) et son reflet, des voiliers, et au loin à gauche un cap avec son phare qui clignote. Le banc, au bout d'un petit promontoire, regarde la mer. Le vent, la mer et une petite musique lofi sont fabriqués en direct (aucun fichier audio).
- **Les heures de travail se règlent** (⚙️ Réglages : début, fin, jours). Pendant, seul Roré sort, quand tu le diriges. En dehors, les amateurs de grand air (Rook, Merlain, Hares) passent la porte d'entrée et prennent l'air au lieu de rester : ils se promènent, regardent la mer, s'assoient sur le banc ou sur le tronc, puis rentrent chez eux (ou au bureau, quand le travail reprend). Les jours non travaillés, personne ne vient au bureau (Boulon reste en veille) ; eux passent l'après-midi Dehors.
- **S'asseoir avec E** : sur les poufs, les tabourets et le canapé de la Pause, sur le canapé et à son bureau dans le bureau, sur le **banc du cap** et sur le vieux tronc. Une flèche, ou E (« Se lever »), et il se relève.

## Open space v0.7.0 (29 octobre 2026)

- **Deux mini-jeux dans la Pause.** La table de ping-pong : tu joues Roré contre le collègue de ton choix (Boulon calcule les trajectoires, Zaza joue à l'instinct…), premier à 5 points, aux flèches ou à la souris. La borne d'arcade : **Spartan Run**, Hares saute par-dessus les bugs, les cafés renversés et les dossiers urgents, de plus en plus vite.
- **« E » pour interagir** quand tu diriges Roré : une étiquette « E · … » montre ce qui est à portée de main (un collègue, le chat, un meuble, une porte, un jeu), et la touche E fait comme un clic.
- Tes victoires par adversaire et ton record sont gardés dans le navigateur ; à la fin, ton adversaire (ou Hares, sur un record) réagit dans la Pause.

## Open space v0.6.1 (26 octobre 2026)

- **La Break room redevient la Pause**, et revient à droite du bureau (la porte « PAUSE »).

## Open space v0.6.0 (26 octobre 2026)

- **Hares rejoint l'équipe** : un spartiate de la finance (casque à aigrette, bouclier au lambda, lance), assis au coin Analyse. Roré lui confie les échantillons de comparables, les CMPC et les valorisations par les multiples.
- **Hares interroge ta base 43 WACC**, en ligne comme en local : 8 000 sociétés cotées, primes de risque pays, bêtas sectoriels, taux US. Filtres, seuils, valeurs aberrantes (Tukey), médianes et quartiles, CMPC calculé comme dans WACC43.
- **Trois skills tirés de HARES** : `hares-echantillon`, `hares-cmpc`, `hares-multiples`.
- **La salle de pause devient la Break room**, et passe à gauche du bureau.
- **Le jukebox s'anime aussi dans la Break room** quand la musique joue : ses néons, ses notes, et on y danse plus volontiers.

## Open space v0.5.0 (26 octobre 2026)

- **La salle de pause**, à côté du bureau : une cuisine (frigo, machine à café, plaques, grande table) et une salle de loisirs (canapé et console, bornes d'arcade, ping-pong, baby-foot, poufs, jukebox, bibliothèque). On y entre par la porte « PAUSE » du bureau, le bouton ☕ ou la touche `D`.
- **Tous les personnages s'y retrouvent** et y vivent leur vie : chacun fait ce qu'il aime (Nyx à l'arcade, Merlain à la bibliothèque, Zaza qui danse…), ils discutent entre eux (parfois un « tope là »), jouent à deux au ping-pong ou au baby-foot. Clique sur l'un d'eux : il s'arrête et te dit une réplique à son image.
- **Roré passe les portes** quand tu le diriges : du bureau à la salle de pause et retour. Dans la salle de pause, `Espace` le fait parler au collègue le plus proche.

## Open space v0.4.1 (26 octobre 2026)

- **Les personnages reprennent le format des robots du bureau** (le même que la copie AK : 20 × 24 pixels, tête-cube, visière) : chacun garde sa tenue et son caractère, dessinés en code. Nyx a sa capuche et ses yeux cyan, Merlain son chapeau, sa barbe et son bâton, Roré sa cape orange, Margaux son chignon et sa tablette, Zaza sa banane et ses lunettes jaunes, Rook son sac à radar.
- Toutes les poses sont là pour tous : la marche dans les quatre directions, le travail, la lecture, la fête, le salut.
- Les images PixelLab et leur script d'import sont retirés : ajouter un personnage, c'est une entrée (avec sa tenue) dans `src/characters/catalog.json`.
- **Prends les commandes de Roré** : double-clic sur lui, puis les flèches. Il s'arrête devant les meubles, glisse le long des murs, la caméra le suit. `Échap` (ou un nouveau double-clic) lui rend la main ; en pleine mission, il retourne à son bureau.
- **Chaque coin a son style** : bureaux, chaises et tapis changent selon le métier. Code futuriste (métal sombre, liseré néon qui éclaire le soir, fauteuils de gamer, tapis en circuit imprimé), design flashy (laqué blanc et rose, chaises jaunes, confettis), recherche en bibliothèque d'explorateur (noyer, cuir clouté, rose des vents), rédaction en bureau d'écrivain (merisier, velours violet, encrier), analyse corporate (bleu nuit, filet doré, papier millimétré).

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
