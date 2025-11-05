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
import { registerDiagnosticsView } from "./diagnosticsView";
import { registerModuleExplorerView } from "./moduleExplorerView";
import { VitteProjectTreeProvider } from "./providers/tree/projectTree";
import { PlaygroundPanel } from "./providers/playgroundPanel";
import {
  LanguageClient,
  TransportKind,
  RevealOutputChannelOn,
  State as ClientState,
} from "vscode-languageclient/node";
import type {
  LanguageClientOptions,
  ServerOptions,
  DocumentSelector,
  ProvideDocumentFormattingEditsSignature,
} from "vscode-languageclient/node";
import {
  summarizeWorkspaceDiagnostics,
  diagnosticsLevel,
  formatDiagnosticsSummary,
} from "./utils/diagnostics";

let client: LanguageClient | undefined;
let output: vscode.OutputChannel;
let statusItem: vscode.StatusBarItem;

let statusBaseIcon = "$(rocket)";
const STATUS_LABEL = "Vitte";
let statusLanguageSuffix = "";
let statusBaseTooltip = "Vitte Language Server";
let statusHealthIcon = "";
let statusHealthTooltip = "";
let statusOverrideText: string | undefined;
let statusOverrideTooltip: string | undefined;

export interface ExtensionApi {
  getStatusText(): string;
  getStatusTooltip(): string;
  getClientState(): ClientState | undefined;
  runAction(action: string): Promise<void>;
  restart(): Promise<void>;
  resolveServerModuleForTest(ctx: Pick<vscode.ExtensionContext, "asAbsolutePath">): string;
}

const LANGUAGES = ["vitte", "vit", "vitl"] as const;
const WATCH_PATTERNS = [
  "**/*.{vitte,vit,vitl}",
  "**/vitte.toml",
  "**/.vitteconfig",
  "**/vitl.toml",
  "**/.vitlconfig"
] as const;
const LANGUAGE_SET = new Set<string>(LANGUAGES);

let fileWatchers: vscode.FileSystemWatcher[] = [];

function logServerResolution(message: string): void {
  const text = `[vitte] ${message}`;
  output?.appendLine(text);
}

function applyStatusBar(): void {
  if (!statusItem) return;
  let text: string;
  let tooltipParts: string[];

  if (statusOverrideText !== undefined) {
    text = statusOverrideText;
    tooltipParts = [statusOverrideTooltip ?? statusBaseTooltip];
  } else {
    const suffix = statusLanguageSuffix ? ` (${statusLanguageSuffix})` : "";
    text = `${statusBaseIcon} ${STATUS_LABEL}${suffix}`;
    tooltipParts = [statusBaseTooltip];
    if (statusOverrideTooltip) {
      tooltipParts.push(statusOverrideTooltip);
    }
  }

  if (statusHealthIcon) {
    text = `${text} ${statusHealthIcon}`;
  }

  if (statusHealthTooltip) {
    tooltipParts.push(statusHealthTooltip);
  }

  statusItem.text = text;
  statusItem.tooltip = tooltipParts.filter(Boolean).join("\n");
  statusItem.accessibilityInformation = {
    label: text.replace(/\$\([^)]+\)/g, "").trim(),
    role: "status"
  };
}

function setStatusBase(icon: string, tooltip: string): void {
  statusBaseIcon = icon;
  statusBaseTooltip = tooltip;
  statusOverrideText = undefined;
  statusOverrideTooltip = undefined;
  applyStatusBar();
}

function setStatusLanguageSuffix(lang?: string): void {
  statusLanguageSuffix = lang ?? "";
  applyStatusBar();
}

function setStatusOverride(text?: string, tooltip?: string): void {
  statusOverrideText = text;
  statusOverrideTooltip = tooltip;
  applyStatusBar();
}

function refreshDiagnosticsStatus(): void {
  const summary = summarizeWorkspaceDiagnostics();
  const level = diagnosticsLevel(summary);
  switch (level) {
    case "error":
      statusHealthIcon = "$(error)";
      break;
    case "warning":
      statusHealthIcon = "$(warning)";
      break;
    default:
      statusHealthIcon = "$(pass-filled)";
  }
  statusHealthTooltip = formatDiagnosticsSummary(summary);
  applyStatusBar();
}

