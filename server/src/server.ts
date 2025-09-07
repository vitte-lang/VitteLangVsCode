/* Vitte/Vitl LSP — serveur complet niveau C++ */
import {
  createConnection, ProposedFeatures,
  InitializeParams, InitializeResult,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  CompletionItem, CompletionItemKind,
  Diagnostic, DiagnosticSeverity,
  Position, Range, Location,
  SymbolKind, DocumentSymbol, WorkspaceFolder,
  SemanticTokensParams, SemanticTokensLegend, SemanticTokensBuilder,
  ExecuteCommandParams, WorkspaceSymbolParams, ReferenceParams, RenameParams,
  TextEdit
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { lintDocument } from "./lint";
import { buildCompletions } from "./completion";
import { buildSemanticTokens } from "./semantic";
import { extractSymbols, goToDefinition, findReferences } from "./navigation";
import { formatDocument, formatRange } from "./formatting";
import { registerCommands } from "./commands";

/* -------------------------------------------------------------------------- */
/* Connexion / État global                                                    */
/* -------------------------------------------------------------------------- */

const connection = createConnection(ProposedFeatures.all);
const documents: Map<string, TextDocument> = new Map();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let workspaceFolders: WorkspaceFolder[] | null = null;

/* Cache diagnostics */
const debounceTimers = new Map<string, NodeJS.Timeout>();

/* -------------------------------------------------------------------------- */
/* Réglages serveur                                                           */
/* -------------------------------------------------------------------------- */

interface ServerSettings {
  maxNumberOfProblems: number;
  strictMode: boolean;
  enableSemanticTokens: boolean;
  formatOnSave: boolean;
}
const defaultSettings: ServerSettings = {
  maxNumberOfProblems: 500,
  strictMode: false,
  enableSemanticTokens: true,
  formatOnSave: false
};

const documentSettings = new Map<string, Thenable<ServerSettings>>();

function getDocumentSettings(uri: string, langId: string): Thenable<ServerSettings> {
  if (!hasConfigurationCapability) return Promise.resolve(defaultSettings);
  const key = `${uri}::${langId}`;
  let r = documentSettings.get(key);
  if (!r) {
    r = connection.workspace.getConfiguration({ scopeUri: uri, section: langId }) as Thenable<ServerSettings>;
    documentSettings.set(key, r);
  }
  return r;
}

/* -------------------------------------------------------------------------- */
/* Lint / Diagnostics                                                         */
/* -------------------------------------------------------------------------- */

async function validateTextDocument(doc: TextDocument) {
  const settings = await getDocumentSettings(doc.uri, doc.languageId);
  const diagnostics: Diagnostic[] = lintDocument(doc, settings);
  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

function scheduleValidate(doc: TextDocument, ms = 200) {
  const key = doc.uri;
  const t = debounceTimers.get(key);
  if (t) clearTimeout(t);
  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    void validateTextDocument(doc);
  }, ms));
}

/* -------------------------------------------------------------------------- */
/* Initialisation                                                             */
/* -------------------------------------------------------------------------- */

connection.onInitialize((params: InitializeParams): InitializeResult => {
  hasConfigurationCapability = !!(params.capabilities.workspace?.configuration);
  hasWorkspaceFolderCapability = !!(params.capabilities.workspace?.workspaceFolders);
  workspaceFolders = params.workspaceFolders ?? null;

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: [".", ":", ">", " "] },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      renameProvider: { prepareProvider: true },
      codeActionProvider: true,
      semanticTokensProvider: { legend: semanticLegend, full: true, range: true },
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      executeCommandProvider: { commands: registerCommands(connection) }
    }
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability)
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
});

/* -------------------------------------------------------------------------- */
/* Listeners                                                                  */
/* -------------------------------------------------------------------------- */

connection.onDidChangeConfiguration(() => {
  documentSettings.clear();
  for (const doc of documents.values()) scheduleValidate(doc);
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return buildCompletions(doc, params.position);
});

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  return { contents: { kind: "markdown", value: `Hover info at ${params.position.line}:${params.position.character}` } };
});

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return goToDefinition(doc, params.position);
});

connection.onReferences((params: ReferenceParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return findReferences(doc, params.position);
});

connection.onDocumentSymbol((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return extractSymbols(doc);
});

connection.onWorkspaceSymbol((params: WorkspaceSymbolParams) => {
  // Ici : recherche globale via indexer.ts
  return [];
});

connection.onRenameRequest((params: RenameParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const edits: TextEdit[] = []; // TODO: générer via indexeur
  return { changes: { [doc.uri]: edits } };
});

connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  return buildSemanticTokens(doc);
});

connection.onDocumentFormatting((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return formatDocument(doc);
});

connection.onDocumentRangeFormatting((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return formatRange(doc, params.range);
});

connection.onExecuteCommand((params: ExecuteCommandParams) => {
  connection.console.log(`Commande exécutée: ${params.command}`);
});

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

connection.onDidOpenTextDocument((params) => {
  const doc = TextDocument.create(params.textDocument.uri, params.textDocument.languageId, params.textDocument.version, params.textDocument.text);
  documents.set(doc.uri, doc);
  scheduleValidate(doc);
});

connection.onDidChangeTextDocument((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return;
  const newDoc = TextDocument.update(doc, params.contentChanges, params.textDocument.version);
  documents.set(newDoc.uri, newDoc);
  scheduleValidate(newDoc);
});

connection.onDidCloseTextDocument((params) => {
  documents.delete(params.textDocument.uri);
  connection.sendDiagnostics({ uri: params.textDocument.uri, diagnostics: [] });
});

connection.listen();

/* -------------------------------------------------------------------------- */
/* Semantic Tokens legend                                                     */
/* -------------------------------------------------------------------------- */

const semanticLegend: SemanticTokensLegend = {
  tokenTypes: [
    "namespace", "class", "enum", "interface",
    "struct", "type", "function", "method",
    "variable", "parameter", "property",
    "keyword", "string", "number", "comment"
  ],
  tokenModifiers: ["declaration", "static", "abstract", "deprecated", "async", "readonly"]
};
