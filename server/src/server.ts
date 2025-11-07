// server.ts — Vitte/Vitl LSP enrichi et robuste
// Objectifs:
// - Capabilities complètes: completion, hover, symbols, def/refs, rename, formatting, diagnostics, semantic tokens
// - Gestion config dynamique + watchers + arrêt propre
// - Lint avec débounce, garde-fous de taille et annulation
// - Journalisation contrôlée, métriques simples, try/catch systématique

import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionParams,
  CompletionItem,
  HoverParams,
  Hover,
  DocumentSymbolParams,
  DocumentSymbol,
  DocumentFormattingParams,
  Diagnostic,
  TextDocuments,
  SemanticTokensParams,
  SemanticTokensLegend,
  WorkspaceSymbolParams,
  WorkspaceSymbol,
  DefinitionParams,
  Location,
  ReferenceParams,
  RenameParams,
  PrepareRenameParams,
  Range,
  TextEdit,
  WorkspaceEdit,
  DidChangeConfigurationNotification,
  CancellationToken,
  FileChangeType,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/* Modules internes */
import { provideCompletions, resolveCompletion, triggerCharacters } from "./completion.js";
import {
  documentSymbols,
  definitionAtPosition,
  referencesAtPosition,
  renameSymbol,
  prepareRename,
  workspaceSymbols,
} from "./navigation.js";
import { provideFormattingEdits } from "./formatting.js";
import { getSemanticTokensLegend, buildSemanticTokens, provideHover } from "./semantic.js";
import { lintToPublishable } from "./lint.js";
import { registerCommands } from "./commands.js";
import { indexDocument as indexWorkspaceDocument, removeDocument as removeWorkspaceDocument, clearIndex } from "./indexer.js";

/* --------------------------- Connexion + documents ------------------------ */
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

/* ------------------------------- Configuration --------------------------- */
interface ServerSettings {
  trace: "off" | "messages" | "verbose";
  lintDebounceMs: number;
  enableFormatting: boolean;
  maxFileSizeKB: number; // au-delà: skip lint + semantic pour préserver la perf
}

const DEFAULT_SETTINGS: ServerSettings = {
  trace: "off",
  lintDebounceMs: 200,
  enableFormatting: true,
  maxFileSizeKB: 1024, // 1 Mo
};

let globalSettings: ServerSettings = { ...DEFAULT_SETTINGS };
let hasConfigurationCapability = false;
let hasWorkspaceFoldersCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  hasConfigurationCapability = !!capabilities.workspace?.configuration;
  hasWorkspaceFoldersCapability = !!capabilities.workspace?.workspaceFolders;

  const legend: SemanticTokensLegend = getSemanticTokensLegend();

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Enable resolve to enrich completion items lazily and use centralized trigger characters
      completionProvider: { resolveProvider: true, triggerCharacters: triggerCharacters() },
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      workspaceSymbolProvider: true,
      semanticTokensProvider: { legend, full: true, range: false },
    },
  };

  if (hasWorkspaceFoldersCapability) {
    (result.capabilities as any).workspace = { workspaceFolders: { supported: true } };
  }
  return result;
});

connection.onInitialized(() => {
  registerCommands(connection);
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  // Watch classiques pour compat large versions du client
  connection.onDidChangeWatchedFiles((change) => {
    for (const ev of change.changes) {
      if (ev.type === FileChangeType.Deleted) {
        connection.sendDiagnostics({ uri: ev.uri, diagnostics: [] });
      }
    }
  });
});

connection.onShutdown(() => {
  for (const t of lintTimers.values()) clearTimeout(t);
  lintTimers.clear();
  clearIndex();
});

/* ------------------------------- Config updates --------------------------- */
connection.onDidChangeConfiguration(async () => {
  if (hasConfigurationCapability) {
    try {
      const cfg = await connection.workspace.getConfiguration({ section: "vitte" });
      globalSettings = { ...DEFAULT_SETTINGS, ...(cfg as Partial<ServerSettings>) };
    } catch {
      globalSettings = { ...DEFAULT_SETTINGS };
    }
  } else {
    globalSettings = { ...DEFAULT_SETTINGS };
  }
  for (const doc of documents.all()) scheduleLint(doc);
});

/* --------------------------------- Guards -------------------------------- */
function tooLarge(doc: TextDocument): boolean {
  const kb = Buffer.byteLength(doc.getText(), "utf8") / 1024;
  return kb > (globalSettings.maxFileSizeKB | 0);
}

function cancelled(token?: CancellationToken): boolean { return !!token?.isCancellationRequested; }

/* --------------------------------- Handlers ------------------------------- */

connection.onCompletion((params: CompletionParams, token?: CancellationToken): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return [];
  try { return provideCompletions(doc, params.position); } catch (e) { logErr("completion", e); return []; }
});

// Allow the client to resolve/enrich completion items on demand (details, docs)
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  try { return resolveCompletion(item); } catch (e) { logErr("completionResolve", e); return item; }
});

