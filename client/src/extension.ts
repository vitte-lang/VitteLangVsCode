import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient | undefined;

function resolveServerOptions(ctx: vscode.ExtensionContext): ServerOptions {
  const envPath = process.env.VITTE_LSP_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return { command: envPath, args: [], options: { env: process.env } };
  }
  const serverJs = ctx.asAbsolutePath(path.join("server", "out", "server.js"));
  const inspect = process.env.VITTE_LSP_INSPECT;
  const debugExecArgv = inspect ? ["--nolazy", `--inspect=${inspect}`] : [];
  return {
    run:   { module: serverJs, transport: TransportKind.ipc, options: { env: process.env } },
    debug: { module: serverJs, transport: TransportKind.ipc, options: { execArgv: debugExecArgv, env: process.env } },
  };
}

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("Vitte LSP");
  const trace  = vscode.window.createOutputChannel("Vitte LSP Trace");
  output.appendLine("[vitte] Activation du client LSP…");

  const serverOptions = resolveServerOptions(context);
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "vitte", scheme: "file" }, { language: "vitte", scheme: "untitled" }],
    synchronize: {
      configurationSection: "vitte",
      fileEvents: [
        vscode.workspace.createFileSystemWatcher("**/.vitteconfig"),
        vscode.workspace.createFileSystemWatcher("**/vitte.toml"),
      ],
    },
    initializationOptions: { telemetry: true },
    outputChannel: output,
    traceOutputChannel: trace
  };

  client = new LanguageClient("vitteLanguageServer", "Vitte Language Server", serverOptions, clientOptions);
  context.subscriptions.push({ dispose: () => { void client?.stop(); } }, output, trace);

  try {
    await client.start();
    output.appendLine("[vitte] Client LSP démarré ✅");
  } catch (err) {
    const msg = `[vitte] Échec de démarrage du client LSP: ${String(err)}`;
    output.appendLine(msg);
    void vscode.window.showErrorMessage(msg);
    throw err;
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("vitte")) {
        output.appendLine("[vitte] Configuration modifiée → notification serveur");
        await client?.sendNotification("workspace/didChangeConfiguration", {
          settings: vscode.workspace.getConfiguration("vitte"),
        });
      }
    })
  );
}

export async function deactivate(): Promise<void> { await client?.stop(); }
