export const fr = {
  nav_arch: "Architecture",
  nav_intent: "Intent",
  nav_handoff: "Handoff",
  nav_modes: "Exécution",
  nav_install: "Installation",
  nav_github: "GitHub",
  release_label: "VERSION",
  hero_title_1: "Un harness,",
  hero_title_2: "pas un agent.",
  hero_lead:
    "Braincode est un harness multi-LLM, pas un agent à modèle unique. Vous choisissez le Cerveau — il dirige chaque sous-tâche vers le modèle et le rôle spécialisé les mieux adaptés.",
  btn_npm_install: "INSTALLER NPM",
  btn_docs: "Lire la doc",
  section_arch_eyebrow: "ARCHITECTURE SYSTÈME",
  section_arch_title:
    "L'orchestration intelligente compte plus que le choix du modèle.",
  feature_1_title: "Routage Brain Model",
  feature_1_body:
    "Aucun LLM n'est meilleur partout sur planification, code et revue. Le Brain Model décide du rôle et du budget de contexte pour chaque sous-tâche.",
  feature_2_title: "Exécution multi-agents isolée",
  feature_2_body:
    "Un agent principal plus plusieurs workers en parallèle. Les workers ont un contexte totalement isolé et ne communiquent que via des packets structurés — le contexte principal reste propre.",
  feature_3_title: "Configuration locale d'abord",
  feature_3_body:
    "Toute la configuration vit dans ~/.braincode/. Modifiable dans le navigateur, en direct. Les clés API restent locales, jamais dans un prompt.",
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
  section_roles_eyebrow: "14 RÔLES · ROLE-FIRST",
  section_roles_title: "Un harness, pas un agent.",
  section_roles_lead:
    "Il n'y a pas de rôle « coding » générique. Le travail de code est découpé par domaine pour que chaque rôle puisse être routé vers un modèle réellement fort sur ce domaine. Le routeBrain piloté par LLM choisit le spécialiste.",
  section_roles_removed:
    "v0.2.0 a supprimé : coding, fastReply, research — fusionnés dans les spécialistes de domaine, rush, et librarian.",
  section_cta_title: "Prêt à choisir votre cerveau ?",
  section_cta_lead: "Disponible pour macOS, Linux et npm.",
  cta_docs: "Lire la documentation",
  footer_docs: "Docs",
  footer_github: "GitHub",
  footer_license: "Licence",
} as const;
