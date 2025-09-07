// server.ts — Vitte/Vitl LSP simple

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
  MarkupKind,
  TextDocuments,
  SemanticTokensParams,
  SemanticTokensLegend,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/* Modules internes */
import { provideCompletions } from "./completion.js";
import { documentSymbols } from "./navigation.js";
import { provideFormattingEdits } from "./formatting.js";
import { getSemanticTokensLegend, buildSemanticTokens, provideHover } from "./semantic.js";
import { lintToPublishable } from "./lint.js";
import { registerCommands } from "./commands.js";

/* Connexion + documents */
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

/* Init */
connection.onInitialize((_params: InitializeParams): InitializeResult => {
  const legend: SemanticTokensLegend = getSemanticTokensLegend();
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false, triggerCharacters: [".", ":" ] },
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      semanticTokensProvider: { legend, full: true, range: false },
    },
  };
});

connection.onInitialized(() => {
  registerCommands(connection);
});

/* Completions */
connection.onCompletion((params: CompletionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return provideCompletions(doc, params.position);
});

/* Hover */
connection.onHover((params: HoverParams): Hover | null => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  return provideHover(doc, params.position);
});

/* Document Symbols */
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return documentSymbols(doc);
});

/* Formatting */
connection.onDocumentFormatting((params: DocumentFormattingParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return provideFormattingEdits(doc, params.options);
});

/* Semantic Tokens */
connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };
  return buildSemanticTokens(doc);
});

/* Diagnostics (lint) */
async function runLint(doc: TextDocument): Promise<void> {
  const text = doc.getText();
  const uri = doc.uri;
  const diags = (lintToPublishable(text, uri) ?? []) as Diagnostic[];
  connection.sendDiagnostics({ uri, diagnostics: diags });
}

/* Documents events */
documents.onDidOpen((e) => { void runLint(e.document); });
documents.onDidChangeContent((e) => { void runLint(e.document); });
documents.onDidClose((e) => {
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

/* Launch */
documents.listen(connection);
connection.listen();

/* Utils hover (fallback local si besoin) */
function wordAt(doc: TextDocument, pos: import("vscode-languageserver/node").Position): { word: string; range: import("vscode-languageserver/node").Range } | null {
  const text = doc.getText();
  const off = doc.offsetAt(pos);
  let s = off, e = off;
  while (s > 0 && /[A-Za-z0-9_]/.test(text.charAt(s - 1))) s--;
  while (e < text.length && /[A-Za-z0-9_]/.test(text.charAt(e))) e++;
  if (e <= s) return null;
  return {
    word: text.slice(s, e),
    range: {
      start: doc.positionAt(s),
      end: doc.positionAt(e),
    },
  };
}

