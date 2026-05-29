# @taotao7/braincode

Coding-first AI agent with user-selectable Brain Model that routes sub-tasks to different LLMs.

## Install

```bash
npm i -g @taotao7/braincode
```

A `postinstall` step downloads the platform-specific binary from the matching GitHub release. Supported platforms: macOS arm64/x64, Linux x64/arm64.

## Release

`0.2.5` upgrades the TUI to Ink 7/React 19 and renders assistant/help Markdown in the terminal. The npm package version must match the GitHub release tag because `postinstall` downloads assets from `v<version>`.

## Usage

```bash
braincode          # interactive TUI
braincode config   # open browser configuration
braincode run "..." # one-shot task
braincode benchmark # representative coding-task plan benchmark
braincode help
```

## Sources

- Repository: <https://github.com/taotao7/braincode>
- Issues: <https://github.com/taotao7/braincode/issues>
- Releases: <https://github.com/taotao7/braincode/releases>
