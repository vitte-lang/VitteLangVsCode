import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

function resolveServerOptions(ctx: vscode.ExtensionContext): ServerOptions {
  // 1) Binaire externe (VITTE_LSP_PATH)
  const envPath = process.env.VITTE_LSP_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return { command: envPath, args: [], options: { env: process.env } };
  }

  // 2) JS packagé dans l’extension
  const serverJs = ctx.asAbsolutePath(path.join("server", "out", "server.js"));
  if (!fs.existsSync(serverJs)) {
    const msg = `[vitte] Introuvable: ${serverJs}. Lancez "npm run compile" dans l’extension.`;
    void vscode.window.showErrorMessage(msg);
    throw new Error(msg);
  }

  // 3) Mode debug optionnel
  const inspect = process.env.VITTE_LSP_INSPECT; // ex: "6009"
  const debugExecArgv = inspect ? ["--nolazy", `--inspect=${inspect}`] : [];

  return {
    run:   { module: serverJs, transport: TransportKind.ipc, options: { env: process.env } },
    debug: { module: serverJs, transport: TransportKind.ipc, options: { execArgv: debugExecArgv, env: process.env } }
  };
}

export async function activate(context: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration("vitte");
  const enable = cfg.get<boolean>("enableLSP", false);
  const output = vscode.window.createOutputChannel("Vitte LSP");
  const trace  = vscode.window.createOutputChannel("Vitte LSP Trace");

  output.appendLine("[vitte] Activation de l’extension…");
  if (!enable) {
    output.appendLine("[vitte] LSP désactivé (vitte.enableLSP=false). Rien à démarrer.");
    // On reste actif pour réagir si l’utilisateur active plus tard.
  }

  // Démarrage conditionnel
  const startClient = async () => {
    if (client) return; // déjà démarré
    try {
      const serverOptions = resolveServerOptions(context);
      const clientOptions: LanguageClientOptions = {
        documentSelector: [
          { language: "vitte", scheme: "file" },
          { language: "vitte", scheme: "untitled" }
        ],
        synchronize: {
          configurationSection: "vitte",
          fileEvents: [
            vscode.workspace.createFileSystemWatcher("**/.vitteconfig"),
            vscode.workspace.createFileSystemWatcher("**/vitte.toml")
          ]
        },
        initializationOptions: { telemetry: true },
        outputChannel: output,
        traceOutputChannel: trace
      };

      client = new LanguageClient(
        "vitteLanguageServer",
        "Vitte Language Server",
        serverOptions,
        clientOptions
      );

      context.subscriptions.push({ dispose: () => { void client?.stop(); } }, output, trace);
      await client.start();
      output.appendLine("[vitte] Client LSP démarré ✅");
    } catch (err) {
      const msg = `[vitte] Échec démarrage LSP: ${String(err)}`;
      output.appendLine(msg);
      void vscode.window.showErrorMessage(msg);
      // on ne relance pas en boucle
    }
  };

  if (enable) {
    await startClient();
  }

  // Réagir aux changements de configuration
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration("vitte")) return;

      const newEnable = vscode.workspace.getConfiguration("vitte").get<boolean>("enableLSP", false);
      output.appendLine(`[vitte] Configuration mise à jour. enableLSP=${newEnable}`);

      if (newEnable && !client) {
        // Activer -> démarrer
        await startClient();
      } else if (!newEnable && client) {
        // Désactiver -> arrêter
        output.appendLine("[vitte] Arrêt du LSP (enableLSP=false)...");
        await client.stop();
        client = undefined;
        output.appendLine("[vitte] LSP arrêté ✅");
      }

      // Propager le reste de la configuration au serveur s’il tourne
      await client?.sendNotification("workspace/didChangeConfiguration", {
        settings: vscode.workspace.getConfiguration("vitte")
      });
    })
  );
}

export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}
