# Getting Started with Vitte Language Support

This guide describes the prerequisites, installation workflow, and validation steps for the Vitte Language Support extension in Visual Studio Code.

## Prerequisites

- Visual Studio Code version **1.93.0** or later.
- Vitte/Vitl toolchain binaries available on your `PATH`:
  - `vitlc` — compiler.
  - `vitlv` — runtime/virtual machine.
- A workspace that includes at least one Vitte source file (`.vitte`, `.vit`, or `.vitl`).

> ℹ️ Tip: Pin the **Vitte ▸ Diagnostics** and **Vitte ▸ Structure** views in the Activity Bar to monitor real-time diagnostics and module topology while you work.

## Installation

1. Install the extension from the Visual Studio Code Marketplace (search for **Vitte Language Support**) or run:
   ```bash
   code --install-extension VitteStudio.vitte-studio
   ```
2. Reload Visual Studio Code when prompted so the language server can initialize against your workspace.

To install from a locally built VSIX:

```bash
vsce package
code --install-extension vitte-studio-<version>.vsix
```

## Initial Verification

1. Open any Vitte/Vitl source file; the extension activates automatically.
2. Confirm that syntax highlighting, code snippets, hover information, and diagnostics are available.
3. Observe the status bar item `$(rocket) Vitte`:
   - `$(gear)` indicates the server is starting.
   - `$(check)` confirms an active connection.
   - `$(pass-filled)` denotes a clean diagnostics pass, while `$(warning)` or `$(error)` signal outstanding issues.
   - `$(debug-stop)` appears if the client stops unexpectedly; review the output channel for details.
4. Browse the **Vitte ▸ Structure** view to inspect modules, structs, and functions annotated with diagnostics badges.
5. Use command palette shortcuts (`⇧⌘P`) such as `Vitte: Restart Server`, `Vitte: Show Info`, or `Vitte: Show Server Log` for routine maintenance.

## Running the Debugger

Launch configurations for `vitl` targets are generated automatically. To debug:

1. Set a breakpoint in the active `.vitl` document.
2. Press **F5** (Vitl: Launch current file) or select another configuration from the Run and Debug view.
3. Step through code, inspect scopes, and review the call stack as you would in any Visual Studio Code debugging session.

Define reusable launch recipes in `.vscode/launch.json` when you need additional control:

```json
{
  "type": "vitl",
  "request": "launch",
  "name": "Vitl: Launch current file",
  "program": "${file}",
  "cwd": "${workspaceFolder}",
  "stopOnEntry": true
}
```

Refer to the [`examples/`](../examples) directory for sample configurations.

## Troubleshooting

- **Language server does not start**: Run `Vitte: Show Server Log` to verify the resolved server path. Override the default via `vitte.serverPath` when bundling a custom binary.
- **Diagnostics do not appear**: Ensure the workspace is trusted and files use a supported Vitte/Vitl extension.
- **macOS blocks tests or debugger**: Clear the quarantine flag from the Visual Studio Code test host with `xattr -dr com.apple.quarantine <Visual Studio Code.app>`.

If additional assistance is required, please open an issue on [GitHub](https://github.com/roussov/vittelang-vscode/issues).
