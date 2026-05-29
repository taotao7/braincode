# Gestion du contexte

**Langues** : [English](./context-management.md) · [中文](./context-management.zh.md) · [Français](./context-management.fr.md)

Ce document est le guide contributeur pour le modèle de contexte de Braincode. Si vous éditez des prompts, ajoutez un rôle de worker, changez ce qui circule entre Brain et un sous-agent, ou touchez aux références de prompt — lisez ceci d'abord.

Version courte : **Brain possède le contexte d'orchestration. Chaque worker possède exactement un contexte de tâche isolé. Seuls les packets structurés traversent la frontière, jamais une conversation complète.** Tout le reste de ce document explique comment cet invariant est imposé et où il vit dans le code.

## Pourquoi l'isolation compte

Les conversations chat-style d'aujourd'hui croissent sans limite. Quand plusieurs agents travaillent sur la même tâche, copier toute la conversation dans chacun gaspille les tokens, fuit le raisonnement privé et emmêle les modes d'échec. Braincode considère plutôt l'orchestrateur et chaque worker comme des propriétaires de contexte distincts avec un protocole de packets typés entre eux. Le résultat :

- Les workers peuvent être des modèles bon marché sans être empoisonnés par du contexte non pertinent.
- L'orchestrateur peut exécuter, reprendre ou récupérer une session car chaque tâche a un id stable.
- Ajouter un rôle ne grossit pas le prompt partagé de tous les autres rôles.
- Le fallback modèle explicitement configuré dans un Brain Model est sûr car l'entrée du worker est auto-contenue.

## Deux couches, deux contextes de tâche

Définis dans `packages/context/src/index.ts` :

```ts
export type ContextLayer = "brain" | "agent"

export type BrainTaskContext = {
  id: string
  layer: "brain"
  goal: string
  progress: TaskProgress
  childContextIds: string[]
  contextRefs: ContextRef[]
}

export type AgentTaskContext = {
  id: string
  parentId: string            // pointe vers l'id de la tâche Brain
  layer: "agent"
  agentRole: string
  goal: string
  progress: TaskProgress
  contextRefs: ContextRef[]
}
```

- La **tâche Brain** est l'exécution. Elle porte le but utilisateur, la liste des id de tâches enfants et les références que Brain veut conserver (refs file/thread/summary/artifact sélectionnées). Il y en a exactement une par run.
- Une **tâche Agent** appartient à une invocation de worker. Elle a son propre id, un `parentId` vers la tâche Brain, le rôle, le but par-worker et sa propre progression. Les workers ne voient jamais le `AgentTaskContext` d'un autre worker.

Les id stables ne sont pas cosmétiques — c'est ainsi que le JSONL de session relie les événements, et c'est ainsi qu'une future fonctionnalité reprise/replay reconstruira qui a exécuté quoi.

## Étiquettes de direction

Tout packet qui traverse les couches porte `fromLayer` / `toLayer`. Les constantes existent pour que la direction d'un packet soit toujours explicite au niveau du type :

```ts
export const brainToAgentContextTransfer: BrainToAgentContextTransfer = {
  fromLayer: "brain", toLayer: "agent",
}
export const agentToBrainContextTransfer: AgentToBrainContextTransfer = {
  fromLayer: "agent", toLayer: "brain",
}
```

`HandoffPacket` étend `BrainToAgentContextTransfer`. `WorkerResult` étend `AgentToBrainContextTransfer`. Si vous vous surprenez à vouloir un packet qui circule agent-à-agent, vous contournez l'orchestrateur — c'est l'invariant à défendre.

## Les packets

```ts
export type HandoffPacket = BrainToAgentContextTransfer & {
  id: string                    // id du packet
  task: AgentTaskContext        // l'enveloppe de tâche du worker
  constraints: string[]         // règles dures incrustées dans le prompt
  expectedResult: string        // description de forme pour la réponse du worker
}

export type WorkerResult = AgentToBrainContextTransfer & {
  handoffId: string
  taskId: string
  parentId: string
  progress: TaskProgress
  summary: string               // court, orienté utilisateur
  artifacts: ContextRef[]       // refs file/thread/summary/artifact
  risks: string[]
  nextQuestions: string[]
}
```

`ContextRef` est partagé via `packages/protocol` :

```ts
export type ContextRef = {
  kind: "file" | "thread" | "summary" | "artifact"
  uri: string
  label?: string
}
```

