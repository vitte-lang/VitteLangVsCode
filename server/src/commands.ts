/* --------------------------------------------------------------------------
 * commands.ts — gestion centralisée des commandes LSP (serveur)
 * Inspiré de C/C++, rust-analyzer, TypeScript
 * -------------------------------------------------------------------------- */

import {
  Connection,
  ExecuteCommandParams,
  WorkspaceEdit,
  TextEdit,
  Range,
  Position,
  InitializeParams,
  ClientCapabilities
} from "vscode-languageserver/node";

/* =========================================
 * Déclarations officielles des commandes
 * ========================================= */

export const VITTE_COMMANDS = {
  SHOW_SERVER_LOG: "vitte.showServerLog",
  RESTART_SERVER: "vitte.restartServer",
  RUN_ACTION: "vitte.runAction",
  RUN_ACTION_ARGS: "vitte.runActionWithArgs",
  DEBUG_RUN_FILE: "vitte.debug.runFile",
  DEBUG_ATTACH: "vitte.debug.attachServer",
  FORMAT_DOC: "vitte.formatDocument",
  ORGANIZE_IMPORTS: "vitte.organizeImports",
  FIX_ALL: "vitte.fixAll",
  RENAME_SYMBOL: "vitte.renameSymbol",
  APPLY_EDIT_SAMPLE: "vitte.applyEditSample",
  PROGRESS_SAMPLE: "vitte.progressSample",
  SHOW_INFO: "vitte.showInfo"
} as const;

export type CommandId = typeof VITTE_COMMANDS[keyof typeof VITTE_COMMANDS];

/* =========================================
 * Charges utiles typées
 * ========================================= */

interface DebugAttachArgs {
  host?: string;     // default 127.0.0.1
  port?: number;     // default 6009
  timeoutMs?: number; // default 10000
}

interface RenameArgs {
  uri: string;
  newName: string;
}

interface PosLike { line: number; character: number; }
interface RangeLike { start: PosLike; end: PosLike; }

type FormatArgs =
  | string
  | { uri: string; range?: RangeLike };

interface ApplyEditSampleArgs {
  uri: string;
  headerText?: string; // default "// edited by Vitte LSP\n"
}

/* =========================================
 * API d’enregistrement + capabilities
 * ========================================= */

export function registerCommands(connection: Connection): CommandId[] {
  connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
    try {
      return await handleCommand(connection, params);
    } catch (err: any) {
      connection.console.error(`Erreur commande ${params.command}: ${err?.message ?? String(err)}`);
      await connection.window.showErrorMessage(`Commande "${params.command}": ${err?.message ?? String(err)}`);
      return null;
    }
  });
  return Object.values(VITTE_COMMANDS);
}

/** À utiliser dans la réponse d'initialize: executeCommandProvider */
export function buildExecuteCommandProvider() {
  return { commands: Object.values(VITTE_COMMANDS) as string[] };
}

/** Optionnel: log des capabilities client */
export function logClientCaps(params: InitializeParams, connection: Connection) {
  const caps: ClientCapabilities | undefined = params.capabilities;
  connection.console.info(`Client: ${params.clientInfo?.name ?? "unknown"} v${params.clientInfo?.version ?? "?"}`);
  connection.console.info(`Workspace edits supported: ${!!caps?.workspace}`);
}

/* =========================================
 * Dispatcher central
 * ========================================= */

async function handleCommand(connection: Connection, params: ExecuteCommandParams): Promise<any> {
  const { command, arguments: args } = params;

  switch (command) {
    case VITTE_COMMANDS.SHOW_SERVER_LOG:
      connection.console.info("📜 Vitte: ouverture du journal LSP (stub).");
      return ok();

    case VITTE_COMMANDS.RESTART_SERVER:
      connection.console.warn("🔄 Vitte: demande de redémarrage du serveur (stub).");
      return ok();

    case VITTE_COMMANDS.RUN_ACTION:
      connection.console.log("⚡ Vitte: exécution d’une action rapide générique.");
      return ok();

    case VITTE_COMMANDS.RUN_ACTION_ARGS:
      connection.console.log(`⚡ Vitte: action avec args: ${safeJson(args)}`);
      return ok();

    case VITTE_COMMANDS.DEBUG_RUN_FILE: {
      const uri = readStringArg(args, 0);
      return debugRunFile(connection, uri);
    }

    case VITTE_COMMANDS.DEBUG_ATTACH: {
      const a = readObjectArg<DebugAttachArgs>(args, 0) ?? {};
      return debugAttach(connection, a);
    }

    case VITTE_COMMANDS.FORMAT_DOC: {
      const a = readFormatArgs(args, 0);
      return formatDocument(connection, a);
    }

    case VITTE_COMMANDS.ORGANIZE_IMPORTS: {
      const uri = readUri(args, 0);
      return organizeImports(connection, uri);
    }

    case VITTE_COMMANDS.FIX_ALL: {
      const uri = readUri(args, 0);
      return fixAllProblems(connection, uri);
    }

    case VITTE_COMMANDS.RENAME_SYMBOL: {
      const a = readObjectArg<RenameArgs>(args, 0);
      if (!a?.uri || !a?.newName) {
        throw new Error("renameSymbol: args invalides. Attendu { uri, newName }.");
      }
      return renameSymbol(connection, a.uri, a.newName);
    }

    case VITTE_COMMANDS.APPLY_EDIT_SAMPLE: {
      const a = readObjectArg<ApplyEditSampleArgs>(args, 0);
      if (!a?.uri) throw new Error("applyEditSample: uri manquant.");
      return applyEditSample(connection, a.uri, a.headerText);
    }

    case VITTE_COMMANDS.PROGRESS_SAMPLE:
      return progressSample(connection);

    case VITTE_COMMANDS.SHOW_INFO: {
      const msg = readStringArg(args, 0) ?? "Vitte: message d'information.";
      await connection.window.showInformationMessage(msg);
      return ok();
    }

    default:
      connection.console.warn(`Commande non reconnue: ${command}`);
      return null;
  }
}

