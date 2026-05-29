# Communication entre agents

**Langues** : [English](./agent-communication.md) · [中文](./agent-communication.zh.md) · [Français](./agent-communication.fr.md)

Ce document explique comment l'orchestrateur Braincode (Brain) parle aux agents workers et comment les workers répondent. Si vous câblez un nouveau rôle, changez la façon dont un worker est invoqué, ajoutez un événement runtime, ou concevez une UI qui doit observer une exécution — commencez ici.

Le document compagnon est [context-management.fr.md](./context-management.fr.md), qui couvre quelle *information* traverse ces frontières. Ce document couvre le *protocole* par lequel elle les traverse.

## Topologie

Braincode n'est intentionnellement pas un maillage pair-à-pair d'agents. Toute conversation passe par Brain :

```
                       +-----------------+
                       |    Brain        |
                       | (orchestrateur) |
                       +--------+--------+
                                |
              HandoffPacket   <-+->  WorkerResult
                                |
        +-----------+-----------+-----------+-----------+
        |           |           |           |           |
   support#1   support#2   support#3      ...        review
   (agent     (agent      (agent                    (isolé,
    isolé)    isolé)      isolé)                     s'exécute après
                                                     le primaire)
```

- Les workers ne se parlent pas entre eux.
- Les workers ne voient pas la conversation de Brain.
- Brain est le seul fusionneur de résultats structurés.
- « Primaire » est le worker routé que le plan a élu pour produire la réponse face utilisateur ; review (quand requis) est un worker séparé qui voit le résumé du primaire.

Ceci est imposé non par l'infrastructure mais par *ce que les prompts contiennent* — chaque worker reçoit un handoff auto-contenu et la requête utilisateur originale, rien de plus.

## Vocabulaire filaire

Les formes partagées vivent dans deux paquets.

`packages/protocol/src/index.ts` — le vocabulaire inter-processus / inter-paquet :

```ts
export type ContextRef = {
  kind: "file" | "thread" | "summary" | "artifact"
  uri: string
  label?: string
}

export type AgentMessage = {
  id: string
  parentId?: string
  from: string
  to: string | "orchestrator"
  kind: "handoff" | "result" | "question" | "fact" | "artifact" | "error"
  payload: unknown
  contextRefs?: ContextRef[]
}
```

`AgentMessage` est l'**enveloppe extérieure** pour toute communication qui doit être adressée/routée. L'orchestrateur in-process actuel n'a pas encore sérialisé chaque étape via `AgentMessage` — il passe `HandoffPacket` / `WorkerResult` directement — mais tout ce qui finira par traverser une frontière de processus (un futur runtime de worker distant, un setup multi-machine, un client externe) devrait emballer sa payload dans `AgentMessage` pour qu'on garde une enveloppe canonique.

`packages/context/src/index.ts` — les payloads concrets utilisés aujourd'hui :

```ts
HandoffPacket = BrainToAgentContextTransfer & {
  id: string
  task: AgentTaskContext
  constraints: string[]
  expectedResult: string
}

WorkerResult = AgentToBrainContextTransfer & {
  handoffId: string
  taskId: string
  parentId: string
  progress: TaskProgress
  summary: string
  artifacts: ContextRef[]
  risks: string[]
  nextQuestions: string[]
}
```

Correspondance entre les deux :

| `AgentMessage.kind` | Payload d'aujourd'hui | Notes |
|---------------------|------------------------|-------|
| `handoff` | `HandoffPacket` | Brain → worker, démarre une exécution worker. |
| `result` | `WorkerResult` | worker → Brain, renvoie la sortie structurée. |
| `error` | `WorkerResult` avec `progress.status = "failed"` | Les échecs sont renvoyés comme résultats, pas comme exceptions, pour que le fusionneur puisse les rendre. |
| `question`, `fact`, `artifact` | réservés | Pas encore utilisés. Quand introduits, ils devraient utiliser la même enveloppe et respecter la direction. |

## Cycle de vie d'un worker

