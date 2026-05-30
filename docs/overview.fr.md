# Vue d'ensemble de Braincode

**Langues** : [English](./overview.md) · [中文](./overview.zh.md) · [Français](./overview.fr.md)

Ceci est la carte de haut niveau du code Braincode. Lisez d'abord ce document ; chaque sujet plus approfondi a son propre fichier :

- [Architecture](./architecture.md) — intention de conception, modes, intégration Pi, disposition de la configuration.
- [Gestion du contexte](./context-management.fr.md) — comment les contextes Brain et worker sont isolés et ce qui traverse la frontière.
- [Communication entre agents](./agent-communication.fr.md) — protocole handoff/result, cycle de vie des workers, événements runtime.
- [Project structure and plan](./project-structure.md) — disposition de l'espace de travail, responsabilités des paquets, état d'implémentation.
- [Visual style](./visual-style.md) — direction UI / marque.

## Ce qu'est Braincode

Braincode est un **monorepo basé sur Bun pour un agent IA orienté codage** qui route chaque partie d'une tâche vers le modèle le mieux adapté. L'utilisateur choisit un **Brain Model** (une politique de routage), pas un seul LLM. Une exécution est composée d'un ou plusieurs agents worker isolés dont les résultats structurés sont fusionnés par un agent primaire.

```
Utilisateur -> Ink TUI / CLI / interface navigateur de configuration
            -> Bun.serve (config + contrôle)
            -> Brain Model : choisit rôles, modèles, workers
            -> agents worker isolés (handoff packets en entrée, worker results en sortie)
            -> agent primaire fusionne les résultats
            -> worker de revue optionnel
            -> réponse finale
```

## Couches d'exécution

Le dépôt sépare les préoccupations en quatre couches. La plupart des contributions ne touchent qu'une couche à la fois.

| Couche | Paquets | Responsabilité |
|--------|---------|----------------|
| Interface | `apps/cli` (Ink TUI + CLI), `apps/config-web` | Points d'entrée utilisateur. Rendent les concepts produit Braincode ; ne parlent jamais directement aux providers. |
| Produit | `packages/brain`, `packages/server`, `packages/config` | Sélection du Brain Model, politique de routage, service de configuration local, découverte des fichiers de support de projet. |
| Agent | `packages/agent-runtime`, `packages/context`, `packages/tools`, `packages/protocol` | Orchestration des workers, isolation du contexte, packets handoff/result, registre des outils. |
| Provider | `packages/llm`, `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core` | Normalise les modèles des providers, boucle agent, appels d'outils, sessions. |

Règles inter-couches :

- La couche interface ne doit pas appeler Pi directement. Elle passe par `agent-runtime`.
- `agent-runtime` est le seul endroit qui construit des instances Pi `Agent`.
- `brain` et `context` sont purs : ils décrivent politique et forme, sans jamais appeler de provider.
- `protocol` est le vocabulaire de formes partagé et doit rester léger en dépendances.

## Vue rapide des paquets

```
apps/
  cli/             CLI Bun + Ink TUI (BrainPet, /plan, /team, ...)
  config-web/      Interface de configuration navigateur servie par packages/server

packages/
  shared/          Petits utilitaires (debugLog, primitives). Ne pas y entasser de code.
  protocol/        Formes filaires : ApiResult, ContextRef, AgentMessage.
  config/          Schémas ~/.braincode/*, écritures atomiques, JSONL de session,
                   découverte du support projet (AGENTS.md, .mcp.json, .agents/*).
  server/          Bun.serve sur 127.0.0.1 ; API typée pour l'UI de configuration.
  llm/             Mapping BraincodeModel -> Pi Model, résolution des clés d'API.
  brain/           BrainModel, catalogue de rôles + prompts, planAgentRouting.
  context/         BrainTaskContext, AgentTaskContext, HandoffPacket, WorkerResult.
  agent-runtime/   Orchestrateur : construit RuntimePlan, exécute workers, hooks, MCP, sessions.
  tools/           Définitions d'outils de codage + permissions.
```

