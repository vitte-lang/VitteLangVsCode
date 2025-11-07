# Vitte Language Support for VS Code

[![Marketplace](https://img.shields.io/badge/VS%20Code-Install-blue)](https://marketplace.visualstudio.com/manage)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![VS Code Engine](https://img.shields.io/badge/engine-%5E1.105.0-lightgrey)
![VS Code Version](https://img.shields.io/visual-studio-marketplace/v/VitteStudio.vitte-studio?label=VS%20Code)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Professional tooling for the Vitte/Vitl language family: language server, debugger, diagnostics view, snippets, and icon theme—packaged as a single Visual Studio Code extension.

---

## Overview

- ✅ **Languages**: `vitte`, `vit`, `vitl`
- 🎨 **Syntax & semantic highlighting** via TextMate grammar and semantic tokens
- 🧠 **Language Server**: workspace-aware completion, hover, go to definition, document symbols, diagnostics, workspace watchers
- 🛠️ **Debugging**: Vitl launch/attach configurations, breakpoints, watch expressions, call stack
- 📊 **Diagnostics view**: Activity Bar panel with filter, refresh, and quick navigation
- 🗂️ **Tooling integration**: file watchers for `vitte.toml`, `.vitteconfig`, `vitl.toml`, `.vitlconfig`
- 🧭 **Module Explorer**: browse modules, structs, and functions with per-module diagnostics health
- ✅ **Real-time health indicator**: status bar dot turns green when the workspace is clean and highlights warnings/errors instantly

See the [Getting Started guide](docs/getting-started.md) for a hands-on walkthrough.

---

## Feature Highlights

| Area | Highlights |
| ---- | ---------- |
| Editing | Rich language configuration, snippets for common constructs (`async fn`, `switch/case`, `try/catch/finally`, `defer`, `unsafe`, `with`) |
| Language Server | Automatic restart, workspace completions (modules, symbols), telemetry log channel, configurable trace level, semantic diagnostics |
| Debugging | Ready-to-use Vitl launch/attach recipes, breakpoint management, multi-config compounds |
| Structure | Module Explorer view listing modules/structs/functions with per-entry diagnostics summaries |
| Observability | Status bar health indicator, diagnostics dashboard, quick restart, detailed server logging |
| Reliability | File system watchers for config changes, graceful server restarts, fallback server resolution with detailed logging |

---

## Installation

### Marketplace

Search for **“Vitte Language Support”** in VS Code or install via CLI:

```bash
code --install-extension VitteStudio.vitte-studio
```

### Manual (VSIX)

```bash
vsce package
code --install-extension vitte-studio-<version>.vsix
```

> Requires VS Code **1.93.0+**, Node.js 18+, and the Vitte/Vitl toolchain (`vitlc`, `vitlv`) accessible via `PATH`.

---

## Quick Start

1. Open a workspace containing `.vitte`, `.vit`, or `.vitl` files.
2. Watch the status bar item `$(rocket) Vitte`; when it turns to `$(check)` and shows `$(pass-filled)`, the server is running and diagnostics are clean.
3. Use `Vitte: Show Server Log` to inspect language server activity.
4. Press **F5** to launch the default *Vitl: Launch current file* debug configuration.
5. Open the **Vitte ▸ Diagnostics** view (Activity Bar) to triage warnings/errors.

---

## Debugging Workflows

- **Launch current file**: Press **F5** or select *Vitl: Launch current file* in **Run and Debug**.
- **Launch with arguments**: Add a configuration that passes CLI flags and environment variables.
- **Attach to a running VM**: Use *Vitl: Attach to running VM* (default host `127.0.0.1`, port `6009`).
- **Compound sessions**: Combine launch + attach to orchestrate tooling.

View complete launch samples in [`docs/getting-started.md`](docs/getting-started.md#running-the-debugger).

---

## Commands & Keybindings

| Command | Title | Default keybinding |
| ------- | ----- | ------------------ |
| `vitte.showServerLog` | Vitte: Show Server Log | — |
| `vitte.restartServer` | Vitte: Restart Server | `Ctrl+Shift+R` (Win/Linux) / `⌃⇧R` (macOS) |
| `vitte.runAction` | Vitte: Run Action | — |
| `vitte.runActionWithArgs` | Vitte: Run Action (Args) | — |
| `vitte.organizeImports` | Vitte: Organize Imports | — |
| `vitte.fixAll` | Vitte: Fix All | — |
| `vitte.debug.runFile` | Vitte Debug: Run File | — |
| `vitte.debug.attachServer` | Vitte Debug: Attach | — |
| `vitte.modules.refresh` | Vitte: Rafraîchir la structure | — |

All commands are discoverable from the Command Palette (`⇧⌘P` / `Ctrl+Shift+P`).

---

## Settings

- Core
  - `vitte.trace.server` (default: `"off"`) — Language server trace level (`off`, `messages`, `verbose`).
  - `vitte.serverPath` (default: `""`) — Absolute path to a custom LSP server binary. Leave empty to use the bundled server.

- Formatting (`vitte.formatting.*`) — used by the language server for document/range formatting
  - `vitte.formatting.tabSize` (default: `2`) — Indentation size in spaces (1..16).
  - `vitte.formatting.insertSpaces` (default: `true`) — Use spaces instead of tabs.
  - `vitte.formatting.trimTrailingWhitespace` (default: `true`) — Remove trailing spaces at end of lines.
  - `vitte.formatting.insertFinalNewline` (default: `true`) — Ensure a final newline at end of file.
  - `vitte.formatting.eol` (default: `"lf"`) — End‑of‑line policy: `lf`, `crlf`, or `auto`.
  - `vitte.formatting.detectMixedIndentation` (default: `true`) — Heuristic to normalize mixed tabs/spaces to the dominant style.

Example (User or Workspace settings):

```jsonc
{
  "vitte.formatting": {
    "tabSize": 4,
    "insertSpaces": true,
    "trimTrailingWhitespace": true,
    "insertFinalNewline": true,
    "eol": "lf",
    "detectMixedIndentation": true
  }
}
```

Tips:
- Use “Vitte: Format Document” or the standard “Format Document” command; both call the same LSP formatter.
- You can also format a selection via “Format Selection”.

---

## Diagnostics & Observability

- **Status bar health** reflects lifecycle states and diagnostics: starting (`$(gear)`), running (`$(check)`), stopped (`$(debug-stop)`), plus a green `$(pass-filled)` badge when the workspace is clean (warning/error icons otherwise).
- **Output channel** (Vitte Language Server) logs telemetry, status updates, and manual restart traces.
- **Diagnostics View** (`Vitte ▸ Diagnostics`) aggregates LSP diagnostics with filtering and quick navigation.

---

## Module Explorer

- The **Vitte ▸ Structure** view (Activity Bar) presents modules, structs, enums, and functions grouped by module/file.
- Each node carries a live diagnostics badge (green, warning, or error) so you can spot problematic areas instantly.
- Selecting an item jumps directly to the symbol definition with the appropriate editor reveal.

---

## Documentation & Support

- [Getting Started](docs/getting-started.md)
- Examples: [`examples/`](examples)
- Issue tracker: <https://github.com/roussov/vittelang-vscode/issues>

---

## Development

```bash
npm install
npm run build
npm test          # builds + runs VS Code integration suite
npm run lint      # lint TypeScript sources
npm run watch     # incremental builds
```

To publish a VSIX:

```bash
npm run package
```

The repository includes a full LSP implementation under `server/`, shared client utilities in `src/`, and integration tests in `src/test`.

---

## Licence

Released under the [MIT Licence](LICENSE).
