# Braincode

Un orchestrateur d'agents de code multi-modèles.

Braincode transforme une demande de code en workflow d'ingénierie coordonné :

```text
planner -> specialist workers -> primary executor -> reviewer -> final report
```

Ce n'est pas un autre CLI IA qui demande à un seul modèle de planifier, coder et se relire lui-même. Braincode est un moteur de workflow de code avec séparation des rôles, routage des modèles, contextes workers isolés, garde-fous de revue et rapports finaux structurés.

**Langues** : [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

## Démarrage rapide

```sh
npm i -g @taotao7/braincode
braincode config
braincode run --dry-run "review this repo"
```

`braincode config` ouvre l'interface locale de configuration et stocke les réglages sous `~/.braincode/`. Le dry run utilise le même routage routeBrain que l'exécution réelle, sans modifier de fichiers ni lancer d'outils.

### Première édition réelle

```sh
braincode run --allow-edits "update README wording"
```

`--allow-edits` approuve automatiquement les lectures locales et éditions de fichiers de première partie. L'exécution de commandes, les outils MCP, les outils inconnus et les règles `deny` restent bloqués.

### Exécution locale autonome

```sh
braincode run --yes "fix failing test and run checks"
```

`--yes` approuve automatiquement les appels d'outils locaux qui ne sont pas refusés par la politique. Utilisez-le pour laisser Braincode produire un patch, lancer les checks, appliquer la revue et rendre un rapport final structuré.

## Pourquoi Braincode ?

La plupart des agents de code demandent au même modèle de planifier, coder et revoir son propre travail. Braincode sépare ces rôles.

- Router les tâches simples vers des modèles moins chers
- Escalader le travail risqué vers des modèles plus forts
- Garder les contextes workers isolés
- Exiger une revue indépendante pour les éditions de fichiers risquées
- Produire des rapports finaux structurés

## Commandes courantes

```bash
braincode run "add login validation"
braincode run --allow-edits "add login validation"
braincode run --yes "fix the failing test"
braincode run --dry-run "add login validation"
braincode run --dry-run --heuristic "add login validation"
braincode benchmark
```

`braincode run` utilise le Brain Model configuré. Les exécutions non interactives sont en lecture seule par défaut car il n'y a pas d'interface d'approbation ; utilisez `--allow-edits` pour approuver les lectures et éditions locales, ou `--yes` pour approuver les appels d'outils qui ne sont pas refusés par politique. `--dry-run` prévisualise le même chemin de planification routeBrain que l'exécution réelle ; ajoutez `--heuristic` pour un diagnostic sans appel provider. Utilisez `braincode config` pour changer le Brain Model actif et les réglages provider/modèle.

`braincode benchmark` lance une suite de prompts de codage représentatifs : édition de README, correction de test en échec, changement risqué côté auth, changement package/script, et revue de sécurité en lecture seule. Par défaut, il demande routeBrain quand les identifiants existent et signale le fallback heuristique ; `--heuristic` force un diagnostic sans provider.

## Demo Safe Review Patch

Le demo exécutable [examples/login-validation-demo](./examples/login-validation-demo) montre la boucle principale sur un petit fixture TS/Bun/React :

```text
routeBrain -> frontend/backend/qa -> primary -> checks -> review -> final report
```

Test hors-ligne depuis la racine du dépôt :

```sh
bun run braincode -- benchmark --execute --task login-validation
```

Forme attendue du rapport :

```text
login-validation       PASSED changed=src/login.ts +5 -1 checks=passed review=approved
```

Le prompt demo, le patch attendu et le transcript asciinema sont dans [examples/login-validation-demo](./examples/login-validation-demo).

## Fonctionnement

1. `routeBrain` crée un plan structuré.
2. Brain lance des workers spécialistes isolés.
3. Les workers renvoient des résultats structurés, pas des transcripts complets.
4. L'exécuteur principal applique le changement avec le contexte des workers.
5. Un worker de revue vérifie le résultat quand la politique l'exige.
6. Brain renvoie le rapport final et enregistre la session.

## Installation

```bash
# Homebrew (macOS / Linux)
brew install taotao7/tap/braincode

# npm (nécessite Node >= 18)
npm i -g @taotao7/braincode

# Ou télécharger un binaire pré-compilé
curl -L https://github.com/taotao7/braincode/releases/latest/download/braincode-darwin-arm64.tar.gz \
  | tar -xz && ./braincode-darwin-arm64 help
```

Cibles supportées : `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. Après installation, lancez `braincode` pour la TUI ou `braincode config` pour ouvrir la page de configuration locale.

## Erreurs courantes

| Symptôme | Correction |
| --- | --- |
| Clé API manquante | Lancez `braincode config`, ou ajoutez la clé provider dans `~/.braincode/auth.json`. |
| Une image exige un modèle vision | Choisissez un modèle routeBrain/primary compatible vision dans `braincode config`. |
| Réponse assistant vide | Activez `BRAINCODE_DEBUG=true` et vérifiez le type d'API du modèle dans `~/.braincode/models.json`. |
| Context handoff requis | Réduisez la tâche ou ajoutez des références `@file` précises pour réduire le contexte worker. |
| Commande bloquée par les permissions | Utilisez la TUI pour approuver, ou `--yes` pour les commandes non refusées ; les règles `deny` ne sont pas contournables. |

## Notes de version

Voir [RELEASES.fr.md](./RELEASES.fr.md).

## Philosophie centrale

À l'étape actuelle de l'IA, **une orchestration intelligente des modèles compte plus que n'importe quel modèle pris isolément**. Aucun LLM ne domine sur toutes les dimensions — planification, écriture de code, revue, résumé, réponses rapides et peu coûteuses — et verrouiller un workflow sur un seul modèle gaspille à la fois les capacités et l'argent. Braincode repose sur cette conviction : **exploiter les forces propres à chaque modèle via une orchestration réfléchie est ce qui maximise l'efficacité, la qualité et le rapport coût/bénéfice**. Le Brain Model est l'incarnation concrète de cette philosophie.

## Pourquoi ce projet

Les agents de codage actuels ne sont pas assez intelligents. Un agent idéal devrait **choisir différents modèles selon les besoins**, car chaque modèle a ses propres points forts — certains sont meilleurs en planification, d'autres en écriture de code, en revue de code, ou en réponses rapides et peu coûteuses. Verrouiller tout le flux de travail sur un seul LLM gaspille à la fois les capacités et l'argent.

Braincode est construit autour de cette idée : au lieu de choisir un seul modèle pour tout, l'utilisateur sélectionne un **Brain Model** — une politique de routage qui dispatche chaque sous-tâche (planification, codage, recherche, revue, résumé, réponses rapides) vers le modèle le plus adapté.

Braincode propose actuellement deux modes de haut niveau :

- `auto` — le mode par défaut, qui planifie selon l'intention et route vers différents agents/modèles.
- `radical` — un mode autonome plus agressif pour les utilisateurs qui veulent une exécution plus rapide et plus large.

## Rôles d'agent (v0.2.0)

Le harness expose **14 rôles**, structurés comme des spécialistes par rôle plus un petit jeu d'aides fonctionnelles non chevauchantes. Le rôle générique `coding` a été supprimé — le travail de code est découpé par domaine pour que chaque rôle puisse être routé vers un modèle réellement fort sur ce domaine.

**Routage**
- `routeBrain` — planificateur piloté par LLM. Lit le prompt et émet une décision de routage structurée (rôle principal, workers, todos, dépendances). Le harness n'utilise plus le matching regex pour router.

**Spécialistes de domaine**
- `frontend` · `backend` · `dba` · `devops` · `designer` · `security` · `qa` · `rush`

**Aides fonctionnelles (non chevauchantes)**
- `librarian` — cartographie de code ET recherche factuelle (absorbe l'ancien rôle `research`)
- `review` — inspection de défauts dans le code existant
- `oracle` — raisonnement difficile, arbitrages d'architecture
- `summarize` — compression de handoff

**Affichage d'état**
- `pet` — rapporteur d'état BrainPet, en lecture seule

Supprimés dans cette release : `coding`, `fastReply`, `research`. Les configs utilisateur existantes sont migrées automatiquement — les entrées de rôle obsolètes sont retirées au premier chargement.

## Objectifs

- Construire un agent de codage capable aussi de faire de la recherche, de la revue, de la planification, du résumé et de l'automatisation.
- Permettre aux utilisateurs de choisir un Brain Model au lieu de sélectionner manuellement un seul LLM pour tout.
- Router dynamiquement le travail vers différents modèles selon le rôle, le coût, la latence, la taille du contexte et le risque.
- Isoler le contexte entre les agents et n'échanger que des messages handoff/result structurés.
- Fournir un service de configuration local que l'utilisateur ouvre dans son navigateur.
- Stocker la configuration utilisateur réelle sous `~/.braincode/`.
- Utiliser une TUI Ink appartenant à Braincode, centrée sur le mode, le routage Brain Model, les rôles d'agent, les permissions d'outils et l'état de session.
- Garder le pliage du transcript disponible avec `Ctrl+T`, avec BrainPet ancré en bas à droite pour la progression contextuelle.
- Utiliser Bun et une architecture monorepo dès le départ.
- Garder les paquets faiblement couplés et réutilisables.

## Non-objectifs pour la première phase

- Ne pas forker pi-mono.
- Ne pas utiliser la TUI Pi ou une interface générique de changement de modèle comme interface produit Braincode.
- Ne pas construire toutes les surfaces UI d'un coup.
- Ne pas concevoir un système de plugins complexe avant que le runtime d'agent de base ne fonctionne.
- Ne pas stocker les secrets utilisateur ou les paramètres locaux dans le dépôt.

## Documentation

- [Vue d'ensemble](./docs/overview.fr.md) — carte de haut niveau des couches, paquets et flux d'une requête de bout en bout. Commencez ici.
- [Architecture](./docs/architecture.md) — architecture principale, conception du Brain Model, isolation du contexte, intégration Pi, service de configuration local (anglais uniquement).
- [Gestion du contexte](./docs/context-management.fr.md) — isolation Brain / worker, packets handoff / result, références de prompt, JSONL de session.
- [Communication entre agents](./docs/agent-communication.fr.md) — cycle de vie des workers, routage, hooks, événements runtime, exécutions multi-agents.
- [Project structure and plan](./docs/project-structure.md) — disposition du workspace, responsabilités des paquets, jalons (anglais uniquement).
- [Visual style](./docs/visual-style.md) — direction UI / marque (anglais uniquement).
- [References](./docs/references.md) — matériaux de référence Amp / Pi utilisés pour les décisions de conception (anglais uniquement).

## Pour aller plus loin

La TUI actuelle prend en charge `/help` pour afficher les commandes et `/plan <tâche>` pour prévisualiser le routage Brain Model ; utilisez `/plan --heuristic <tâche>` pour un diagnostic sans provider. Elle n'offre volontairement aucune commande de changement direct de modèle ; la configuration des modèles et providers appartient à `braincode config`.

Les rapports et le session ledger enregistrent des métriques token-only : tokens par phase router/support/primary/review, `tool_call_count`, et comparaison benchmark entre le total brain-agent et la phase primary. Braincode n'estime pas le coût en dollars, car les providers, proxies, abonnements et modèles OAuth connectés par l'utilisateur n'exposent pas toujours un prix fiable.

Pour l'architecture complète, les responsabilités des paquets, la disposition des configurations et la feuille de route, consultez la version anglaise du [README.md](./README.md).