connection.onHover((params: HoverParams, token?: CancellationToken): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return null;
  try { return provideHover(doc, params.position); } catch (e) { logErr("hover", e); return null; }
});

connection.onDocumentSymbol((params: DocumentSymbolParams, token?: CancellationToken): DocumentSymbol[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return [];
  try { return documentSymbols(doc); } catch (e) { logErr("documentSymbols", e); return []; }
});

connection.onDocumentFormatting((params: DocumentFormattingParams, token?: CancellationToken) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || !globalSettings.enableFormatting || cancelled(token)) return [];
  try { return provideFormattingEdits(doc, params.options); } catch (e) { logErr("formatting", e); return []; }
});

connection.onDefinition((params: DefinitionParams, token?: CancellationToken): Location[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return [];
  try { return definitionAtPosition(doc, params.position, params.textDocument.uri); } catch (e) { logErr("definition", e); return []; }
});

connection.onReferences((params: ReferenceParams, token?: CancellationToken): Location[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return [];
  try { return referencesAtPosition(doc, params.position, params.textDocument.uri); } catch (e) { logErr("references", e); return []; }
});

connection.onPrepareRename((params: PrepareRenameParams, token?: CancellationToken): { range: Range; placeholder: string } | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return null;
  try { return prepareRename(doc, params.position); } catch (e) { logErr("prepareRename", e); return null; }
});

// Correction de type: renvoie WorkspaceEdit
connection.onRenameRequest((params: RenameParams, token?: CancellationToken): WorkspaceEdit | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return null;
  try {
    const edits = renameSymbol(doc, params.position, params.newName).map(e => TextEdit.replace(e.range, e.newText));
    const we: WorkspaceEdit = { changes: { [doc.uri]: edits } };
    return we;
  } catch (e) { logErr("rename", e); return null; }
});

connection.onWorkspaceSymbol((params: WorkspaceSymbolParams, token?: CancellationToken): WorkspaceSymbol[] => {
  if (cancelled(token)) return [];
  try {
    const openDocs = documents.all().map(d => ({ uri: d.uri, doc: d }));
    return workspaceSymbols(params.query ?? "", openDocs, 200);
  } catch (e) { logErr("workspaceSymbols", e); return []; }
});

connection.languages.semanticTokens.on((params: SemanticTokensParams, token?: CancellationToken) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc || cancelled(token)) return { data: [] } as any;
  if (tooLarge(doc)) return { data: [] } as any;
  try { return buildSemanticTokens(doc); } catch (e) { logErr("semanticTokens", e); return { data: [] } as any; }
});

/* -------------------------------- Diagnostics ----------------------------- */
const lintTimers = new Map<string, NodeJS.Timeout>();

async function runLint(doc: TextDocument): Promise<void> {
  try {
    if (tooLarge(doc)) { connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] }); return; }
    const text = doc.getText();
    const uri = doc.uri;
    const t0 = now();
    const diags = (lintToPublishable(text, uri) ?? []) as Diagnostic[];
    connection.sendDiagnostics({ uri, diagnostics: diags });
    metric("lint", t0, uri, diags.length);
  } catch (e) {
    logErr("lint", e);
  }
}

function scheduleLint(doc: TextDocument): void {
  const key = doc.uri;
  const delay = Math.max(0, globalSettings.lintDebounceMs | 0);
  const prev = lintTimers.get(key);
  if (prev) clearTimeout(prev);
  lintTimers.set(key, setTimeout(() => void runLint(doc), delay));
}

/* --------------------------------- Events -------------------------------- */

documents.onDidOpen((e) => { indexWorkspaceDocument(e.document); scheduleLint(e.document); });
documents.onDidChangeContent((e) => { indexWorkspaceDocument(e.document); scheduleLint(e.document); });
documents.onDidClose((e) => {
  removeWorkspaceDocument(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  lintTimers.delete(e.document.uri);
});

/* --------------------------------- Launch -------------------------------- */

documents.listen(connection);
connection.listen();

/* --------------------------------- Utils --------------------------------- */

function now(): bigint | number { return typeof process !== "undefined" && (process as any).hrtime?.bigint ? (process as any).hrtime.bigint() : Date.now(); }

function metric(what: string, t0: bigint | number, uri: string, n?: number) {
  const end = now();
  let ms: number;
  if (typeof t0 === "bigint" && typeof end === "bigint") ms = Number(end - t0) / 1e6; else ms = (end as number) - (t0 as number);
  if (globalSettings.trace !== "verbose") return;
  connection.console.log(`[metric] ${what} ${ms.toFixed(1)}ms uri=${uri}${typeof n === "number" ? ` n=${n}` : ""}`);
}

function logErr(ctx: string, err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (globalSettings.trace === "verbose" && err instanceof Error && err.stack) {
    connection.console.error(`[${ctx}] ${msg}\n${err.stack}`);
  } else {
    connection.console.error(`[${ctx}] ${msg}`);
  }
}