`runWorkerFromPlan` dans `packages/agent-runtime/src/index.ts` est le pilote canonique du worker. La forme qu'il implémente :

```
plan un worker  -->  createWorkerHandoff(worker, parentId, phase)
                        |
                        v
hook SubagentStart   (peut ajouter du contexte, peut bloquer)
                        |
                        v
selectRuntimeModelCandidatesWithApiKey(policy)   <-- liste ordonnée depuis model-selection.ts
                        |
                        v
pour chaque candidat (jusqu'à ce que l'un réussisse) :
    nouveau Pi Agent (session fraîche, historique de prompt frais)
    prompt = buildSupportWorkerPrompt | buildReviewPrompt
    runtime.agent.prompt(prompt)
    text = dernier message assistant
    result = normalizeWorkerResultText(text, handoff)
                        |
                        v
hook SubagentStop (en cas de succès)
                        |
                        v
appendSessionRecord("worker_end", ...)
emit WorkerLifecycleEvent("worker_end", "completed")
return ExecutedWorkerResult
```

Chemin d'échec : chaque échec de candidat enregistre `worker_error`, et la boucle essaie le candidat suivant. Si tous les candidats échouent, `failedWorkerResult` produit un `ExecutedWorkerResult` avec `progress.status = "failed"` et `risks: [errorMessage]` — exposé à l'utilisateur de la même façon que n'importe quel autre résultat.

`ExecutedWorkerResult` est `WorkerResult` plus trois champs runtime-only (`role`, `goal`, `status`, optionnel `error`). Ils n'entrent jamais *dans* un worker ; ils n'existent que côté fusion.

## Comment une exécution est composée

`executePromptFromConfig` est l'orchestrateur de bout en bout. Sa forme haut niveau :

```
1. Exécuter les hooks SessionStart + UserPromptSubmit (chacun peut bloquer, les deux peuvent ajouter du contexte).
2. expandPromptReferences :   résoudre @<file>, @@<session> -> sections ajoutées.
3. buildRuntimePlan :         routage heuristique, puis raffinement par le router brain.
   - Quand des rôles forcés --team sont fournis, plan.workers est surchargé.
4. runSupportWorkers (parallèle, plafonné par brain.routing.maxParallelAgents) :
   - Chaque worker est indépendant. Aucun worker ne voit le handoff ou la conversation d'un autre.
5. Connecter les serveurs MCP via McpToolHub -> l'agent primaire obtient les outils MCP.
6. Essayer chaque candidat modèle pour le rôle primaire :
     buildPrimaryPrompt(requête_utilisateur, workerResults, primaryRole, projectSupport)
     runtime.agent.prompt(...)
     primarySummary = dernier texte assistant
7. Si plan.requiresReview && primary !== "review" :
     runWorkerFromPlan(reviewWorker, buildReviewPrompt(...), phase="review")
     mergeReviewResult ajoute résumé review + risques à primarySummary.
8. Exécuter hook Stop. Ajouter run_end. Retourner { sessionId, summary, plan, workerResults, mcp }.
```

Notes à intérioriser avant de changer ce code :

- **Les workers de support et le primaire ne sont pas le même genre d'appel.** Les workers de support renvoient un `WorkerResult` normalisé. Le primaire renvoie du texte assistant libre montré à l'utilisateur. Les confondre casse le contrat des deux côtés.
- **Review est post-primaire, pas parallèle.** Review a besoin de la sortie du primaire pour faire son travail.
- **Le chemin rôles forcés (`/team`) saute review** en fixant `requiresReview = false`. C'est intentionnel — le mode team est pour des réponses multi-agents indépendantes, pas un workflow.

## Routage : heuristique + router brain

Deux routeurs coopèrent pour produire un `AgentRoutingPlan` :

