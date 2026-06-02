export const fr = {
  nav_arch: "Pourquoi",
  nav_intent: "Intention",
  nav_output: "Logs",
  nav_handoff: "Transfert",
  nav_modes: "Exécution",
  nav_install: "Installer",
  nav_github: "GitHub",
  nav_docs: "Docs",
  nav_home: "Accueil",
  slogan: "Le courage est l'hymne de l'humanité. Oser affronter la difficulté, c'est là que commence le plaisir.",
  release_label: "VERSION",
  hero_title_1: "Braincode",
  hero_title_2: "Un orchestrateur d'agents de codage multi-modèles.",
  hero_lead:
    "Braincode transforme une requête de codage en planificateur, agents spécialisés, exécuteur principal, réviseur et rapport final.",
  workflow_label: "Flux de travail Braincode",
  workflow_step_1: "Planificateur",
  workflow_step_2: "Agents",
  workflow_step_3: "Exécuteur",
  workflow_step_4: "Réviseur",
  workflow_step_5: "Rapport final",
  btn_npm_install: "INSTALLER NPM",
  btn_copied: "COPIÉ !",
  btn_copy_failed: "ÉCHEC",
  btn_docs: "Lire la Documentation",
  section_arch_eyebrow: "POURQUOI BRAINCODE",
  section_arch_title:
    "Pas juste une autre CLI d'IA. Un moteur de flux de codage.",
  feature_1_title: "Rôles séparés",
  feature_1_body:
    "La plupart des agents demandent à un seul modèle de planifier, coder et s'auto-réviser. Braincode sépare explicitement la planification, l'exécution, la révision et le rapport en tâches distinctes.",
  feature_2_title: "Routage selon le coût et le risque",
  feature_2_body:
    "Le travail simple peut s'exécuter sur des modèles moins chers. Les modifications risquées peuvent être escaladées vers des modèles plus puissants et une révision indépendante.",
  feature_3_title: "Contexte d'agent isolé",
  feature_3_body:
    "Les agents n'héritent pas de la conversation complète ni de l'état des autres. Ils renvoient des résultats structurés que l'exécuteur principal peut utiliser.",
  section_intent_eyebrow: "GRAPHE D'INTENTION · CTRL+O",
  section_intent_title: "Voyez le cerveau réfléchir.",
  section_intent_lead:
    "Chaque exécution produit un DAG en direct. Le cerveau décompose votre tâche en sous-agents spécialisés, les ordonne par dépendance et achemine chacun vers le bon modèle. Appuyez sur Ctrl+O dans le TUI pour l'afficher.",
  intent_refresh_hint: "/PLAN ACTUALISE · ESC FERME",
  intent_pillar_1_title: "Décomposition",
  intent_pillar_1_body:
    "Le cerveau lit la requête et propose des sous-tâches avec des dépendances explicites — pas une simple liste plate.",
  intent_pillar_2_title: "Statut en direct",
  intent_pillar_2_body:
    "Chaque nœud porte un glyphe — ● cerveau, ☑ terminé, ◐ en cours, ☐ en attente — rafraîchi à chaque tick.",
  intent_pillar_3_title: "Auditable",
  intent_pillar_3_body:
    "Chaque lien stocke une raison. Vous pouvez répondre à « pourquoi cet agent a-t-il été exécuté ? » sans lire un long journal.",
  section_output_eyebrow: "SORTIE D'EXÉCUTION",
  section_output_title: "Chaque action a une étiquette visible.",
  section_output_lead:
    "Les appels d'outils, recherches web, exécutions shell et décisions utilisateur ne se fondent pas dans le même journal. Braincode marque d'abord le type d'action, puis affiche les arguments, le statut et les résultats.",
  output_frame_title: "JOURNAL D'EXÉCUTION",
  output_frame_hint: "BALISES D'OUTILS · DÉCISIONS",
  output_decision_copy: "Commande dangereuse nécessitant une décision explicite.",
  output_decision_approve: "Approuver une fois : exécuter la commande de build",
  output_decision_block: "Bloquer et renvoyer la raison au modèle",
  output_pillar_1_title: "Balises explicites",
  output_pillar_1_body:
    "La recherche web, l'exécution, la lecture, l'écriture et les appels MCP portent des étiquettes distinctes avant la charge utile.",
  output_pillar_2_title: "Statut séparé",
  output_pillar_2_body:
    "Le démarrage, la mise à jour en continu, l'achèvement, l'échec, la durée et le résumé des résultats restent faciles à lire.",
  output_pillar_3_title: "Choix vérifiables",
  output_pillar_3_body:
    "Lorsque l'agent a besoin d'une décision, le TUI présente des options cochables au lieu de devinettes en format libre.",
  section_handoff_eyebrow: "PAQUETS DE TRANSFERT",
  section_handoff_title: "Transfert de contexte cerveau-agent.",
  section_handoff_lead:
    "Les agents n'héritent jamais du journal principal. Chacun se réveille avec un paquet structuré — identifiant de tâche, ID parent, rôle, objectif, contraintes, sortie attendue. Leurs chaînes de pensée privées restent isolées. Ils renvoient du JSON. Le cerveau lit du JSON. Le contexte principal reste propre.",
  handoff_pkt_title: "▮ TRANSFERT · AGENT BIBLIOTHÉCAIRE",
  handoff_pkt_phase: "PHASE = SUPPORT",
  handoff_card_1_title: "Contexte isolé",
  handoff_card_1_body:
    "Les agents ne peuvent pas lire le prompt d'un autre agent ni le journal racine. Un agent qui hallucine ne peut pas empoisonner ses pairs.",
  handoff_card_2_title: "Retour structuré",
  handoff_card_2_body:
    "Chaque agent renvoie du JSON — résumé, artefacts, risques, prochaines questions. Le cerveau les fusionne sans relire de longues discussions.",
  handoff_card_3_title: "Reprenable",
  handoff_card_3_body:
    "Les transferts persistent sur le disque. En cas de plantage au milieu de l'exécution, reprenez la session et le cerveau rejoue le DAG à partir des paquets sauvegardés.",
  section_modes_eyebrow: "DEUX MODES D'EXÉCUTION",
  section_modes_title: "Décidez de l'agressivité du système.",
  auto_title: "Mode Auto",
  auto_tagline: "Conservateur et séquentiel. La stabilité gagne.",
  auto_body:
    "Les outils s'exécutent en série. Chaque action risquée (comme une modification de fichier) déclenche un Agent Réviseur pour vérification. Idéal pour la stabilité au quotidien.",
  auto_meta: "-> actif par défaut",
  radical_title: "Mode Radical",
  radical_tagline: "Agressif et parallèle. Plein gaz.",
  radical_body:
    "Appels d'outils parallèles, décomposition de rôles plus large, jusqu'à 8 tâches planifiées et au moins 4 agents de support simultanés lorsque les dépendances le permettent.",
  radical_meta: "-> à utiliser avec prudence",
  section_roles_eyebrow: "15 RÔLES · ORIENTÉ RÔLE",
  section_roles_title: "Un moteur de workflow, pas un CLI à modèle unique.",
  section_roles_lead:
    "Il n'y a pas de rôle générique de codage. Le travail de code est divisé par domaine afin que chaque rôle puisse être acheminé vers un modèle réellement performant dans ce domaine. Le routeBrain piloté par LLM choisit quel spécialiste s'exécute.",
  section_roles_removed:
    "v0.2.0 retiré : coding, fastReply et research — fusionnés dans les spécialistes de domaine, rush et librarian respectivement.",
  roles_carousel_label: "Carrousel du guide des appels de rôles Braincode",
  role_prev: "Rôle précédent",
  role_next: "Rôle suivant",
  role_call_label: "Appeler pour",
  role_call_routeBrain:
    "Utilisez pour la classification des intentions, la sélection des rôles, la planification du graphe des agents, l'attribution des tâches et les dépendances. Il route le travail ; il ne résout pas la tâche.",
  role_call_frontend:
    "Utilisez pour les comportements liés au navigateur : composants, états, accessibilité, mise en page responsive, ajustement des textes et vérification visuelle.",
  role_call_backend:
    "Utilisez pour les API, services, validation, points de contrôle d'autorisation, frontières de persistance, gestion des erreurs et comportements serveur durables.",
  role_call_designer:
    "Utilisez pour les parcours UX, l'architecture de l'information, les modèles d'interaction, le design des états, la hiérarchie visuelle et la priorité des textes.",
  role_call_imageMaker:
    "Utilisez lorsque l'utilisateur a besoin d'une nouvelle ressource raster, d'un portrait de rôle, d'un prompt d'image, d'un visuel généré ou d'une modification d'image via l'API Images configurée.",
  role_call_dba:
    "Utilisez pour le schéma, les migrations, les index, les plans de requêtes, les contraintes, l'intégrité des données, la rétention, les remplissages et les risques d'annulation.",
  role_call_devops:
    "Utilisez pour le build, la CI, le packaging, le déploiement, l'environnement local, la gestion des secrets, l'observabilité et les manuels opérationnels.",
  role_call_security:
    "Utilisez pour l'authentification, les permissions, les secrets, l'injection, l'exposition des dépendances, les frontières de confiance, les cas d'abus et les valeurs par défaut sécurisées.",
  role_call_qa:
    "Utilisez pour les critères d'acceptation, les bugs reproductibles, les cas limites, les tests de non-régression, la stratégie de test, les fixtures et les lacunes de couverture.",
  role_call_review:
    "Utilisez après qu'un plan, un diff ou un résultat existe et nécessite une détection indépendante des défauts, une revue des risques de régression ou une analyse des tests manquants.",
  role_call_summarize:
    "Utilisez pour compresser un long contexte en un état prêt pour le transfert avec des objectifs, des décisions, des artefacts, une validation, des mises en garde et des bloqueurs.",
  role_call_oracle:
    "Utilisez pour les choix d'architecture difficiles, le débogage ambigu, les compromis complexes, le raisonnement profond et les décisions en cas d'incertitude.",
  role_call_librarian:
    "Utilisez pour l'orientation dans le dépôt, la recherche de symboles, le traçage d'architecture, les cartes de dépendances, les faits vérifiés et les références précises.",
  role_call_rush:
    "Utilisez pour les petites tâches à faible risque et les réponses directes et courtes lorsqu'aucun rôle de spécialiste n'est plus adapté.",
  role_call_pet:
    "Utilisez uniquement comme rapporteur de statut TUI en lecture seule. Il observe les instantanés d'exécution en direct et émet de courtes lignes de progression ; il ne route jamais le travail.",
  section_trust_eyebrow: "CONÇU POUR ÊTRE VÉRIFIÉ",
  section_trust_title: "Des affirmations que vous pouvez vérifier vous-même.",
  section_trust_lead:
    "Braincode ne vous demande pas de croire une capture d'écran. Chaque version exécute les mêmes contrôles en CI, et le comportement de routage et de revue est éprouvé par des benchmarks reproductibles que vous pouvez lancer en local.",
  trust_1_title: "Vérifié par la CI",
  trust_1_body:
    "Chaque push et pull request exécute le typage strict, la suite de tests complète, la couverture et les benchmarks. Le badge du README renvoie directement à l'historique des exécutions.",
  trust_2_title: "Benchmarks reproductibles",
  trust_2_body:
    "Des fixtures déterministes rejouent les décisions de routage et une boucle d'exécution simulée hors ligne — sans clé de fournisseur. La CI archive le rapport JSON de chaque exécution comme artefact.",
  trust_3_title: "Strict et ouvert",
  trust_3_body:
    "Tout l'espace de travail compile en TypeScript strict, et le code source est sous licence MIT. Lisez vous-même le routage, la barrière de revue et le code de reporting.",
  section_cta_title: "Prêt à tester votre cerveau ?",
  section_cta_lead: "Disponible pour macOS, Linux et npm.",
  cta_docs: "Lire la Documentation",
  footer_docs: "Docs",
  footer_github: "GitHub",
  footer_license: "Licence",

  /* Docs page */
  docs_page_title: "Documentation",
  docs_page_lead:
    "Tout ce dont vous avez besoin pour installer, configurer et exécuter Braincode sur votre propre machine. Cette page est intégrée dans le même fichier HTML que le site principal — entièrement lisible hors ligne.",
  docs_toc_title: "Sur cette page",
  docs_back_home: "← Retour à l'accueil",

  docs_setup_title: "1. Installation",
  docs_setup_intro:
    "Braincode est distribué sous forme de CLI basée sur Bun. Choisissez l'une des trois méthodes d'installation ci-dessous. Le CLI lance par défaut une interface terminale (TUI) basée sur Ink et expose un serveur de configuration local accessible via navigateur.",
  docs_setup_npm_title: "Installation via npm",
  docs_setup_npm_body:
    "Le paquet npm est la méthode recommandée. Il installe l'exécutable braincode dans votre répertoire bin global et fonctionne sur macOS, Linux et Windows (WSL).",
  docs_setup_brew_title: "Installation via Homebrew",
  docs_setup_brew_body:
    "Homebrew installe un binaire Bun précompilé ainsi que le point d'entrée braincode, vous n'avez donc pas besoin d'installer Bun vous-même.",
  docs_setup_source_title: "Compilation depuis les sources",
  docs_setup_source_body:
    "Clonez le dépôt, exécutez bun install et lancez braincode directement depuis l'espace de travail. C'est la méthode utilisée par les contributeurs.",
  docs_setup_first_run_title: "Première exécution",
  docs_setup_first_run_body:
    "Exécutez braincode dans un répertoire vide pour lancer le TUI, ou exécutez braincode config pour démarrer le serveur de configuration local (http://127.0.0.1:5181 par défaut).",

  docs_home_title: "2. Le répertoire ~/.braincode/",
  docs_home_intro:
    "Toute la configuration utilisateur lors de l'exécution est stockée dans ~/.braincode/. Le dépôt ne contient jamais vos secrets ; vous pouvez supprimer ~/.braincode/ à tout moment et relancer braincode config pour recréer les valeurs par défaut.",
  docs_home_files_title: "Fichiers et dossiers",
  docs_home_settings_title: "settings.json",
  docs_home_settings_body:
    "Préférences utilisateur globales : ID du Modèle Cerveau sélectionné, mode d'exécution par défaut (auto ou radical), apparence de l'UI résolue par le système, drapeau de télémétrie.",
  docs_home_auth_title: "auth.json",
  docs_home_auth_body:
    "Clés API des fournisseurs et jetons OAuth. Écrit avec des permissions restrictives (0600). Ne jamais commiter, ne jamais logger, ne jamais coller dans un prompt. Braincode les masque dans le TUI.",
  docs_home_brains_title: "brains.json",
  docs_home_brains_body:
    "Vos Modèles Cerveaux (Brain Models). Chaque entrée est une politique de routage : quel modèle prend le rôle de planificateur, quel modèle prend chaque rôle de spécialiste, la chaîne de secours, les règles d'escalade.",
  docs_home_models_title: "models.json",
  docs_home_models_body:
    "Registre des fournisseurs/modèles : ID du fournisseur, ID du modèle, fenêtre de contexte, indications de coût, drapeaux de capacité. brains.json y fait référence par ID.",
  docs_home_tools_title: "tools.json",
  docs_home_tools_body:
    "Carte des permissions pour les outils intégrés (lecture, écriture, édition, shell, recherche) et tout outil MCP découvert via .mcp.json. Décide quels outils nécessitent une approbation.",
  docs_home_hooks_title: "hooks.json",
  docs_home_hooks_body:
    "Hooks de cycle de vie au niveau utilisateur. Les hooks de commande doivent comporter trusted: true avant que Braincode ne les exécute.",
  docs_home_sessions_title: "sessions/",
  docs_home_sessions_body:
    "Journaux de session JSONL pour la reprise et l'audit. Chaque session contient également les paquets de transfert de chaque exécution d'agent.",
  docs_home_logs_title: "logs/ et cache/",
  docs_home_logs_body:
    "Journaux d'exécution avec rotation et cache éphémère (résumés de compactage, résultats de sondage de modèle). Suppression sans risque pour libérer de l'espace disque.",

  docs_brain_title: "3. Modèles Cerveaux (Brain Models)",
  docs_brain_intro:
    "Un Modèle Cerveau est une politique de routage, pas un LLM unique. Il associe chaque rôle d'agent à une politique de modèle incluant le niveau de réflexion, la chaîne de secours et les seuils d'escalade. routeBrain choisit les rôles et les agents ; chaque rôle sélectionné s'exécute via sa propre chaîne de modèles configurée.",
  docs_brain_example_title: "Exemple de brains.json",
  docs_brain_roles_title: "Rôles intégrés",
  docs_brain_roles_body:
    "Braincode v0.2.0 est livré avec 15 emplacements de rôles. coding, fastReply et research ont été supprimés et absorbés par les spécialistes de domaine, rush et librarian.",

  docs_modes_title: "4. Modes d'exécution",
  docs_modes_intro:
    "Braincode dispose de deux modes d'exécution principaux. Le mode contrôle le niveau d'agressivité autorisé au cerveau lors de la planification, de la parallélisation et de l'escalade vers les rôles spécialisés.",
  docs_modes_auto_body:
    "Mode par défaut. Les outils s'exécutent en série. Les actions risquées (éditions de fichiers, commandes shell) déclenchent un Agent Réviseur. Idéal pour la stabilité au quotidien.",
  docs_modes_radical_body:
    "Appels d'outils parallèles, planification plus large, support de spécialistes plus précoce, jusqu'à 8 tâches prévues et au moins 4 agents de support en vol lorsque les dépendances le permettent. La sécurité passe toujours par le système de permissions des outils.",
  docs_modes_switch_hint:
    "Changez de mode depuis le TUI avec /auto ou /radical, ou configurez defaultMode dans settings.json.",

  docs_mcp_title: "5. MCP — Model Context Protocol",
  docs_mcp_intro:
    "Braincode charge les déclarations de serveur MCP du projet depuis .mcp.json à la racine du dépôt. Le MCP vous permet d'exposer des outils externes (bases de données, navigateurs, API internes) en tant qu'outils Braincode sans modifier le moteur d'exécution principal.",
  docs_mcp_file_title: ".mcp.json",
  docs_mcp_file_body:
    "Déclarez chaque serveur MCP avec un nom, un transport (stdio ou http), une commande/arguments ou une url, et des variables d'environnement optionnelles. Ne placez pas de secrets en clair ici — référencez-les par leur nom d'environnement. Braincode résout les valeurs d'environnement depuis votre shell ou ~/.braincode/auth.json.",
  docs_mcp_security_title: "Modèle de sécurité",
  docs_mcp_security_body:
    "Les outils MCP héritent du système de permissions de Braincode. Chaque appel MCP porte une étiquette dans le TUI ([MCP] nomOutil) et les outils risqués (écritures, appels de type shell) demandent une approbation à moins d'être explicitement autorisés dans tools.json.",

  docs_skills_title: "6. Compétences (Skills)",
  docs_skills_intro:
    "Les compétences sont des documents Markdown locaux au projet qui enseignent à Braincode un workflow spécialisé. Elles se trouvent sous .agents/skills/<skill-id>/SKILL.md (ou .agents/skills/*.md à la racine) et sont chargées comme contexte de prompt lorsque le cerveau décide qu'elles sont pertinentes.",
  docs_skills_file_title: "Structure d'une compétence",
  docs_skills_file_body:
    "Un dossier de compétence contient SKILL.md (le prompt) ainsi que toute documentation de référence. Le premier titre correspond au nom de la compétence. Le cerveau peut sélectionner une compétence en fonction de l'intention de l'utilisateur — vous n'avez pas à l'invoquer manuellement.",
  docs_skills_use_title: "Quand écrire une compétence",
  docs_skills_use_body:
    "Rédigez une compétence lorsqu'un workflow est répété, opinioné et non évident depuis le code source seul — par exemple : 'Lancer la suite QA', 'Déployer en pré-production', 'Rédiger une ADR'. Gardez une compétence par intention.",

  docs_agents_title: "7. AGENTS.md",
  docs_agents_intro:
    "AGENTS.md peut vivre dans ~/.braincode/AGENTS.md pour les instructions utilisateur globales et à la racine du dépôt pour le contexte projet. Braincode lit les deux dans l'agent principal et chaque worker ; les instructions projet priment pour le travail dans ce dépôt.",

  docs_hooks_title: "8. Hooks",
  docs_hooks_intro:
    "Les hooks sont des commandes ou scripts déclenchés lors de points de cycle de vie (pré-outil, post-outil, fin de session). Les hooks de projet résident dans .agents/hooks.json ; les hooks utilisateur résident dans ~/.braincode/hooks.json. Les hooks de commande nécessitent trusted: true ; Braincode refusera d'exécuter un hook non fiable même s'il est déclaré.",

  docs_config_ui_title: "9. Interface de configuration web",
  docs_config_ui_intro:
    "Exécutez braincode config pour lancer le serveur de configuration local. Il est lié à 127.0.0.1 par défaut et sert l'application web de configuration. Les modifications transitent par l'API typée et sont sauvegardées dans ~/.braincode/ — l'application web n'écrit jamais directement dans le répertoire utilisateur.",

  docs_cli_title: "10. Référence CLI",
  docs_cli_intro:
    "L'interface en ligne de commande (CLI) de braincode est intentionnellement minimaliste. La plupart des comportements du produit résident dans les paquets ; le CLI sert à les relier et à héberger le TUI Ink.",
  docs_cli_cmd_default: "Lance le TUI interactif dans le répertoire courant.",
  docs_cli_cmd_config: "Démarre le serveur web de configuration local et affiche l'URL.",
  docs_cli_cmd_run: "Exécute un prompt unique non interactif et affiche le résultat.",
  docs_cli_cmd_dry:
    "Prévisualise le plan routeBrain réel pour une tâche. Ceci utilise le Modèle Cerveau configuré et peut appeler le fournisseur de routeBrain ; si routeBrain est indisponible pour une entrée texte seul, la sortie est marquée comme un fallback heuristique. L'entrée d'image nécessite routeBrain et signale directement les échecs du routeur/modèle.",
  docs_cli_cmd_dry_heuristic:
    "Prévisualise uniquement le fallback heuristique déterministe. Utilisez ceci pour les diagnostics sans fournisseur ou pour vérifier le comportement de secours.",
  docs_cli_cmd_plan:
    "Dans le TUI, prévisualise la décision configurée de routeBrain pour une tâche. Le plan affiche la source de routage, la confiance, la raison, le rôle principal, les agents, le modèle, le mode et les budgets.",
  docs_cli_cmd_plan_heuristic:
    "Dans le TUI, force le fallback heuristique déterministe. Il s'agit d'un chemin de diagnostic, pas du flux de planification normal.",
  docs_cli_cmd_intent:
    "Ouvre le dernier graphe d'intention. Il montre la décomposition de la tâche en cours, les liens de dépendance, le statut des tâches, la source de routage, la confiance et la raison du routage.",
  docs_cli_cmd_daemon: "(Prévu) exécuter Braincode comme service local en arrière-plan.",

  docs_cli_core_title: "Commandes principales",
  docs_cli_run_flags_title: "Options de permission d'exécution",
  docs_cli_run_flags_intro:
    "Lors de l'utilisation de braincode run de manière non interactive, vous devez choisir un mode de permission. Une seule option peut être utilisée à la fois.",
  docs_cli_flag_readonly:
    "Expose uniquement les outils locaux en lecture seule (list_files, read_file, search_files, git_diff, get_changed_files). Aucune édition ou commande n'est autorisée.",
  docs_cli_flag_allow_edits:
    "Expose les outils locaux en lecture/écriture et approuve automatiquement les modifications de fichiers (edit_file, apply_patch), mais bloque l'exécution de commandes, les outils MCP et les outils inconnus.",
  docs_cli_flag_yes:
    "Expose tous les outils locaux et approuve automatiquement chaque appel d'outil pour une exécution totalement non interactive. À utiliser avec prudence.",
  docs_cli_benchmark_title: "Évaluation des performances (Benchmark)",
  docs_cli_benchmark_intro:
    "Exécute des tests de plan pour des tâches de codage représentatives afin de valider le comportement du routage et de mesurer la qualité de la planification.",
  docs_cli_cmd_benchmark:
    "Lance l'ensemble des tests avec le modèle de cerveau configuré. Affiche réussite/échec par tâche avec la source de routage, le rôle, le flag de révision et la liste des workers.",
  docs_cli_cmd_benchmark_list:
    "Affiche les ID et les titres des tâches d'évaluation disponibles. Utilisez --json pour une sortie lisible par machine.",
  docs_cli_cmd_benchmark_flags:
    "--heuristic ignore routeBrain et évalue le fallback déterministe. --task filtre sur des ID de tâches spécifiques (répétable ou séparés par des virgules). --json affiche en JSON.",

  docs_tui_title: "11. Référence du TUI",
  docs_tui_intro:
    "L'interface terminale (TUI) basée sur Ink est l'interface principale de Braincode. Cette section couvre les commandes slash, les raccourcis clavier et les panneaux interactifs.",
  docs_tui_commands_title: "Commandes Slash",
  docs_tui_commands_intro:
    "Tapez / dans la zone de saisie pour ouvrir le panneau de commandes. Tab ou Entrée accepte une suggestion. Les commandes peuvent également être tapées directement.",
  docs_tui_cmd_help: "Liste toutes les commandes slash y compris les compétences chargées dynamiquement.",
  docs_tui_cmd_plan:
    "Prévisualise la décision routeBrain configurée pour une tâche. Affiche la source de routage, la confiance, la raison, le rôle principal, les agents, le modèle, le mode et les budgets. Ajoutez --heuristic pour le fallback déterministe.",
  docs_tui_cmd_plan_heuristic:
    "Force la route heuristique déterministe dans le TUI. Chemin de diagnostic, pas le flux de planification normal.",
  docs_tui_cmd_intent:
    "Ouvre le dernier graphe d'intention (également Ctrl+O). Affiche la décomposition des tâches, les bords de dépendance, le statut des tâches, la source de routage, la confiance et la raison.",
  docs_tui_cmd_mcp: "Ouvre le panneau de configuration interactif MCP. Parcourez les serveurs, vérifiez la santé, activez/désactivez et visualisez les configurations.",
  docs_tui_cmd_hooks: "Ouvre le panneau de configuration interactif des hooks. Parcourez les gestionnaires, activez/désactivez et visualisez les détails des commandes.",
  docs_tui_cmd_sessions: "Parcourez les sessions récentes. Affiche le statut, le résumé du prompt et la date de dernière mise à jour.",
  docs_tui_cmd_resume: "Reprendre une session par ID. La transcription et le contexte sont restaurés à partir du disque.",
  docs_tui_cmd_new: "Démarrer une nouvelle session. Efface la transcription et génère un nouvel identifiant de session.",
  docs_tui_cmd_handoff:
    "Bifurque une nouvelle session à partir de l'actuelle. Passez un ID de session pour résumer et transférer vers une autre session.",
  docs_tui_cmd_brain: "Consultez le catalogue Brain et modifiez le modèle de cerveau par défaut.",
  docs_tui_cmd_mode: "Visualisez ou modifiez le mode d'exécution. Passez auto ou radical, ou omettez l'argument pour voir le mode actuel.",
  docs_tui_cmd_auto_radical: "Basculez rapidement le mode d'exécution sur auto ou radical sans ouvrir le panneau de modes.",
  docs_tui_cmd_theme: "Affiche le thème TUI résolu par le système (dark ou light). Le thème est détecté automatiquement selon l'apparence du terminal.",
  docs_tui_cmd_team_test:
    "Diagnostic : force chaque rôle à exécuter le prompt en parallèle. Utile pour vérifier le comportement des rôles et la disponibilité des modèles.",
  docs_tui_cmd_skill: "Liste les compétences (skills) du projet et utilisateur chargées depuis .agents/skills et ~/.braincode/skills.",
  docs_tui_cmd_agents: "Affiche les chemins, tailles et états de chargement des AGENTS.md utilisateur global et projet local.",
  docs_tui_cmd_files: "Rafraîchit l'index @file utilisé pour l'autocomplétion des noms de fichiers.",
  docs_tui_cmd_clear: "Efface la transcription affichée. Ceci ne démarre pas une nouvelle session.",
  docs_tui_cmd_exit: "Quitter le TUI.",
  docs_tui_shortcuts_title: "Raccourcis clavier",
  docs_tui_shortcuts_intro:
    "Ces raccourcis fonctionnent de manière globale dans le TUI. Les raccourcis spécifiques à chaque panneau sont affichés dans leur pied de page.",
  docs_tui_shortcut_intent: "Basculer l'affichage du Graphe d'Intention.",
  docs_tui_shortcut_fold: "Basculer l'état de pliage de la transcription (réduire/étendre les éléments longs).",
  docs_tui_shortcut_paste: "Coller le contenu du presse-papiers. Les images sont sauvegardées dans le dossier de session et insérées sous forme de jetons @path.",
  docs_tui_shortcut_history: "Naviguer dans l'historique des prompts soumis.",
  docs_tui_shortcut_scroll: "Faire défiler la transcription vers le haut ou le bas lorsque la zone de saisie est vide.",
  docs_tui_shortcut_page: "Faire défiler la transcription d'une page complète.",
  docs_tui_shortcut_home_end: "Sauter tout en haut ou tout en bas de la transcription.",
  docs_tui_shortcut_newline: "Insérer un retour à la ligne dans la zone de saisie sans soumettre.",
  docs_tui_shortcut_files: "Tapez @ pour ouvrir l'interface de suggestion de nom de fichier. Tab/Entrée insère le chemin sélectionné.",
  docs_tui_shortcut_sessions: "Tapez @@ pour ouvrir l'interface de référence de session. Tab/Entrée insère l'ID de session sélectionné.",
  docs_tui_shortcut_commands: "Tapez / pour ouvrir l'interface de commande. Tab/Entrée exécute ou insère la commande sélectionnée.",
  docs_tui_shortcut_accept: "Accepter la suggestion de l'interface active (commande, fichier ou session).",
  docs_tui_shortcut_esc:
    "Fermer l'interface ou le panneau actif. Si une exécution est en cours, elle est interrompue. Appuyez deux fois rapidement pour vider la zone de saisie.",
  docs_tui_shortcut_exit: "Quitter le TUI.",
  docs_tui_panels_title: "Panneaux",
  docs_tui_panels_intro:
    "Le TUI affiche plusieurs panneaux interactifs pour gérer l'état d'exécution. Chaque panneau a ses propres contrôles affichés en pied de page.",
  docs_tui_panel_decision:
    "Apparaît lorsqu'un appel d'outil nécessite l'approbation de l'utilisateur. Options : approuver une fois (y), approuver pour toute la session (s) ou bloquer (n/Esc). Naviguez avec ↑↓ et confirmez avec Entrée ou Espace pour cocher.",
  docs_tui_panel_mcp:
    "Parcourez les serveurs MCP découverts depuis .mcp.json et ~/.braincode/. Naviguez avec ↑↓, Entrée pour revérifier la santé, Espace/e pour activer/désactiver, v pour voir la configuration.",
  docs_tui_panel_hooks:
    "Parcourez les hooks de cycle de vie depuis .agents/hooks.json et ~/.braincode/hooks.json. Naviguez avec ↑↓, Entrée/v pour voir les détails, Espace/e pour activer/désactiver.",
  docs_tui_panel_sessions:
    "Parcourez les sessions récentes depuis ~/.braincode/sessions/. Naviguez avec ↑↓, Entrée pour reprendre, v pour voir les métadonnées, Esc pour fermer.",
  docs_tui_panel_brain:
    "Parcourez les Modèles Cerveau disponibles. Naviguez avec ↑↓, Entrée/s pour définir par défaut, v pour voir les mappings de rôles, Esc pour fermer.",
  docs_tui_panel_intent:
    "Affiche le graphe d'intention en temps réel avec la décomposition des tâches, le statut des tâches et les décisions de routage. Ctrl+O bascule, /plan actualise, Esc ferme.",
  docs_tui_panel_error:
    "Affiche les erreurs d'exécution avec des messages lisibles et des indices. Appuyez sur Entrée, Esc ou q pour fermer.",

  docs_troubleshoot_title: "12. Dépannage",
  docs_troubleshoot_keys_title: "Clés API non prises en compte",
  docs_troubleshoot_keys_body:
    "Vérifiez les permissions du fichier ~/.braincode/auth.json (devrait être 0600). Utilisez braincode config pour saisir à nouveau la clé ; ne modifiez pas le fichier manuellement à moins de connaître le schéma.",
  docs_troubleshoot_models_title: "Modèle non sélectionné",
  docs_troubleshoot_models_body:
    "Confirmez que l'ID du modèle dans brains.json correspond à une entrée dans models.json. Exécutez braincode run --dry-run \"<tâche>\" pour voir le plan routeBrain, ou ajoutez --heuristic pour inspecter le routage de secours sans appels au fournisseur.",
  docs_troubleshoot_reset_title: "Tout réinitialiser",
  docs_troubleshoot_reset_body:
    "Arrêtez tout processus braincode en cours, supprimez ~/.braincode/ et relancez braincode config. L'état de votre dépôt n'est jamais modifié.",
} as const;
