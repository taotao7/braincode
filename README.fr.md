# Braincode

Braincode est un monorepo basé sur Bun pour un agent IA orienté codage capable aussi de traiter des tâches générales. Son idée centrale est un **Brain Model** sélectionnable par l'utilisateur : un profil de stratégie de haut niveau qui planifie dynamiquement quel modèle sous-jacent, quel rôle d'agent, quels outils et quel budget de contexte utiliser pour chaque partie d'une tâche.

Le projet réutilise l'infrastructure Pi lorsque cela a du sens, tout en gardant l'orchestration spécifique au produit Braincode séparée.

**Langues** : [English](./README.md) · [中文](./README.zh.md) · [Français](./README.fr.md)

## Philosophie centrale

À l'étape actuelle de l'IA, **une orchestration intelligente des modèles compte plus que n'importe quel modèle pris isolément**. Aucun LLM ne domine sur toutes les dimensions — planification, écriture de code, revue, résumé, réponses rapides et peu coûteuses — et verrouiller un workflow sur un seul modèle gaspille à la fois les capacités et l'argent. Braincode repose sur cette conviction : **exploiter les forces propres à chaque modèle via une orchestration réfléchie est ce qui maximise l'efficacité, la qualité et le rapport coût/bénéfice**. Le Brain Model est l'incarnation concrète de cette philosophie.

## Pourquoi ce projet

Les agents de codage actuels ne sont pas assez intelligents. Un agent idéal devrait **choisir différents modèles selon les besoins**, car chaque modèle a ses propres points forts — certains sont meilleurs en planification, d'autres en écriture de code, en revue de code, ou en réponses rapides et peu coûteuses. Verrouiller tout le flux de travail sur un seul LLM gaspille à la fois les capacités et l'argent.

Braincode est construit autour de cette idée : au lieu de choisir un seul modèle pour tout, l'utilisateur sélectionne un **Brain Model** — une politique de routage qui dispatche chaque sous-tâche (planification, codage, recherche, revue, résumé, réponses rapides) vers le modèle le plus adapté.

## Objectifs

- Construire un agent de codage capable aussi de faire de la recherche, de la revue, de la planification, du résumé et de l'automatisation.
- Permettre aux utilisateurs de choisir un Brain Model au lieu de sélectionner manuellement un seul LLM pour tout.
- Router dynamiquement le travail vers différents modèles selon le rôle, le coût, la latence, la taille du contexte et le risque.
- Isoler le contexte entre les agents et n'échanger que des messages handoff/result structurés.
- Fournir un service de configuration local que l'utilisateur ouvre dans son navigateur.
- Stocker la configuration utilisateur réelle sous `~/.braincode/`.
- Utiliser Bun et une architecture monorepo dès le départ.
- Garder les paquets faiblement couplés et réutilisables.

## Non-objectifs pour la première phase

- Ne pas forker pi-mono.
- Ne pas construire toutes les surfaces UI d'un coup.
- Ne pas concevoir un système de plugins complexe avant que le runtime d'agent de base ne fonctionne.
- Ne pas stocker les secrets utilisateur ou les paramètres locaux dans le dépôt.

## Pour aller plus loin

Pour l'architecture complète, les responsabilités des paquets, la disposition des configurations et la feuille de route, consultez la version anglaise du [README.md](./README.md).
