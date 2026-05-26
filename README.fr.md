# Braincode

Braincode est un monorepo basé sur Bun pour un agent IA orienté codage capable aussi de traiter des tâches générales. Son idée centrale est un **Brain Model** sélectionnable par l'utilisateur : un profil de stratégie de haut niveau qui planifie dynamiquement quel modèle sous-jacent, quel rôle d'agent, quels outils et quel budget de contexte utiliser pour chaque partie d'une tâche.

Le projet réutilise l'infrastructure Pi lorsque cela a du sens, tout en gardant l'orchestration et l'interface produit Braincode séparées. L'interface terminal interactive appartient à Braincode et est construite avec Ink ; Pi reste une couche provider/runtime, pas l'interface produit.

**Langues** : [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

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

## Philosophie centrale

À l'étape actuelle de l'IA, **une orchestration intelligente des modèles compte plus que n'importe quel modèle pris isolément**. Aucun LLM ne domine sur toutes les dimensions — planification, écriture de code, revue, résumé, réponses rapides et peu coûteuses — et verrouiller un workflow sur un seul modèle gaspille à la fois les capacités et l'argent. Braincode repose sur cette conviction : **exploiter les forces propres à chaque modèle via une orchestration réfléchie est ce qui maximise l'efficacité, la qualité et le rapport coût/bénéfice**. Le Brain Model est l'incarnation concrète de cette philosophie.

## Pourquoi ce projet

Les agents de codage actuels ne sont pas assez intelligents. Un agent idéal devrait **choisir différents modèles selon les besoins**, car chaque modèle a ses propres points forts — certains sont meilleurs en planification, d'autres en écriture de code, en revue de code, ou en réponses rapides et peu coûteuses. Verrouiller tout le flux de travail sur un seul LLM gaspille à la fois les capacités et l'argent.

Braincode est construit autour de cette idée : au lieu de choisir un seul modèle pour tout, l'utilisateur sélectionne un **Brain Model** — une politique de routage qui dispatche chaque sous-tâche (planification, codage, recherche, revue, résumé, réponses rapides) vers le modèle le plus adapté.

Braincode propose actuellement deux modes de haut niveau :

- `auto` — le mode par défaut, qui planifie selon l'intention et route vers différents agents/modèles.
- `radical` — un mode autonome plus agressif pour les utilisateurs qui veulent une exécution plus rapide et plus large.

## Objectifs

- Construire un agent de codage capable aussi de faire de la recherche, de la revue, de la planification, du résumé et de l'automatisation.
- Permettre aux utilisateurs de choisir un Brain Model au lieu de sélectionner manuellement un seul LLM pour tout.
- Router dynamiquement le travail vers différents modèles selon le rôle, le coût, la latence, la taille du contexte et le risque.
- Isoler le contexte entre les agents et n'échanger que des messages handoff/result structurés.
- Fournir un service de configuration local que l'utilisateur ouvre dans son navigateur.
- Stocker la configuration utilisateur réelle sous `~/.braincode/`.
- Utiliser une TUI Ink appartenant à Braincode, centrée sur le mode, le routage Brain Model, les rôles d'agent, les permissions d'outils et l'état de session.
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

La TUI actuelle prend en charge `/help` pour afficher les commandes et `/plan <tâche>` pour prévisualiser le routage Brain Model sans appel provider. Elle n'offre volontairement aucune commande de changement direct de modèle ; la configuration des modèles et providers appartient à `braincode config`.

Pour l'architecture complète, les responsabilités des paquets, la disposition des configurations et la feuille de route, consultez la version anglaise du [README.md](./README.md).