Remarquez ce qui n'est *pas* dans `WorkerResult` : pas de conversation brute, pas de trace de raisonnement, pas de log d'appels d'outils. Ceux-ci appartiennent à la session isolée du worker et y restent. Si l'orchestrateur a besoin d'en savoir plus, il le demande dans le prochain handoff.

## Ce qui circule réellement pendant une exécution

L'orchestrateur est `executePromptFromConfig` dans `packages/agent-runtime/src/index.ts`. Les étapes pertinentes au contexte :

1. **Expansion du prompt** — `expandPromptReferences` réécrit les marqueurs `@<path>` et `@@<session-id>` en sections inlinées ajoutées au prompt. Les tokens originaux sont conservés pour que le modèle puisse y faire référence. Limites : 64 Ko par fichier, 24 Ko par instantané de session.
2. **Assemblage du support projet** — `readProjectSupport` collecte `AGENTS.md`, les métadonnées de `.mcp.json` et le contenu de `.agents/skill/*`. `formatProjectSupportPromptSection` formate ceci pour les prompts ; `projectSupportContextRefs` l'emballe en `ContextRef[]` pour les handoff packets.
3. **Construction du handoff worker** — `createWorkerHandoff` construit un `HandoffPacket` par worker, frappe un nouveau `task.id`, fixe `parentId` à l'id de session Brain, remplit `constraints` avec les règles d'isolation (voir ci-dessous), et fixe `expectedResult` à la forme JSON que le worker doit retourner.
4. **Exécution du worker** — `runWorkerFromPlan` crée un Pi `Agent` flambant neuf pour le worker. Son prompt est composé par `buildSupportWorkerPrompt` : section support projet + requête utilisateur originale + handoff packet (en JSON) + forme de réponse attendue. Le worker n'a aucun accès à l'état `Agent` de l'orchestrateur.
5. **Normalisation du résultat** — `normalizeWorkerResultText` parse la réponse du worker en `WorkerResult`. Si la réponse est du texte brut au lieu de JSON, elle est emballée dans un `WorkerResult` complété avec `summary` = le texte. C'est une résilience intentionnelle : la dérive provider ne doit pas casser l'orchestration.
6. **Prompt primaire** — `buildPrimaryPrompt` donne à l'agent primaire la requête utilisateur plus une liste formatée des résumés workers (rôle, statut, but, progression, summary, risques, questions ouvertes). Il *ne* donne *pas* à l'agent primaire les conversations brutes des workers.
7. **Review optionnelle** — si le plan exige une review et que le primaire n'est pas déjà le rôle review, `buildReviewPrompt` exécute un worker review avec le résumé du primaire, les résultats workers et un handoff packet frais.

La liste de contraintes incrustée dans chaque handoff de support (depuis `createWorkerHandoff`) est :

- Exécutez en tant que rôle assigné uniquement.
- Traitez le packet comme un transfert Brain-vers-agent ; Brain possède le contexte d'orchestration, le worker possède uniquement son contexte de tâche isolé.
- N'utilisez que ce handoff, la requête utilisateur originale et les résultats workers explicites fournis dans le prompt.
- Renvoyez `taskId` / `parentId` exactement comme fournis ; les valeurs Brain font autorité.
- Ne supposez pas l'accès à la conversation racine complète ou à la chaîne de pensée privée d'un autre worker.
- Renvoyez des conclusions structurées concises pour l'agent Braincode primaire.

Ces contraintes sont la manière dont l'invariant d'isolation survit à un modèle qui « veut » être bavard.

## Références de prompt : `@` et `@@`

L'orchestrateur supporte deux marqueurs de référence en tête de l'exécution :

- `@<path>` — attache un fichier ou une image au prompt racine. Les fichiers texte de moins de 64 Ko sont inlinés dans un bloc clôturé. Les images prises en charge sont envoyées comme entrées image et forcent la sélection runtime à n'utiliser que des candidats capables de vision. Les fichiers manquants ou trop gros deviennent une référence `missing` avec une raison au lieu d'une erreur, pour que le modèle sache que l'attachement était voulu mais non livré.
- `@@<session-id>` — attache un **instantané compact** d'une session précédente. Construit par `readSessionContext` dans `packages/config` depuis le JSONL de la session : prompt initial, résumé final, résumés workers, erreurs. Plafonné dur à 24 Ko au total, avec écrêtage par champ. **Il ne doit pas inliner une conversation complète ou un contexte privé de worker.**

