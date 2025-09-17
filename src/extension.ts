/*
 * extension.ts — Client VS Code pour Vitte/Vit/Vitl
 * - Client LSP complet (start/stop/restart, traces, statut, watcher)
 * - Commandes: logs, restart, actions (format/organize/fix), rename, démos debug
 * - Progress UI, output channel, status bar, config-sync, file watcher
 * - Robuste: no-op si pas d’éditeur, gestion d’erreurs, types stricts
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  RevealOutputChannelOn,
  State as ClientState,
  DocumentSelector
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let output: vscode.OutputChannel;
let statusItem: vscode.StatusBarItem;

const LANGUAGES = ["vitte", "vit", "vitl"] as const;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("Vitte Language Server", { log: true });
  statusItem = vscode.window.createStatusBarItem("vitte.status", vscode.StatusBarAlignment.Right, 100);
  statusItem.name = "Vitte LSP";
  statusItem.text = "$(rocket) Vitte";
  statusItem.tooltip = "Vitte Language Server";
  statusItem.command = "vitte.showServerLog";
  statusItem.show();
  context.subscriptions.push(output, statusItem);

  await startClient(context);

  // Commandes
  context.subscriptions.push(
    vscode.commands.registerCommand("vitte.showServerLog", () => {
      output.show(true);
    }),
    vscode.commands.registerCommand("vitte.restartServer", async () => {
      await restartClient(context);
    }),
    vscode.commands.registerCommand("vitte.runAction", async () => {
      const pick = await vscode.window.showQuickPick([
        { label: "Format document", description: "editor.action.formatDocument", action: "format" },
        { label: "Organize imports", description: "editor.action.organizeImports", action: "organizeImports" },
        { label: "Fix all", description: "source.fixAll", action: "fixAll" }
      ], { title: "Vitte: Run Action" });
      if (!pick) return;
      await runBuiltinAction(pick.action);
    }),
    vscode.commands.registerCommand("vitte.runActionWithArgs", async () => {
      const action = await vscode.window.showInputBox({ prompt: "Action (format | organizeImports | fixAll)", value: "format" });
      if (!action) return;
      await runBuiltinAction(action.trim());
    }),
    vscode.commands.registerCommand("vitte.formatDocument", async () => runBuiltinAction("format")),
    vscode.commands.registerCommand("vitte.organizeImports", async () => runBuiltinAction("organizeImports")),
    vscode.commands.registerCommand("vitte.fixAll", async () => runBuiltinAction("fixAll")),
    vscode.commands.registerCommand("vitte.renameSymbol", async () => {
      if (!vscode.window.activeTextEditor) return;
      await vscode.commands.executeCommand("editor.action.rename");
    }),
    vscode.commands.registerCommand("vitte.applyEditSample", async () => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      const edit = new vscode.WorkspaceEdit();
      edit.insert(editor.document.uri, new vscode.Position(0, 0), "// Edited by Vitte sample\n");
      await vscode.workspace.applyEdit(edit);
    }),
    vscode.commands.registerCommand("vitte.progressSample", async () => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Vitte: Running task" }, async (p) => {
        p.report({ message: "Step 1/3" }); await sleep(250);
        p.report({ message: "Step 2/3" }); await sleep(250);
        p.report({ message: "Step 3/3" }); await sleep(250);
      });
    }),
    vscode.commands.registerCommand("vitte.showInfo", async () => {
      const cfg = vscode.workspace.getConfiguration("vitte");
      const trace = cfg.get<string>("trace.server", "off");
      void vscode.window.showInformationMessage(`Vitte LSP — trace: ${trace}`);
    }),
    vscode.commands.registerCommand("vitte.debug.runFile", async () => runDebugCurrentFile()),
    vscode.commands.registerCommand("vitte.debug.attachServer", async () => attachDebugServer()),
  );

  // Mise à jour du statut selon l’éditeur actif
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusText));
  updateStatusText(vscode.window.activeTextEditor ?? undefined);

  // Relance si config Vitte change
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration("vitte")) {
      await restartClient(context);
    }
  }));
}

export async function deactivate(): Promise<void> {
  try { await client?.stop(); } catch { /* noop */ }
  client = undefined;
}

/* --------------------------------- LSP ----------------------------------- */

function resolveServerModule(context: vscode.ExtensionContext): string {
  // Permet d’overrider via settings: vitte.serverPath
  const cfgPath = vscode.workspace.getConfiguration("vitte").get<string>("serverPath");
  if (cfgPath && fs.existsSync(cfgPath)) return cfgPath;
  const bundled = context.asAbsolutePath(path.join("out", "server.js"));
  return bundled;
}