function ensureFileWatchers(context: vscode.ExtensionContext): vscode.FileSystemWatcher[] {
  if (fileWatchers.length === 0) {
    fileWatchers = WATCH_PATTERNS.map((pattern) => {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      context.subscriptions.push(watcher);
      return watcher;
    });
  }
  return fileWatchers;
}

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionApi | undefined> {
  output = vscode.window.createOutputChannel("Vitte Language Server", { log: true });
  statusItem = vscode.window.createStatusBarItem("vitte.status", vscode.StatusBarAlignment.Right, 100);
  statusItem.name = "Vitte LSP";
  statusItem.command = "vitte.showServerLog";
  context.subscriptions.push(output, statusItem);
  setStatusBase("$(rocket)", "Vitte Language Server");
  refreshDiagnosticsStatus();
  statusItem.show();

  await startClient(context);

  // Sidebar: Explorateur Vitte (activity bar)
  const vitteTree = new VitteProjectTreeProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('vitteView', vitteTree)
  );

  // Toolbar + palette commands for the view
  context.subscriptions.push(
    vscode.commands.registerCommand('vitte.refreshExplorer', () => vitteTree.refresh()),
    vscode.commands.registerCommand('vitte.openDocs', () => {
      const uri = vscode.Uri.file(path.join(context.extensionPath, 'media', 'docs.html'));
      return vscode.commands.executeCommand('vscode.open', uri);
    }),
    vscode.commands.registerCommand('vitte.openPlayground', () => PlaygroundPanel.createOrShow(context))
  );

  // Commandes
  context.subscriptions.push(
    vscode.commands.registerCommand("vitte.showServerLog", () => {
      output.show(true);
    }),
    vscode.commands.registerCommand("vitte.restartServer", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Vitte : redémarrage du serveur de langage…",
        },
        async () => {
          await restartClient(context);
        }
      );
      vscode.window.setStatusBarMessage("Serveur Vitte redémarré avec succès.", 3000);
    }),
    vscode.commands.registerCommand("vitte.runAction", async () => {
      const pick = await vscode.window.showQuickPick([
        {
          label: "Format document",
          description: "editor.action.formatDocument",
          detail: "Applique le formateur configuré pour le fichier actif.",
          action: "format",
        },
        {
          label: "Organize imports",
          description: "editor.action.organizeImports",
          detail: "Trie et nettoie les imports du document courant.",
          action: "organizeImports",
        },
        {
          label: "Fix all",
          description: "source.fixAll",
          detail: "Exécute les correctifs automatiques disponibles.",
          action: "fixAll",
        }
      ], { title: "Vitte : exécuter une action rapide" });
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
      await vscode.window.showInformationMessage(`Vitte LSP — trace: ${trace}`);
    }),
    vscode.commands.registerCommand("vitte.debug.runFile", async () => { await runDebugCurrentFile(); }),
    vscode.commands.registerCommand("vitte.debug.attachServer", async () => { await attachDebugServer(); }),
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

  // Vue diagnostics dédiée (débutants/avancés)
  registerDiagnosticsView(context);
  registerModuleExplorerView(context);
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(() => refreshDiagnosticsStatus()));

  if (process.env.VSCODE_TESTING === "1") {
    const api: ExtensionApi = {
      getStatusText: () => statusItem?.text ?? "",
      getStatusTooltip: () => {
        const tip = statusItem?.tooltip;
        if (typeof tip === "string") return tip;
        if (tip instanceof vscode.MarkdownString) {
          return tip.value ?? "";
        }
        return "";
      },
      getClientState: () => client?.state,
      runAction: async (action: string) => {
        await runBuiltinAction(action);
      },
      restart: async () => {
        await restartClient(context);
      },
      resolveServerModuleForTest: (ctx) => resolveServerModule(ctx as vscode.ExtensionContext),
    };
    return api;
  }

  return undefined;
}

export async function deactivate(): Promise<void> {
  try { await client?.stop(); } catch { /* noop */ }
  client = undefined;
  for (const watcher of fileWatchers) {
    try { watcher.dispose(); } catch { /* noop */ }
  }
  fileWatchers = [];
}

