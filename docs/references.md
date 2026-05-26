# References

Use this document for external references and design notes that inform Braincode.

## Agent design

- Amp note: `https://ampcode.com/notes/how-to-build-an-agent`
  - Agent loop: model + system prompt + tools.
  - Tool calls are executed locally and returned to the model as tool results.

## Context management

- Amp guide: `https://ampcode.com/guides/context-management`
  - Context windows are a primary design constraint.
  - Handoff creates a fresh context from a distilled message.
  - Referencing other threads should pull only the relevant information, not the entire history.

## Pi infrastructure

- Pi repository: `https://github.com/earendil-works/pi`
  - Use `@earendil-works/pi-ai` for normalized LLM provider/model streaming.
  - Use `@earendil-works/pi-agent-core` for agent runtime, tool calling, sessions, and compaction where it fits.
  - Do not use Pi's TUI as the Braincode product interface; Braincode owns its Ink TUI and its routing/model-selection semantics.
  - Do not fork Pi unless there is no viable public API or integration point.