- `planAgentRouting(prompt, brain)` dans `packages/brain` — classificateur déterministe regex/mots-clés. Utilisé pour les diagnostics heuristic, le fallback et comme base que le router brain raffine.
- `routePromptWithBrain(prompt, brain, models, mode, fallback, home)` dans `agent-runtime` — appelle le modèle `planner` / `roles.routeBrain` du brain avec un prompt JSON strict et parse le résultat. `normalizeRouterDecision` valide et plafonne le choix contre le fallback heuristique et `brain.routing.maxParallelAgents`.

Les deux chemins se normalisent vers la même forme :

```ts
type AgentRoutingPlan = {
  primaryRole: RoutedAgentRole
  workers: AgentWorkerPlan[]    // { role, goal, reason }
  requiresReview: boolean
  reason: string
}
```

`buildRuntimePlan` étend ensuite chaque `AgentWorkerPlan` en un `RuntimeWorkerPlan` en résolvant son modèle + résumé Pi model via `createRuntimeWorkerPlan`. Le `RuntimePlan` final est ce que consomme le reste de l'orchestrateur.

Si vous ajoutez un nouveau rôle :

1. Ajoutez-le à `routedAgentRoles` et à `BrainModel.roles`.
2. Ajoutez un profil dans `agentRoleProfiles` et un prompt système dans `agentRoleSystemPrompts`.
3. Ajoutez un `RoleSignal` à `roleSignals` pour que le chemin heuristique puisse le sélectionner.
4. Mettez à jour l'enum de prompt router-brain dans `routePromptWithBrain` (le schéma JSON liste les rôles autorisés en ligne — gardez en sync).

L'enum de prompt router-brain est le seul endroit avec duplication de chaînes ; le reste est une seule union TypeScript.

## Prompts envoyés à un worker

Trois constructeurs façonnent chaque prompt worker :