/* =========================================
 * Implémentations (stubs réalistes)
 * ========================================= */

function debugRunFile(connection: Connection, uri?: string) {
  if (!uri) {
    connection.console.error("🐞 debug.runFile: aucun fichier fourni.");
    return fail();
  }
  connection.console.log(`🐞 Lancement debug sur fichier: ${uri}`);
  return ok();
}

function debugAttach(connection: Connection, a: DebugAttachArgs) {
  const host = a.host ?? "127.0.0.1";
  const port = a.port ?? 6009;
  const timeout = a.timeoutMs ?? 10_000;
  connection.console.log(`🐞 Attach au serveur debug ${host}:${port} (timeout ${timeout}ms).`);
  return ok();
}

/** Formatage: exemple d’édition — insère un header au début du fichier ou de la plage */
async function formatDocument(connection: Connection, arg?: FormatArgs) {
  if (!arg) return ok();
  const { uri, range } = normalizeFormatArgs(arg);
  const where = range ? range.start : Position.create(0, 0);

  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [TextEdit.insert(where, "// formatted by Vitte LSP\n")]
    }
  };
  await connection.workspace.applyEdit(edit);
  return ok();
}

/** Organize imports: squelette — à remplacer par analyse réelle */
async function organizeImports(connection: Connection, uri?: string) {
  if (!uri) return ok();
  connection.console.log(`📦 Organize imports sur ${uri}`);

  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [
        TextEdit.replace(
          Range.create(Position.create(0, 0), Position.create(0, Number.MAX_SAFE_INTEGER)),
          "import std.modules.core\n"
        )
      ]
    }
  };
  await connection.workspace.applyEdit(edit);
  return ok();
}

/** Fix all: correctif générique d’exemple */
async function fixAllProblems(connection: Connection, uri?: string) {
  if (!uri) return ok();
  connection.console.log(`🛠 Fix all sur ${uri}`);

  const edit: WorkspaceEdit = {
    changes: { [uri]: [TextEdit.insert(Position.create(0, 0), "// fix-all applied\n")] }
  };
  await connection.workspace.applyEdit(edit);
  return ok();
}

/** Rename: démo — remplacer par une indexation et documentChanges réels */
async function renameSymbol(connection: Connection, uri: string, newName: string) {
  connection.console.log(`✏️ Rename dans ${uri} → ${newName}`);

  const edit: WorkspaceEdit = {
    changes: { [uri]: [TextEdit.insert(Position.create(0, 0), `// rename to: ${newName}\n`)] }
  };
  await connection.workspace.applyEdit(edit);
  return ok();
}

/** Exemple d’édition paramétrable via settings (headerText) */
async function applyEditSample(connection: Connection, uri: string, headerText?: string) {
  const text = headerText ?? "// edited by Vitte LSP\n";
  const edit: WorkspaceEdit = {
    changes: { [uri]: [TextEdit.insert(Position.create(0, 0), text)] }
  };
  await connection.workspace.applyEdit(edit);
  return ok();
}

/** Démo de progression serveur → client */
async function progressSample(connection: Connection) {
  const progress = await connection.window.createWorkDoneProgress();
  progress.begin("Vitte: préparation", 0, "initialisation…", true);
  await delay(300);
  progress.report(25, "analyse…");
  await delay(300);
  progress.report(60, "application des changements…");
  await delay(300);
  progress.report(90, "presque terminé…");
  await delay(200);
  progress.done();
  await connection.window.showInformationMessage("Vitte: tâche terminée.");
  return ok();
}

/* =========================================
 * Utilitaires génériques
 * ========================================= */

function readStringArg(args: any[] | undefined, index: number): string | undefined {
  const v = args?.[index];
  return typeof v === "string" ? v : undefined;
}

function readObjectArg<T>(args: any[] | undefined, index: number): T | undefined {
  const v = args?.[index];
  return v && typeof v === "object" ? (v as T) : undefined;
}

function readUri(args: any[] | undefined, index: number): string | undefined {
  const uri = readStringArg(args, index);
  if (!uri) return undefined;
  if (uri.startsWith("file://") || uri.includes("://")) return uri;
  return "file://" + uri;
}

function readFormatArgs(args: any[] | undefined, index: number): FormatArgs | undefined {
  const v = args?.[index];
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as any).uri === "string") return v as FormatArgs;
  return undefined;
}

function normalizeFormatArgs(arg: FormatArgs): { uri: string; range?: Range } {
  if (typeof arg === "string") return { uri: arg };
  const uri = arg.uri;
  const r = arg.range
    ? Range.create(
        Position.create(arg.range.start.line, arg.range.start.character),
        Position.create(arg.range.end.line, arg.range.end.character)
      )
    : undefined;
  return { uri, range: r };
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

function ok() { return { ok: true }; }
function fail() { return { ok: false }; }
