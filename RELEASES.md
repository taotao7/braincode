# Release Notes

## v0.2.6

- Image Maker routing now uses a dedicated OpenAI-compatible Images API policy instead of adding image-generation models to the normal text-model catalog.
- Image-input routing is stricter: attached images require routeBrain planning and vision-capable text role chains, while Image Maker is reserved for generation or editing requests.
- Config Web combines catalog, saved-provider, provider `/models`, and manual model setup into one add-model flow, including Anthropic-compatible model listing.
- Provider context budgeting now omits inline image payload bytes from budget estimates while preserving metadata, reducing false context-overflow failures on image prompts.
- The npm wrapper and release metadata are versioned as `0.2.6` for the matching GitHub release assets.

## v0.2.5

- The TUI now runs on Ink 7 and React 19, and assistant/help transcript rows render Markdown through `markdansi`, so headings, lists, inline code, code blocks, and tables no longer appear as raw Markdown.
- Runtime and frontend dependencies were refreshed, including Pi packages `0.77.0`, Vite `8.0.14`, React Router `7.16.0`, and TypeBox `1.1.39`.
- The npm wrapper and release metadata are versioned as `0.2.5` for the matching GitHub release assets.

## v0.2.4

- `read_file` now automatically expands tiny `limit` windows for large files and returns structured `nextOffset` metadata, reducing runaway page-by-page reads that bloat the transcript and provider context.

## v0.2.3

- Config Web UI is organized into tabs with the Models tab first. The usage tab shows token statistics by model, role, and runtime phase, including Recharts charts and click-through detail filters.
- Authenticated subscription providers from Pi OAuth, including Claude Pro/Max, ChatGPT Plus/Pro Codex, and GitHub Copilot, can be selected from the model catalog without re-entering an API key.
- TUI running status has its own one-second clock, so elapsed time keeps moving even when no token or tool event arrives.
- TUI running status now has a lightweight text animation: the activity prefix cycles and the active status label highlights one character at a time.
- TUI transcript folding is keyboard-driven with `Ctrl+T`, which toggles foldable transcript rows between expanded and collapsed. Tool calls stay concise by default and move args/result details behind the folded row. Mouse capture is only used for wheel scrolling and can be disabled with `BRAINCODE_TUI_MOUSE=false`.
- Provider message-size failures are surfaced as a Braincode handoff boundary. The TUI prompts `/handoff` so the user can continue from a compact `@@session` packet instead of silently compressing the active transcript.
- The read-only evidence cache now resets cached entries and duplicate counters after write/execute tools, reducing stale duplicate-read warnings after files or command output change.
- The npm wrapper and release metadata are versioned as `0.2.3` for the matching GitHub release assets.

## v0.2.2

- TUI transcript folding moved off row clicks and onto `Ctrl+T`, so transcript selection and folding no longer compete for mouse clicks.
- TUI transcript rendering now uses an internal viewport with Up/Down when input is empty, PageUp/PageDown, Ctrl+Up/Ctrl+Down, and mouse-wheel history scrolling, so streaming output no longer forces the whole terminal scrollback to repaint. Prompt history is available with Ctrl+P/Ctrl+N.
- BrainPet now lives in the bottom-right footer with stable low-refresh rendering by default, and reports context-aware progress with short dry asides when available. Set `BRAINCODE_TUI_ANIMATIONS=true` to re-enable its animation.
- The npm wrapper and release metadata are versioned as `0.2.2` for the matching GitHub release assets.