async function startClient(context: vscode.ExtensionContext): Promise<void> {
  if (client) return; // déjà démarré

  const serverModule = resolveServerModule(context);
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };
  const serverOptions: ServerOptions = {
    run:   { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
  };

  const documentSelector: DocumentSelector = LANGUAGES.map((id) => ({ scheme: "file", language: id }));

  const clientOptions: LanguageClientOptions = {
    documentSelector,
    outputChannel: output,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    synchronize: {
      configurationSection: "vitte",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{vitte,vit,vitl}")
    },
    middleware: {
      provideDocumentFormattingEdits: async (doc, options, token, next) => {
        try { return await next(doc, options, token); } catch {
          await vscode.commands.executeCommand("editor.action.formatDocument");
          return [];
        }
      },
    },
    initializationOptions: {
      // Extension → Serveur: options d’init (libre)
    },
  };

  client = new LanguageClient("vitte-lsp", "Vitte Language Server", serverOptions, clientOptions);

  client.onTelemetry((e: unknown) => {
    output.appendLine(`[telemetry] ${JSON.stringify(e)}`);
  });

  wireClientState(client);

  await client.start();
}

async function restartClient(context: vscode.ExtensionContext): Promise<void> {
  if (client) {
    statusItem.text = "$(sync) Vitte";
    try { await client.stop(); } catch { /* noop */ }
    client = undefined;
  }
  await startClient(context);
}

function wireClientState(c: LanguageClient): void {
  c.onDidChangeState((e) => {
    if (e.newState === ClientState.Starting) {
      statusItem.text = "$(gear) Vitte";
      statusItem.tooltip = "Vitte LSP: starting";
    } else if (e.newState === ClientState.Running) {
      statusItem.text = "$(check) Vitte";
      statusItem.tooltip = "Vitte LSP: running";
    } else if (e.newState === ClientState.Stopped) {
      statusItem.text = "$(debug-stop) Vitte";
      statusItem.tooltip = "Vitte LSP: stopped";
    }
  });

  c.onNotification("vitte/status", (msg: { text?: string; tooltip?: string }) => {
    if (typeof msg?.text === "string") statusItem.text = msg.text;
    if (typeof msg?.tooltip === "string") statusItem.tooltip = msg.tooltip;
  });

  c.onNotification("vitte/log", (msg: unknown) => {
    output.appendLine(typeof msg === "string" ? msg : JSON.stringify(msg));
  });
}

/* ----------------------------- Actions utilitaires ------------------------ */

async function runBuiltinAction(action: string): Promise<void> {
  const editor = vscode.window.activeTextEditor; if (!editor) return;
  switch (action) {
    case "format":
      await vscode.commands.executeCommand("editor.action.formatDocument");
      return;
    case "organizeImports":
      await vscode.commands.executeCommand("editor.action.organizeImports");
      return;
    case "fixAll":
      await vscode.commands.executeCommand("editor.action.codeAction", {
        kind: vscode.CodeActionKind.SourceFixAll.value,
        apply: "first"
      });
      return;
    default:
      void vscode.window.showWarningMessage(`Action inconnue: ${action}`);
      return;
  }
}

function sleep(ms: number): Promise<void> { return new Promise(res => setTimeout(res, ms)); }

function updateStatusText(editor?: vscode.TextEditor): void {
  const lang = editor?.document?.languageId;
  if (lang && (LANGUAGES as readonly string[]).includes(lang)) {
    statusItem.text = `$(rocket) Vitte (${lang})`;
  } else {
    statusItem.text = "$(rocket) Vitte";
  }
}

/* -------------------------------- Debug demo ------------------------------ */

async function runDebugCurrentFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor; if (!editor) return;
  const folder = vscode.workspace.workspaceFolders?.[0];
  const cfg: vscode.DebugConfiguration = {
    type: "vitl",
    name: "Vitl: Launch current file",
    request: "launch",
    program: editor.document.fileName,
    cwd: folder?.uri.fsPath ?? path.dirname(editor.document.fileName),
    stopOnEntry: true,
    args: []
  };
  await vscode.debug.startDebugging(folder, cfg);
}

async function attachDebugServer(): Promise<void> {
  const portStr = await vscode.window.showInputBox({ prompt: "Port du serveur Vitl", value: "9333" });
  if (!portStr) return;
  const folder = vscode.workspace.workspaceFolders?.[0];
  const cfg: vscode.DebugConfiguration = {
    type: "vitl",
    name: "Vitl: Attach",
    request: "attach",
    port: Number(portStr) | 0
  } as vscode.DebugConfiguration;
  await vscode.debug.startDebugging(folder, cfg);
}
