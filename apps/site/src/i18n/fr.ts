export const fr = {
  nav_arch: "Pourquoi",
  nav_intent: "Intent",
  nav_output: "Sortie",
  nav_handoff: "Handoff",
  nav_modes: "Exécution",
  nav_install: "Installation",
  nav_github: "GitHub",
  nav_docs: "Docs",
  nav_home: "Accueil",
  slogan: "Le courage est l'hymne de l'humanité. Oser défier la difficulté, c'est là que naît le plaisir.",
  release_label: "VERSION",
  hero_title_1: "Braincode",
  hero_title_2: "Un orchestrateur d'agents de code multi-modèles.",
  hero_lead:
    "Braincode transforme une demande de code en planificateur, workers spécialistes, exécuteur principal, reviewer et rapport final.",
  workflow_label: "Workflow Braincode",
  workflow_step_1: "Plan",
  workflow_step_2: "Workers",
  workflow_step_3: "Exécution",
  workflow_step_4: "Revue",
  workflow_step_5: "Rapport",
  btn_npm_install: "INSTALLER NPM",
  btn_docs: "Lire la doc",
  section_arch_eyebrow: "POURQUOI BRAINCODE",
  section_arch_title:
    "Pas un autre CLI IA. Un moteur de workflow de code.",
  feature_1_title: "Rôles séparés",
  feature_1_body:
    "La plupart des agents demandent au même modèle de planifier, coder et se relire. Braincode sépare plan, exécution, revue et rapport.",
  feature_2_title: "Routage coût et risque",
  feature_2_body:
    "Les tâches simples peuvent utiliser des modèles moins chers. Les éditions risquées peuvent escalader vers de meilleurs modèles et une revue indépendante.",
  feature_3_title: "Contexte worker isolé",
  feature_3_body:
    "Les workers n'héritent pas de tout le transcript ni de l'état des autres. Ils renvoient des résultats structurés à l'exécuteur principal.",
  section_intent_eyebrow: "INTENT GRAPH · CTRL+O",
  section_intent_title: "Voyez le cerveau penser.",
  section_intent_lead:
    "Chaque exécution produit un DAG en direct. Le cerveau décompose votre tâche en sous-agents spécialisés, les ordonne par dépendances, et envoie chacun vers le bon modèle. Ctrl+O dans le TUI pour l'ouvrir.",
  intent_refresh_hint: "/PLAN RAFRAÎCHIT · ESC FERME",
  intent_pillar_1_title: "Décomposition",
  intent_pillar_1_body:
    "Le cerveau lit la requête et propose des sous-tâches avec des dépendances explicites — pas une todo plate.",
  intent_pillar_2_title: "Statut en direct",
  intent_pillar_2_body:
    "Chaque nœud porte un glyphe — ● cerveau, ☑ fait, ◐ en cours, ☐ en attente — rafraîchi à chaque tick.",
  intent_pillar_3_title: "Auditable",
  intent_pillar_3_body:
    "Chaque arête garde sa raison. Vous savez « pourquoi ce worker a tourné » sans lire le transcript.",
  section_output_eyebrow: "SORTIE RUNTIME",
  section_output_title: "Chaque action porte une étiquette visible.",
  section_output_lead:
    "Les tool calls, recherches web, exécutions shell et décisions utilisateur ne se fondent pas dans la même ligne de transcript. Braincode marque d'abord le type d'action, puis affiche arguments, statut et résultats.",
  output_frame_title: "TRANSCRIPT D'EXÉCUTION",
  output_frame_hint: "ÉTIQUETTES D'OUTILS · DÉCISIONS COCHABLES",
  output_decision_copy: "Une commande dangereuse exige une décision explicite.",
  output_decision_approve: "Approuver une fois : lancer la commande de build",
  output_decision_block: "Bloquer et renvoyer la raison au modèle",
  output_pillar_1_title: "Étiquettes explicites",
  output_pillar_1_body:
    "Web search, execute, read, write et MCP affichent des labels distincts avant le payload.",
  output_pillar_2_title: "Statuts séparés",
  output_pillar_2_body:
    "Début, streaming, fin, échec, durée et résumé de résultat restent faciles à scanner.",
  output_pillar_3_title: "Choix cochables",
  output_pillar_3_body:
    "Quand l'agent a besoin d'une décision, le TUI présente des options cochables au lieu d'un texte libre ambigu.",
  section_handoff_eyebrow: "HANDOFF PACKETS",
  section_handoff_title: "Transfert de contexte cerveau-vers-agent.",
  section_handoff_lead:
    "Les workers n'héritent jamais du transcript principal. Chacun s'éveille avec un packet structuré — task id, parent id, rôle, objectif, contraintes, sortie attendue. Leurs chaînes de pensée restent isolées. Ils renvoient du JSON. Le cerveau lit du JSON. Le contexte principal reste propre.",
  handoff_pkt_title: "▮ HANDOFF · LIBRARIAN WORKER",
  handoff_pkt_phase: "PHASE = SUPPORT",
  handoff_card_1_title: "Contexte isolé",
  handoff_card_1_body:
    "Un worker ne peut pas lire le prompt d'un autre worker ni le transcript racine. Une hallucination locale ne contamine pas ses pairs.",
  handoff_card_2_title: "Retour structuré",
  handoff_card_2_body:
    "Chaque worker renvoie du JSON — summary, artifacts, risks, nextQuestions. Le cerveau fusionne sans relire des chats verbeux.",
  handoff_card_3_title: "Reprise possible",
  handoff_card_3_body:
    "Les handoffs sont persistés sur disque. Crash en cours, resume session, le cerveau rejoue le DAG là où les packets s'étaient arrêtés.",
  section_modes_eyebrow: "DEUX MODES D'EXÉCUTION",
  section_modes_title: "Choisissez le niveau d'agressivité.",
  auto_title: "Mode Auto",
  auto_tagline: "Conservateur et séquentiel. La stabilité gagne.",
  auto_body:
    "Outils en série. Chaque action risquée (édition de fichier) déclenche un Review Agent pour vérification. Idéal au quotidien.",
  auto_meta: "-> actif par défaut",
  radical_title: "Mode Radical",
  radical_tagline: "Agressif et parallèle. Plein gaz.",
  radical_body:
    "Appels d'outils en parallèle. Liberté de routage maximale, un peu de stabilité contre la vitesse brute. Pour les devs qui connaissent leur code.",
  radical_meta: "-> à manier avec soin",
  section_roles_eyebrow: "15 RÔLES · ROLE-FIRST",
  section_roles_title: "Un moteur de workflow, pas un CLI à modèle unique.",
  section_roles_lead:
    "Il n'y a pas de rôle « coding » générique. Le travail de code est découpé par domaine pour que chaque rôle puisse être routé vers un modèle réellement fort sur ce domaine. Le routeBrain piloté par LLM choisit le spécialiste.",
  section_roles_removed:
    "v0.2.0 a supprimé : coding, fastReply, research — fusionnés dans les spécialistes de domaine, rush, et librarian.",
  roles_carousel_label: "Carrousel du guide d'appel des rôles Braincode",
  role_prev: "Rôle précédent",
  role_next: "Rôle suivant",
  role_call_label: "Appeler quand",
  role_call_routeBrain:
    "Pour classifier l'intention, choisir les rôles, planifier le graphe de workers, attribuer les todos et poser les dépendances. Il route le travail sans résoudre la tâche.",
  role_call_frontend:
    "Pour le comportement navigateur : composants, état, accessibilité, responsive, ajustement du texte et vérification visuelle.",
  role_call_backend:
    "Pour APIs, services, validation, points d'autorisation, limites de persistance, erreurs et comportement serveur durable.",
  role_call_designer:
    "Pour les parcours UX, l'architecture d'information, les interactions, les états, la hiérarchie visuelle et la priorité du texte produit.",
  role_call_imageMaker:
    "Quand l'utilisateur a besoin d'un asset bitmap, portrait de rôle, prompt image, visuel généré ou édition via l'Images API configurée.",
  role_call_dba:
    "Pour schémas, migrations, index, plans de requête, contraintes, intégrité des données, rétention, backfills et risque de rollback.",
  role_call_devops:
    "Pour build, CI, packaging, déploiement, environnement local, câblage des secrets, observabilité et runbooks opérationnels.",
  role_call_security:
    "Pour auth, permissions, secrets, injection, exposition des dépendances, frontières de confiance, abus possibles et valeurs sûres par défaut.",
  role_call_qa:
    "Pour critères d'acceptation, bugs reproductibles, cas limites, régressions, stratégie de test, fixtures et lacunes de couverture.",
  role_call_review:
    "Après un plan, diff ou résultat, pour une recherche indépendante de défauts, de risques de régression ou de tests manquants.",
  role_call_summarize:
    "Pour compresser un long contexte en état de handoff : objectifs, décisions, artefacts, validation, réserves et blocages.",
  role_call_oracle:
    "Pour choix d'architecture difficiles, debugging ambigu, arbitrages complexes, raisonnement profond et décisions sous incertitude.",
  role_call_librarian:
    "Pour orientation repo, recherche de symboles, traçage d'architecture, cartes de dépendances, faits vérifiés et références précises.",
  role_call_rush:
    "Pour les toutes petites tâches à faible risque et les réponses courtes quand aucun spécialiste n'est plus adapté.",
  role_call_pet:
    "Uniquement comme reporter d'état TUI en lecture seule. Il observe les snapshots d'exécution et produit de courtes lignes de progrès; il ne route jamais.",
  section_cta_title: "Prêt à choisir votre cerveau ?",
  section_cta_lead: "Disponible pour macOS, Linux et npm.",
  cta_docs: "Lire la documentation",
  footer_docs: "Docs",
  footer_github: "GitHub",
  footer_license: "Licence",

  /* Page Docs */
  docs_page_title: "Documentation",
  docs_page_lead:
    "Tout ce dont vous avez besoin pour installer, configurer et exécuter Braincode sur votre machine. Cette page est intégrée dans le même HTML que le site principal — lisible hors ligne.",
  docs_toc_title: "Sur cette page",
  docs_back_home: "← Retour à l'accueil",

  docs_setup_title: "1. Installation",
  docs_setup_intro:
    "Braincode est fourni comme un CLI basé sur Bun. Choisissez l'une des trois méthodes ci-dessous. Le CLI lance un TUI Ink par défaut et expose un serveur de configuration local dans le navigateur.",
  docs_setup_npm_title: "Installer via npm",
  docs_setup_npm_body:
    "Le paquet npm est la méthode recommandée. Il installe le binaire braincode dans votre répertoire global et fonctionne sur macOS, Linux et Windows (WSL).",
  docs_setup_brew_title: "Installer via Homebrew",
  docs_setup_brew_body:
    "Homebrew installe un binaire Bun précompilé avec l'entrée braincode, vous n'avez pas besoin d'installer Bun vous-même.",
  docs_setup_source_title: "Construire depuis les sources",
  docs_setup_source_body:
    "Clonez le dépôt, exécutez bun install, puis lancez braincode directement depuis le workspace. C'est le chemin utilisé par les contributeurs.",
  docs_setup_first_run_title: "Première exécution",
  docs_setup_first_run_body:
    "Exécutez braincode dans un répertoire vide pour lancer le TUI, ou braincode config pour démarrer le serveur de configuration local (http://127.0.0.1:5181 par défaut).",

  docs_home_title: "2. Le répertoire ~/.braincode/",
  docs_home_intro:
    "Toute la configuration utilisateur runtime vit dans ~/.braincode/. Le dépôt ne contient jamais vos secrets ; vous pouvez effacer ~/.braincode/ à tout moment et relancer braincode config pour recréer les valeurs par défaut.",
  docs_home_files_title: "Fichiers et dossiers",
  docs_home_settings_title: "settings.json",
  docs_home_settings_body:
    "Préférences utilisateur de haut niveau : id du Brain Model sélectionné, mode d'exécution par défaut (auto ou radical), thème TUI, drapeau de télémétrie.",
  docs_home_auth_title: "auth.json",
  docs_home_auth_body:
    "Clés API fournisseur et tokens OAuth. Écrit avec des permissions restrictives (0600). Ne jamais commettre, journaliser, ou coller dans un prompt. Braincode les masque dans le TUI.",
  docs_home_brains_title: "brains.json",
  docs_home_brains_body:
    "Vos Brain Models. Chaque entrée est une politique de routage : quel modèle prend le rôle planificateur, quel modèle prend chaque rôle spécialiste, chaîne de repli, règles d'escalade.",
  docs_home_models_title: "models.json",
  docs_home_models_body:
    "Registre fournisseur/modèle : id fournisseur, id modèle, fenêtre de contexte, indices de coût, flags de capacité. brains.json y fait référence par id.",
  docs_home_tools_title: "tools.json",
  docs_home_tools_body:
    "Carte de permissions pour les outils intégrés (read, write, edit, shell, search) et les outils MCP découverts depuis .mcp.json. Détermine quels outils nécessitent une approbation.",
  docs_home_hooks_title: "hooks.json",
  docs_home_hooks_body:
    "Hooks de cycle de vie utilisateur. Les hooks de commande doivent porter trusted: true avant que Braincode ne les exécute.",
  docs_home_sessions_title: "sessions/",
  docs_home_sessions_body:
    "Logs de session JSONL pour la reprise et l'audit. Chaque session contient aussi les packets de handoff de chaque exécution worker.",
  docs_home_logs_title: "logs/ et cache/",
  docs_home_logs_body:
    "Logs runtime rotatifs et cache éphémère (résumés de compaction, résultats de sonde de modèle). Supprimables pour récupérer de l'espace disque.",

  docs_brain_title: "3. Brain Models",
  docs_brain_intro:
    "Un Brain Model est une politique de routage, pas un LLM unique. Il mappe chaque rôle d'agent à une politique de modèle avec niveau de réflexion, chaîne de repli et seuils d'escalade. routeBrain choisit les rôles et workers ; chaque rôle sélectionné s'exécute via sa propre chaîne de modèles configurée.",
  docs_brain_example_title: "Exemple brains.json",
  docs_brain_roles_title: "Rôles intégrés",
  docs_brain_roles_body:
    "Braincode v0.2.0 est livré avec 15 emplacements de rôles. coding, fastReply, et research ont été supprimés et absorbés dans les spécialistes de domaine, rush, et librarian.",

  docs_modes_title: "4. Modes d'exécution",
  docs_modes_intro:
    "Braincode a deux modes d'exécution de haut niveau. Le mode contrôle le degré d'agressivité autorisé du cerveau lors de la planification, la parallélisation et l'escalade vers des modèles plus puissants.",
  docs_modes_auto_body:
    "Mode par défaut. Outils en série. Les actions risquées (éditions de fichiers, commandes shell) déclenchent un Review Agent. Idéal pour la stabilité quotidienne.",
  docs_modes_radical_body:
    "Appels d'outils en parallèle, planification plus large, modèles plus puissants plus tôt. La sécurité passe toujours par le système de permissions, mais sacrifie un peu de stabilité pour la vitesse.",
  docs_modes_switch_hint:
    "Changez de mode depuis le TUI avec /auto ou /radical, ou définissez defaultMode dans settings.json.",

  docs_mcp_title: "5. MCP — Model Context Protocol",
  docs_mcp_intro:
    "Braincode charge les déclarations de serveurs MCP de projet depuis .mcp.json à la racine du dépôt. MCP vous permet d'exposer des outils externes (bases de données, navigateurs, APIs internes) comme outils Braincode sans modifier le runtime central.",
  docs_mcp_file_title: ".mcp.json",
  docs_mcp_file_body:
    "Déclarez chaque serveur MCP avec un nom, un transport (stdio ou http), commande/args ou url, et des variables d'environnement optionnelles. Ne mettez pas de secrets bruts ici — référencez-les par nom d'env. Braincode résout les valeurs d'environnement depuis votre shell ou ~/.braincode/auth.json.",
  docs_mcp_security_title: "Modèle de sécurité",
  docs_mcp_security_body:
    "Les outils MCP héritent du système de permissions de Braincode. Chaque appel MCP porte une étiquette dans le TUI ([MCP] toolName) et les outils risqués (écritures, appels de type shell) demandent une approbation sauf s'ils sont explicitement sur la liste blanche dans tools.json.",

  docs_skills_title: "6. Skills",
  docs_skills_intro:
    "Les Skills sont des documents Markdown locaux au projet qui enseignent à Braincode un workflow spécialisé. Ils se trouvent sous .agents/skill/<skill-id>/SKILL.md (ou .agents/skill/*.md au niveau supérieur) et sont chargés comme contexte de prompt quand le cerveau juge qu'ils sont pertinents.",
  docs_skills_file_title: "Structure d'un Skill",
  docs_skills_file_body:
    "Un dossier skill contient SKILL.md (le prompt) plus tout document de référence. Le premier titre est le nom du skill. Le cerveau peut sélectionner un skill selon l'intention utilisateur — vous n'avez pas besoin de l'invoquer manuellement.",
  docs_skills_use_title: "Quand écrire un Skill",
  docs_skills_use_body:
    "Écrivez un skill quand un workflow est répétitif, opinionné, et non évident depuis le seul codebase — par exemple : « Lancer la suite QA », « Déployer en staging », « Écrire un ADR ». Un skill par intention.",

  docs_agents_title: "7. AGENTS.md",
  docs_agents_intro:
    "AGENTS.md à la racine du dépôt est un contexte projet durable. Braincode le lit dans l'agent principal et chaque worker. Utilisez-le pour les règles d'ingénierie, les conventions de code et les liens vers les docs plus profondes — pas pour des notes de tâches transitoires.",

  docs_hooks_title: "8. Hooks",
  docs_hooks_intro:
    "Les Hooks sont des commandes ou scripts déclenchés à des points du cycle de vie (pre-tool, post-tool, on-session-end). Les hooks projet vivent dans .agents/hooks.json ; les hooks utilisateur dans ~/.braincode/hooks.json. Les hooks de commande exigent trusted: true ; Braincode refusera d'exécuter un hook de commande non fiable même s'il est déclaré.",

  docs_config_ui_title: "9. Interface de configuration navigateur",
  docs_config_ui_intro:
    "Exécutez braincode config pour lancer le serveur de configuration local. Il se lie à 127.0.0.1 par défaut et sert l'application web de configuration. Les modifications passent par l'API typée et persistent dans ~/.braincode/ — l'application web n'écrit jamais directement le répertoire home.",

  docs_cli_title: "10. Référence CLI",
  docs_cli_intro:
    "Le CLI braincode est intentionnellement minimal. La plupart du comportement produit se trouve dans les packages ; le CLI sert à les connecter et à héberger le TUI Ink.",
  docs_cli_cmd_default: "Lancer le TUI interactif dans le répertoire courant.",
  docs_cli_cmd_config: "Démarrer le serveur web de configuration local et afficher l'URL.",
  docs_cli_cmd_run: "Exécuter un prompt non interactif unique et afficher le résultat.",
  docs_cli_cmd_dry:
    "Prévisualiser le vrai plan routeBrain pour une tâche. Il utilise le Brain Model configuré et peut appeler le provider de routeBrain ; si routeBrain est indisponible pour une entrée texte seule, la sortie est étiquetée comme fallback heuristic. Une entrée image exige routeBrain et signale directement les échecs router/model.",
  docs_cli_cmd_dry_heuristic:
    "Prévisualiser uniquement le routage heuristic déterministe. À utiliser pour les diagnostics sans provider ou pour vérifier le comportement de fallback.",
  docs_cli_cmd_plan:
    "Dans le TUI, prévisualiser la décision routeBrain configurée pour une tâche. Le plan affiche source de routage, confiance, raison, rôle primaire, workers, modèle, mode et budgets.",
  docs_cli_cmd_plan_heuristic:
    "Dans le TUI, forcer le routage heuristic déterministe. C'est un chemin de diagnostic, pas le flux normal de planification Braincode.",
  docs_cli_cmd_intent:
    "Ouvrir le dernier intent graph. Il montre la décomposition de tâche, les dépendances, les statuts todo, la source de routage, la confiance et la raison.",
  docs_cli_cmd_daemon: "(Planifié) exécuter Braincode comme service local longue durée.",

  docs_troubleshoot_title: "11. Dépannage",
  docs_troubleshoot_keys_title: "Clés API non détectées",
  docs_troubleshoot_keys_body:
    "Vérifiez les permissions du fichier ~/.braincode/auth.json (devrait être 0600). Utilisez braincode config pour ré-entrer la clé ; n'éditez pas le fichier manuellement sauf si vous connaissez le schéma.",
  docs_troubleshoot_models_title: "Modèle non sélectionné",
  docs_troubleshoot_models_body:
    "Confirmez que l'id du modèle dans brains.json correspond à une entrée dans models.json. Exécutez braincode run --dry-run \"<task>\" pour voir le plan routeBrain, ou ajoutez --heuristic pour inspecter le fallback sans appel provider.",
  docs_troubleshoot_reset_title: "Tout réinitialiser",
  docs_troubleshoot_reset_body:
    "Arrêtez tout processus braincode, supprimez ~/.braincode/, et relancez braincode config. L'état de votre dépôt n'est jamais affecté.",
} as const;