- `buildSupportWorkerPrompt(originalPrompt, handoff, projectSupport)` — utilisé pour les workers de support parallèles. Contenu : section support projet, requête utilisateur originale, `HandoffPacket` complet en JSON, et la forme JSON de réponse attendue (avec `taskId` / `parentId` pré-remplis pour forcer l'écho).
- `buildPrimaryPrompt(originalPrompt, workerResults, primaryRole, projectSupport)` — utilisé pour l'agent primaire. Contenu : section support projet, requête utilisateur originale, résumés workers formatés, et une directive : « traitez les résultats workers comme contexte consultatif, résolvez les conflits explicitement ».
- `buildReviewPrompt(originalPrompt, primarySummary, workerResults, handoff, projectSupport)` — utilisé pour le worker review. Contenu : section support projet, requête utilisateur originale, résumé primaire, résumés workers, handoff packet review, forme JSON de réponse attendue.

`formatWorkerResults` est le formateur partagé pour le bloc de résumés workers. Chaque entrée est :

```
### <role> (<status>)
Task: <taskId> -> <parentId>
Goal: <goal>
Progress: <status>: <summary>
Summary: <summary>
Risks:
- ...
Open questions:
- ...
```

Si vous avez besoin d'une nouvelle façon de présenter les résultats, étendez le formateur — ne passez pas l'`ExecutedWorkerResult[]` brut dans un prompt ailleurs.

## Fiabilité : fallback modèle + provider

Chaque worker (et le primaire) tire une liste ordonnée de candidats depuis `selectRuntimeModelCandidatesWithApiKey` dans `packages/agent-runtime/src/model-selection.ts` :

1. Le `modelId` de la politique, puis `fallbackModelIds`, dans l'ordre.

Le runtime ne scanne pas `models.json` comme pool de fallback global. Les fallbacks doivent être explicites dans les politiques planner / rôles du Brain Model sélectionné, afin que l'exécution reste dans la stratégie de routage configurée par l'utilisateur.

Si l'expansion du prompt a attaché des images, ce même chemin de candidats est appelé avec `requiresVision: true`. C'est une contrainte runtime stricte pour le router brain, les support workers, l'agent primaire et le worker de review : les modèles texte seuls sont ignorés avant tout appel provider. routeBrain doit choisir des rôles dont la propre chaîne de policy contient un candidat vision ; le runtime échoue avec l'erreur router/model au lieu de rattacher ce rôle au modèle planner.

Quand vous étendez la politique ou ajoutez un champ modèle, assurez-vous que la liste explicite primary / fallback le respecte.

## Hooks : le tiers dans chaque conversation

Les hooks sont la trappe d'évasion du projet pour l'observabilité et la politique. Ils s'exécutent à cinq points de cycle de vie aujourd'hui :

| Événement | Quand | Peut bloquer ? | Ajoute du contexte ? |
|-----------|-------|----------------|----------------------|
| `SessionStart` | avant toute expansion de prompt | oui (toute l'exécution) | oui |
| `UserPromptSubmit` | après expansion, avant plan | oui (prompt) | oui |
| `SubagentStart` | avant le prompt de chaque worker | oui (exécution worker seulement) | oui |
| `SubagentStop` | après le succès de chaque worker | non | non |
| `Stop` | après primaire + review | non | oui (ajouté comme feedback) |

`runConfiguredHooks` exécute chaque handler qui matche en parallèle. Stdout est parsé (`parseHookOutput`) — JSON l'emporte ; le texte brut devient contexte additionnel uniquement pour `SessionStart` / `SubagentStart` / `UserPromptSubmit`. Les handlers doivent déclarer `trusted: true` jusqu'à ce qu'une UI de revue existe.

La sortie des hooks est enregistrée dans le JSONL de session (`hook_session_start`, `hook_user_prompt_submit`, `hook_subagent_start`, `hook_subagent_stop`, `hook_stop`). Quand un hook bloque, l'orchestrateur lance avec la raison de blocage plutôt que de continuer silencieusement.

Si vous déboguez un mystère « pourquoi ce prompt n'a-t-il pas tourné » — vérifiez les hooks d'abord.

## Événements runtime pour l'UI

La TUI (`apps/cli`) pilote le footer BrainPet en bas à droite et l'affichage de progression live depuis deux flux d'événements :

- **`AgentEvent`** depuis `@earendil-works/pi-agent-core` — flux de tokens, appels d'outils, résultats d'outils, etc. Abonné via `agent.subscribe(...)`. `BraincodeAgentRuntimeOptions.onEvent` est le hook que la TUI utilise pour les transmettre au rendu.
- **`WorkerLifecycleEvent`** depuis `agent-runtime` — frontières worker niveau Braincode :

```ts
type WorkerLifecycleEvent =
  | { type: "worker_start"; role: RoutedAgentRole; goal: string;
      phase: "support" | "review"; modelId: string }
  | { type: "worker_end";   role: RoutedAgentRole;
      phase: "support" | "review";
      status: "completed" | "failed"; summary?: string; error?: string }
```

Les workers émettent `worker_start` après que les hooks `SubagentStart` se soient stabilisés et `worker_end` après que le résultat soit normalisé. La CLI les utilise pour peupler les fragments de progression BrainPet et piloter la liste des tâches en file. BrainPet reste une UI en lecture seule : il peut résumer le contexte visible ou ajouter un court aparté, mais il ne modifie ni le routage ni l'exécution.

- **Vue Intent graph** dans la TUI — `Ctrl+O` ou `/intent` ouvre la décomposition de tâche et le chemin de dépendances du dernier `RuntimePlan`, avec source de routage, confiance, raison, workers et budgets de mode.
- **Aperçu router plan** dans la TUI — `/plan <task>` interroge le `routeBrain` configuré par défaut ; `/plan --heuristic <task>` est réservé au diagnostic déterministe sans provider. Les échecs router sont affichés comme fallback heuristic dans `RuntimePlan.routing`.

Quand vous ajoutez un nouveau moment de cycle de vie que l'UI doit connaître, préférez étendre `WorkerLifecycleEvent` plutôt que de laisser fuir un nouveau callback à travers `AgentRunRequest`. Un seul flux typé est plus facile à rendre que cinq callbacks.

## Exécutions multi-agents : `/team` et le chemin rôles forcés

`/team` permet à l'utilisateur d'éclater un seul prompt vers plusieurs rôles spécialistes indépendamment. Le code de construction du plan (`buildRuntimePlan`) prend un `forceRoles?: RoutedAgentRole[]` depuis `AgentRunRequest.forceRoles`. Quand fourni :

- Le routage saute le router brain.
- Chaque rôle forcé devient un worker.
- Le premier rôle forcé est le primaire.
- `requiresReview` est forcé à `false`.
- Le but de chaque worker est « Répondez indépendamment en tant qu'agent <role>. »

Comme chaque worker reste isolé, les sorties `/team` sont de véritables perspectives indépendantes — pas un débat. Si vous voulez un flux de débat plus tard, construisez-le comme un nouveau rôle (par ex. `moderator`) qui s'exécute après les workers éclatés et consomme leurs `WorkerResult`.

## Pourquoi on ne laisse pas les workers se messager entre eux

Il est tentant de laisser deux workers échanger une question rapide sans passer par Brain. On ne le fait pas, pour trois raisons :

1. **Budget contexte.** Le bavardage A↔B direct se compose rapidement. Le modèle actuel — Brain choisit la question suivante et re-handoff — borne le pire cas.
2. **Surface d'échec.** Brain possède retry/fallback. Si A pouvait appeler B directement, un échec de B devient une exception de A, et on perd le résultat structuré `failed` que le fusionneur attend.
3. **Replay/audit.** Le JSONL de session est la source de vérité. Chaque échange Brain↔worker est enregistré. Les messages side-channel devraient être enregistrés ailleurs, et l'histoire montre que les canaux secondaires ne restent pas longtemps enregistrés.

Si vous avez besoin d'une collaboration plus riche, ajoutez une étape de plan séquencée (worker A → Brain → worker B avec le `WorkerResult` de A dans le handoff), pas un lien pair.

## Ajouter un nouveau kind de message

Si vous avez vraiment besoin d'un nouveau kind de packet (par ex. un « poser une question de clarification à l'utilisateur » interactif) :

1. Décidez de sa direction. Étendez `BrainToAgentContextTransfer` ou `AgentToBrainContextTransfer`. Si aucun ne convient, le design est probablement faux.
2. Ajoutez le type de payload à `packages/context`.
3. Ajoutez la valeur `kind` à `AgentMessage.kind` dans `packages/protocol` s'il doit voyager sur le fil.
4. Ajoutez un constructeur + normaliseur dans `agent-runtime` (en miroir de `createWorkerHandoff` / `normalizeWorkerResultText`).
5. Ajoutez un type d'enregistrement au JSONL de session pour que replay/`@@` continuent à fonctionner.
6. Si l'UI doit l'observer, étendez `WorkerLifecycleEvent` (ou définissez un événement frère avec la même discipline de forme).

Les étapes 1–3 sont le contrat. Les étapes 4–6 sont comment le reste de Braincode reste cohérent avec lui.

## Où regarder

- Enveloppe : `packages/protocol/src/index.ts` — `AgentMessage`, `ContextRef`.
- Payloads : `packages/context/src/index.ts` — `HandoffPacket`, `WorkerResult`, contextes de tâche, constantes de direction.
- Pilote worker : `runWorkerFromPlan` dans `packages/agent-runtime/src/index.ts`.
- Composition du plan : `buildRuntimePlan`, `routePromptWithBrain`, `normalizeRouterDecision`.
- Constructeurs de prompt : `buildSupportWorkerPrompt`, `buildPrimaryPrompt`, `buildReviewPrompt`, `formatWorkerResults`.
- Fiabilité : `selectRuntimeModelCandidatesWithApiKey` dans `packages/agent-runtime/src/model-selection.ts`.
- Hooks : `runConfiguredHooks`, `runAndRecordHooks`, `parseHookOutput`.
- Événements UI : `WorkerLifecycleEvent`, `AgentRunRequest.onEvent` / `onWorkerEvent` / `onMcpReport`.