/* --------------------------------- LSP ----------------------------------- */

function resolveServerModule(context: vscode.ExtensionContext): string {
  // Permet d’overrider via settings: vitte.serverPath
  const cfgPath = vscode.workspace.getConfiguration("vitte").get<string>("serverPath");
  if (cfgPath) {
    if (fs.existsSync(cfgPath)) {
      logServerResolution(`Utilisation du serveur personnalisé: ${cfgPath}`);
      return cfgPath;
    }
    logServerResolution(`Chemin de serveur personnalisé introuvable: ${cfgPath}`);
  }
  const nested = context.asAbsolutePath(path.join("server", "out", "server.js"));
  if (fs.existsSync(nested)) {
    logServerResolution(`Utilisation du serveur empaqueté (server/out): ${nested}`);
    return nested;
  }
  const bundled = context.asAbsolutePath(path.join("out", "server.js"));
  if (fs.existsSync(bundled)) {
    logServerResolution(`Utilisation du serveur embarqué: ${bundled}`);
    return bundled;
  }
  const message = "Module serveur Vitte introuvable (out/server.js ou server/out/server.js)";
  logServerResolution(message);
  throw new Error(message);
}

async function startClient(context: vscode.ExtensionContext): Promise<void> {
  if (client) return; // déjà démarré

  const serverModule = resolveServerModule(context);
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };
  const serverOptions: ServerOptions = {
    run:   { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
  };

  const documentSelector: DocumentSelector = LANGUAGES.flatMap((id) => ([
    { scheme: "file", language: id },
    { scheme: "untitled", language: id },
    { scheme: "vscode-notebook-cell", language: id }
  ]));
  const watchers = ensureFileWatchers(context);

  const clientOptions: LanguageClientOptions = {
    documentSelector,
    outputChannel: output,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    synchronize: {
      configurationSection: "vitte",
      fileEvents: watchers
    },
    middleware: {
      provideDocumentFormattingEdits: async (
        doc: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
        next: ProvideDocumentFormattingEditsSignature
      ) => {
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
    setStatusBase("$(sync)", "Vitte LSP : redémarrage…");
    try { await client.stop(); } catch { /* noop */ }
    client = undefined;
  }
  await startClient(context);
}

function wireClientState(c: LanguageClient): void {
  c.onDidChangeState((e: { oldState: ClientState; newState: ClientState }) => {
    if (e.newState === ClientState.Starting) {
      setStatusBase("$(gear)", "Vitte LSP : démarrage");
    } else if (e.newState === ClientState.Running) {
      setStatusBase("$(check)", "Vitte LSP : opérationnel");
    } else if (e.newState === ClientState.Stopped) {
      setStatusBase("$(debug-stop)", "Vitte LSP : arrêté");
    }
  });

  c.onNotification("vitte/status", (msg: { text?: string; tooltip?: string }) => {
    const text = typeof msg?.text === "string" ? msg.text : undefined;
    const tooltip = typeof msg?.tooltip === "string" ? msg.tooltip : undefined;
    if (text !== undefined || tooltip !== undefined) {
      setStatusOverride(text, tooltip);
    }
  });

  c.onNotification("vitte/log", (msg: unknown) => {
    output.appendLine(typeof msg === "string" ? msg : JSON.stringify(msg));
  });
}

/* ----------------------------- Actions utilitaires ------------------------ */

async function runBuiltinAction(action: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage("Ouvrez un document Vitte/Vitl avant d’exécuter cette action.");
    return;
  }
  const languageId = editor.document.languageId;
  if (!LANGUAGE_SET.has(languageId)) {
    void vscode.window.showWarningMessage("Les actions Vitte ne sont disponibles que pour les fichiers Vitte/Vitl.");
    return;
  }
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
  if (lang && LANGUAGE_SET.has(lang)) {
    setStatusLanguageSuffix(lang);
    return;
  }
  setStatusLanguageSuffix("");
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
    port: Number.parseInt(portStr, 10),
  };
  if (!Number.isInteger(cfg.port) || (cfg.port as number) <= 0) {
    void vscode.window.showErrorMessage("Port Vitl invalide.");
    return;
  }
  await vscode.debug.startDebugging(folder, cfg);
}
