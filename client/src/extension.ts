import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

function resolveServerOptions(ctx: vscode.ExtensionContext): ServerOptions {
  const envPath = process.env.VITTE_LSP_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return { command: envPath, args: [], options: { env: process.env } };
  }

  const serverJs = ctx.asAbsolutePath(path.join("server", "out", "server.js"));
  if (!fs.existsSync(serverJs)) {
    const msg = `[vitte/vitl] Introuvable: ${serverJs}. Lancez "npm run compile".`;
    void vscode.window.showErrorMessage(msg);
    throw new Error(msg);
  }

  const inspect = process.env.VITTE_LSP_INSPECT;
  const debugExecArgv = inspect ? ["--nolazy", `--inspect=${inspect}`] : [];

  return {
    run:   { module: serverJs, transport: TransportKind.ipc, options: { env: process.env } },
    debug: { module: serverJs, transport: TransportKind.ipc, options: { execArgv: debugExecArgv, env: process.env } },
  };
}

export async function activate(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration("vitte");
  const enable = cfg.get<boolean>("enableLSP", false);
  const output = vscode.window.createOutputChannel("Vitte/Vitl LSP");
  const trace  = vscode.window.createOutputChannel("Vitte/Vitl LSP Trace");

  context.subscriptions.push(
    vscode.commands.registerCommand("vitte.hello", () => {
      vscode.window.showInformationMessage("Vitte/Vitl extension active");
    }),
    vscode.commands.registerCommand("vitte.restartLSP", async () => {
      await client?.stop();
      client = undefined;
      await startClient();
    }),
    vscode.commands.registerCommand("vitte.toggleLSP", async () => {
      const conf = vscode.workspace.getConfiguration("vitte");
      const cur = conf.get<boolean>("enableLSP", false);
      await conf.update("enableLSP", !cur, vscode.ConfigurationTarget.Global);
    })
  );

  output.appendLine("[vitte/vitl] Activation de l’extension…");
  if (!enable) output.appendLine("[vitte/vitl] LSP désactivé. Rien à démarrer.");

  const startClient = async () => {
    if (client) return;
    try {
      const serverOptions = resolveServerOptions(context);
      const clientOptions: LanguageClientOptions = {
        documentSelector: [
          { language: "vitte", scheme: "file" },
          { language: "vitte", scheme: "untitled" },
          { language: "vitl",  scheme: "file" },
          { language: "vitl",  scheme: "untitled" }
        ],
        synchronize: {
          configurationSection: ["vitte", "vitl"],
          fileEvents: [
            vscode.workspace.createFileSystemWatcher("**/.vitteconfig"),
            vscode.workspace.createFileSystemWatcher("**/vitte.toml"),
            vscode.workspace.createFileSystemWatcher("**/.vitlconfig"),
            vscode.workspace.createFileSystemWatcher("**/vitl.toml")
          ]
        },
        initializationOptions: { telemetry: true },
        outputChannel: output,
        traceOutputChannel: trace
      };

      client = new LanguageClient(
        "vitteLanguageServer",
        "Vitte/Vitl Language Server",
        serverOptions,
        clientOptions
      );

      context.subscriptions.push({ dispose: () => { void client?.stop(); } }, output, trace);
      await client.start();
      output.appendLine("[vitte/vitl] Client LSP démarré ✅");
    } catch (err) {
      const msg = `[vitte/vitl] Échec démarrage LSP: ${String(err)}`;
      output.appendLine(msg);
      void vscode.window.showErrorMessage(msg);
    }
  };

  if (enable) {
    await startClient();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration("vitte") && !e.affectsConfiguration("vitl")) return;

      const newEnable = vscode.workspace.getConfiguration("vitte").get<boolean>("enableLSP", false);
      output.appendLine(`[vitte/vitl] Config mise à jour. enableLSP=${newEnable}`);

      if (newEnable && !client) {
        await startClient();
      } else if (!newEnable && client) {
        output.appendLine("[vitte/vitl] Arrêt du LSP (enableLSP=false)...");
        await client.stop();
        client = undefined;
        output.appendLine("[vitte/vitl] LSP arrêté ✅");
      }

      await client?.sendNotification("workspace/didChangeConfiguration", {
        settings: {
          vitte: vscode.workspace.getConfiguration("vitte"),
          vitl:  vscode.workspace.getConfiguration("vitl")
        }
      });
    })
  );
}

export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}


export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}