Les workers n'obtiennent pas une copie séparée de ces références. Ils ne voient que la requête racine étendue plus leur propre handoff packet — même règle d'isolation.

Si vous ajoutez un nouveau type de référence, suivez la même discipline de compaction : un instantané, pas une conversation ; des pointeurs, pas des payloads.

## JSONL de session

`packages/config` écrit un JSONL par session à `~/.braincode/sessions/<id>.jsonl`. Chaque événement d'orchestration y est ajouté via `appendSessionRecord`. Les types d'enregistrement que vous verrez aujourd'hui :

| Type | Émis par | Ce qui est capturé |
|------|----------|---------------------|
| `run_start` | `executePromptFromConfig` | prompt, plan, résumé support projet, numéro de tentative |
| `run_end` | idem | résumé final + résultats workers |
| `run_error` | idem | message d'erreur, intention de réessai |
| `worker_start` | `runWorkerFromPlan` | phase, rôle, but, handoff, modèle, tentative |
| `worker_end` | idem | le `WorkerResult` exécuté |
| `worker_error` | idem | erreur, intention de fallback |
| `mcp_connect` | hub MCP | serveurs connectés/échoués/ignorés, nombre d'outils |
| `hook_*` | `runAndRecordHooks` | enregistrements de hook, contexte ajouté, raisons de blocage |

Le JSONL de session est la forme durable et requêtable de l'exécution en mémoire. `readSessionContext` est ce que `@@` lit. Tout ce que Brain veut rappeler plus tard doit se retrouver ici — pas dans les conversations des workers.

## Politique de compaction

Deux constantes dans `agent-runtime` gouvernent les budgets d'inline et doivent changer ensemble si vous les ajustez :

- `MAX_INLINE_FILE_BYTES = 64 * 1024` — par inline texte `@<path>`.
- `MAX_INLINE_SESSION_CHARS = 24 * 1024` — par instantané `@@<session-id>`.
- `MAX_SESSION_FIELD_CHARS = 6 * 1024` — par champ à l'intérieur d'un instantané.

Brain Model expose aussi une politique douce (`brain.context.maxInputTokens`, `compaction`, `isolation`). Aujourd'hui c'est consultatif — les limites dures runtime sont les budgets d'inline ci-dessus. Si vous implémentez une compaction automatique ou un mode `shared-facts` plus fort, faites-le passer par `packages/context` et gardez `WorkerResult` comme seule payload que l'orchestrateur fusionne.

## Règles d'or pour les contributeurs

- **Ajoutez un champ à un packet, pas une chaîne à un prompt.** Tout ce que Brain veut retenir doit être un champ typé sur `WorkerResult` ou un `ContextRef`, pas du texte libre coincé dans le résumé.
- **N'élargissez jamais ce qu'un worker voit.** Si un worker a besoin de plus, changez le handoff packet — ne déversez pas la conversation de Brain.
- **Renvoyez en écho, n'inventez pas.** Les prompts workers demandent au modèle de renvoyer `taskId` / `parentId`. Le normaliseur fait confiance aux valeurs du handoff, pas à la réponse du modèle. Gardez ça.
- **Les étiquettes de direction comptent.** Lors de l'introduction d'un nouveau packet, étendez l'un de `BrainToAgentContextTransfer` / `AgentToBrainContextTransfer`. Si vous ne pouvez pas choisir, le design est faux.
- **Le JSONL est l'enregistrement durable.** Les nouveaux événements d'orchestration doivent être ajoutés via `appendSessionRecord` pour que reprise/replay/`@@` continuent à fonctionner.
- **La compaction est un contrat public.** Si vous grossissez les limites d'inline, mettez à jour la constante et le doc ; un futur contributeur ne devrait pas avoir à deviner le budget en lisant le code.

## Où regarder

- Types de packet : `packages/context/src/index.ts`
- Vocabulaire filaire : `packages/protocol/src/index.ts`
- Câblage handoff + result : `createWorkerHandoff`, `runWorkerFromPlan`, `normalizeWorkerResultText` dans `packages/agent-runtime/src/index.ts`
- Assemblage de prompt : `buildSupportWorkerPrompt`, `buildPrimaryPrompt`, `buildReviewPrompt`, `formatWorkerResults`, `formatProjectSupportPromptSection`
- Références de prompt : `expandPromptReferences`, `formatSessionContext`
- Lecture/écriture session : `appendSessionRecord`, `readSessionContext` dans `packages/config/src/index.ts`