Où vivent réellement les choses (points d'entrée à marquer) :

- Routage : `packages/brain/src/index.ts` — `planAgentRouting`, `agentRoleProfiles`, `agentRoleSystemPrompts`.
- Entrée runtime / exports publics : `packages/agent-runtime/src/index.ts` — `executePromptFromConfig`, `planRuntimeFromConfig` et les exports du paquet.
- Construction du plan : `packages/agent-runtime/src/router.ts` — `buildRuntimePlan`, `routePromptWithBrain`.
- Sélection de modèle : `packages/agent-runtime/src/model-selection.ts` — `selectRuntimeModel`, `selectRuntimeModelCandidatesWithApiKey`.
- Exécution des workers : `packages/agent-runtime/src/workers.ts` — `runWorkerFromPlan`, `runSupportWorkers`.
- Formes de contexte : `packages/context/src/index.ts` — tous les types qui traversent la frontière Brain/agent.
- Références de prompt : `packages/agent-runtime/src/prompt-references.ts` plus le wrapper runtime dans `index.ts` — `expandPromptReferences` pour `@path` et `@@session`.
- Sessions : `packages/config/src/index.ts` — `appendSessionRecord`, `readSessionContext`.

## Flux d'une requête de bout en bout

Un `braincode run "<prompt>"` non interactif produit cette trace dans le code :

1. `apps/cli` parse argv et appelle `executePromptFromConfig` depuis `agent-runtime`.
2. Les hooks `SessionStart` et `UserPromptSubmit` s'exécutent. Chacun peut bloquer ; les deux peuvent ajouter du contexte.
3. `expandPromptReferences` résout `@<file>` (inliné jusqu'à 64 Ko) et `@@<session-id>` (instantané de session compact jusqu'à 24 Ko).
4. `buildRuntimePlan` appelle `planAgentRouting` pour une base déterministe, puis demande au router brain configuré de l'affiner. Le résultat est un `RuntimePlan` : rôle primaire, liste de workers, sélection de modèle, mode, mode d'exécution des outils.
5. Les workers de support s'exécutent en parallèle (plafonnés par `brain.routing.maxParallelAgents`). Chacun ne reçoit que la requête utilisateur originale plus son propre `HandoffPacket`. Les hooks `SubagentStart` / `SubagentStop` se déclenchent autour de chaque worker.
6. `buildPrimaryPrompt` compose le prompt de l'agent primaire à partir de la requête originale et des résumés structurés des workers. L'agent primaire a accès aux outils MCP quand le projet en déclare dans `.mcp.json`.
7. Si `requiresReview` est vrai et que le primaire n'est pas lui-même le rôle review, un worker review s'exécute avec le résumé du primaire et les résultats des workers.
8. Le hook `Stop` s'exécute. Le résumé final plus les notes de review est renvoyé à l'appelant, et `run_end` est ajouté au JSONL de session sous `~/.braincode/sessions/<id>.jsonl`.

La variante TUI interactive suit le même chemin. La TUI s'abonne aussi aux `AgentEvent` de `pi-agent-core` et aux `WorkerLifecycleEvent` d'`agent-runtime` pour piloter le panneau de statut BrainPet.

## Modes d'exécution

Les modes sont un concept Braincode ; ils biaisent l'orchestration, pas le modèle.

- **`auto`** — par défaut. Les outils s'exécutent séquentiellement par agent. Le routage est conservateur ; review est requis quand la politique le dit.
- **`radical`** — autonome. Les outils s'exécutent en parallèle au sein d'un agent. Le routage est plus libre. Les frontières de permission s'appliquent toujours.

Source de vérité : `getModePolicy` dans `packages/brain`.

## Brain Model

Un **Brain Model** est une `ModelPolicy` par rôle plus des valeurs par défaut de routage / contexte. Le catalogue de rôles est défini à un seul endroit — `agentRoleProfiles` + `agentRoleSystemPrompts` dans `packages/brain` — pour que le prompt du router, les valeurs par défaut et les prompts système runtime ne divergent jamais. routeBrain voit le catalogue complet et les résumés de capacités des policies de rôles, puis choisit le rôle primaire, les workers, les todos et les dépendances ; chaque rôle sélectionné s'exécute ensuite uniquement via sa propre chaîne `modelId -> fallbackModelIds`.

Rôles routables (ceux qu'un worker peut être), v0.2.0 :
`frontend · backend · designer · dba · devops · security · qa · review · summarize · oracle · librarian · rush`

Supprimés en v0.2.0 : `coding` (absorbé par frontend/backend), `fastReply` (absorbé par `rush`), `research` (absorbé par `librarian`). Le catalogue est plus court délibérément — chaque rôle restant correspond à une décision de routage de modèle réellement différente.

Rôles non routables :

- `routeBrain` — réservé à l'orchestrateur ; choisit des rôles, ne résout jamais de tâches.
- `pet` — reporter de statut BrainPet pour la TUI, en lecture seule.

Quand vous ajoutez un rôle, mettez à jour `routedAgentRoles`, `agentRoleProfiles`, `agentRoleSystemPrompts` et `BrainModel.roles` **ensemble** — ils sont délibérément indexés par la même union.

## Configuration

Tout ce qui est spécifique à l'utilisateur vit sous `~/.braincode/` :

```
~/.braincode/
  settings.json      mode d'exécution, id du brain par défaut, feature flags
  auth.json          clés provider (gardées hors des prompts de modèle)
  brains.json        Brain Models
  models.json        catalogue BraincodeModel (provider, baseUrl, id)
  tools.json         interrupteurs d'outils
  hooks.json         hooks de cycle de vie utilisateur
  sessions/          JSONL par session des événements d'orchestration
  logs/, cache/      sous-produits runtime
```

Les fichiers de support spécifiques au projet vivent à côté du code :

```
<repo>/
  AGENTS.md                 instructions de projet durables injectées dans les prompts
  .mcp.json                 déclarations de serveurs MCP du projet (métadonnées seulement dans les prompts)
  .agents/hooks.json        hooks de cycle de vie du projet
  .agents/skills/<id>/SKILL.md   skills locales au projet
```

`packages/config` possède la découverte et le parsing. `agent-runtime` décide ce qui devient texte de prompt versus `ContextRef`.

## Hooks et MCP

- Les hooks sont des handlers de commandes indexés par nom d'événement. Événements runtime supportés : `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`. Les handlers doivent déclarer `trusted: true` pour s'exécuter aujourd'hui (il n'y a pas encore d'UI de revue). Voir `runConfiguredHooks` dans `agent-runtime`.
- Les serveurs MCP sont connectés par exécution via `McpToolHub`. Le hub renvoie des `AgentTool` Pi prêts à l'emploi ; les serveurs qui échouent ou sont ignorés sont remontés via `onMcpReport`.

## Tests et boucle de développement

```sh
bun install
bun run check        # type-check sur tout le workspace
bun test             # tests unitaires (config, brain, llm, context, agent-runtime)
bun run braincode -- run --dry-run "<prompt>"     # aperçu du plan routeBrain
bun run braincode -- run --dry-run --heuristic "<prompt>" # diagnostic sans provider
bun run braincode -- run "<prompt>"               # exécution réelle
bun run braincode                                  # Ink TUI
bun run config                                     # interface configuration navigateur
```

Les tests vivent à côté de la source : `packages/<name>/src/index.test.ts`. Gardez la nouvelle logique près du paquet auquel elle appartient ; résistez à l'envie de faire grossir `packages/shared`.

## Où aller ensuite

- Vous travaillez sur le routage ou les rôles ? Commencez par [agent-communication.fr.md](./agent-communication.fr.md), puis `packages/brain`.
- Vous touchez quelque chose qui traverse les agents ? Lisez [context-management.fr.md](./context-management.fr.md) avant d'éditer les prompts.
- Vous remodelez l'infrastructure ou les paquets ? Voir [project-structure.md](./project-structure.md) pour la disposition prévue et les non-objectifs.
