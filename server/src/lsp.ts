/**
 * Vitte LSP — Main Server (synchronized)
 * --------------------------------------
 * Unified LSP server aligned with the updated config/logger/utils/languageService modules.
 */

import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocuments,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  Range,
  TextEdit,
  DocumentFormattingParams,
  DocumentRangeFormattingParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import Config, { defaultFormatting } from './config';
import { logLsp, attachConnection } from './logger';
import { VitteLanguageService } from './languageService';
import { registerCommands, buildExecuteCommandProvider } from './commands';
import { provideHover } from '../features/hover';
import { legend as semanticLegend, tokenize as semanticTokenize } from '../features/semanticTokens';
import { registerDiagnostics as registerDiagnosticsFeature } from '../features/diagnostics';
import { registerCompletion } from '../features/completion';
import {
  normalizeIndentation,
  computeMinimalSmartEdits,
  expandSelectionToEnclosingBrackets,
} from './utils/text';

// ---------------------------------------------------------------------------
// Connection & documents
// ---------------------------------------------------------------------------

export const connection = createConnection(ProposedFeatures.all);
attachConnection(connection);
logLsp.info('Vitte LSP: connection created');

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const lang = new VitteLanguageService();
// Register completion feature (keywords + snippets)
registerCompletion(connection as any, documents as any);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

// ---------------------------------------------------------------------------
// Initialize / Initialized
// ---------------------------------------------------------------------------

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const caps = Config.initConfigFromInitialize(params);
  hasConfigurationCapability = caps.hasConfigurationCapability;
  hasWorkspaceFolderCapability = caps.hasWorkspaceFolderCapability;

  logLsp.info('Vitte LSP: initializing', caps);

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // We provide completion via VitteLanguageService (with resolve)
      completionProvider: { resolveProvider: true, triggerCharacters: ['.', ':', '>'] },
      // Formatting endpoints are exposed via custom requests below
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      executeCommandProvider: buildExecuteCommandProvider(),
      semanticTokensProvider: {
        legend: semanticLegend,
        full: true,
        range: false,
      } as any,
    },
  };

  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: { supported: true, changeNotifications: true },
    };
  }

  return result;
});

connection.onInitialized(() => {
  logLsp.info('Vitte LSP: initialized');
  // Register LSP executeCommand handlers
  try { registerCommands(connection); } catch {}
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
    logLsp.debug('Registered DidChangeConfiguration');
  }
  // Wire advanced diagnostics feature (debounced publication)
  try { registerDiagnosticsFeature(connection as any, documents as any); } catch (e) { logLsp.warn('Diagnostics feature wiring failed', String(e)); }
});

// ---------------------------------------------------------------------------
// Configuration changes → clear settings & revalidate
// ---------------------------------------------------------------------------

connection.onDidChangeConfiguration(
  Config.makeOnDidChangeConfigurationHandler(connection, {
    getOpenDocuments: () => documents.all(),
    validateDocument: async (doc) => {
      try {
        const diagnostics = await lang.doValidation(doc as any);
        connection.sendDiagnostics({ uri: (doc as any).uri, diagnostics });
      } catch (e) {
        logLsp.warn('Validation error after config change', { uri: (doc as any).uri, error: String(e) });
      }
    },
  })
);

// Diagnostics are handled by server/features/diagnostics.ts

// Completion is handled by features/completion.ts

// ---------------------------------------------------------------------------
// Hover (features/hover)
// ---------------------------------------------------------------------------

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const ctx = { uri: params.textDocument.uri, text: doc.getText(), line: params.position.line, character: params.position.character };
  const h = provideHover(ctx);
  if (!h) return null;
  return { contents: h.contents as any, range: h.range as any };
});

// ---------------------------------------------------------------------------
// Semantic Tokens (features/semanticTokens)
// ---------------------------------------------------------------------------

connection.onRequest('textDocument/semanticTokens/full', (params: any) => {
  const doc = documents.get(params?.textDocument?.uri);
  if (!doc) return { data: [] };
  try { return semanticTokenize(doc.getText()); } catch { return { data: [] }; }
});

// ---------------------------------------------------------------------------
// Formatting (document, range, documentOrRange)
// ---------------------------------------------------------------------------

// Standard LSP handlers
connection.onDocumentFormatting(async (params: DocumentFormattingParams): Promise<TextEdit[]> => {
  const uri = params.textDocument.uri;
  const doc = documents.get(uri);
  if (!doc) return [];
  let opts;
  try { opts = await Config.getFormattingSettings(connection, uri); } catch { opts = defaultFormatting; }
  const original = doc.getText();
  const pre = normalizeIndentation(original, opts.insertSpaces, opts.tabSize);
  const formatted = formatText(pre, opts);
  const edits = computeMinimalSmartEdits(original, formatted);
  return edits.map((e) => ({ range: e.range as Range, newText: e.newText } as TextEdit));
});

connection.onDocumentRangeFormatting(async (params: DocumentRangeFormattingParams): Promise<TextEdit[]> => {
  const uri = params.textDocument.uri;
  const doc = documents.get(uri);
  if (!doc) return [];
  let opts;
  try { opts = await Config.getFormattingSettings(connection, uri); } catch { opts = defaultFormatting; }
  const start = doc.offsetAt(params.range.start);
  const end = doc.offsetAt(params.range.end);
  const original = doc.getText();
  const fragment = original.slice(start, end);
  const fragmentNorm = normalizeIndentation(fragment, opts.insertSpaces, opts.tabSize);
  const formatted = formatText(fragmentNorm, opts, /*isFragment*/ true);
  if (formatted === fragment) return [];
  return [{ range: params.range as Range, newText: formatted }];
});

connection.onRequest('vitte/formatDocument', async (params: any) => {
  const uri: string = params?.textDocument?.uri;
  const doc = documents.get(uri);
  if (!doc) return [];

  let opts;
  try {
    opts = await Config.getFormattingSettings(connection, uri);
  } catch {
    opts = defaultFormatting;
  }
  const original = doc.getText();

  // Normalize indentation quickly before running formatter logic
  const pre = normalizeIndentation(original, opts.insertSpaces, opts.tabSize);
  const formatted = formatText(pre, opts);

  // Return minimal edits
  const edits = computeMinimalSmartEdits(original, formatted);
  logLsp.info('Formatter produced edit(s)', { uri, edits: edits.length });
  return edits.map((e) => ({ range: e.range as Range, newText: e.newText }));
});

connection.onRequest('vitte/formatRange', async (params: any) => {
  const uri: string = params?.textDocument?.uri;
  const doc = documents.get(uri);
  if (!doc) return [];

  const lspRange = params?.range as Range | undefined;
  if (!lspRange) return [];

  let opts;
  try {
    opts = await Config.getFormattingSettings(connection, uri);
  } catch {
    opts = defaultFormatting;
  }
  const start = doc.offsetAt(lspRange.start);
  const end = doc.offsetAt(lspRange.end);

  const text = doc.getText();
  const target = text.slice(start, end);

  const targetNorm = normalizeIndentation(target, opts.insertSpaces, opts.tabSize);
  const formattedTarget = formatText(targetNorm, opts, /*isFragment*/ true);

  if (formattedTarget === target) return [];
  return [{ range: lspRange, newText: formattedTarget }];
});

connection.onRequest('vitte/formatDocumentOrRange', async (params: any) => {
  const uri: string = params?.textDocument?.uri;
  const doc = documents.get(uri);
  if (!doc) return [];

  let opts;
  try {
    opts = await Config.getFormattingSettings(connection, uri);
  } catch {
    opts = defaultFormatting;
  }
  const lspRange = params?.range as Range | undefined;
  const original = doc.getText();

  if (!lspRange) {
    const pre = normalizeIndentation(original, opts.insertSpaces, opts.tabSize);
    const formatted = formatText(pre, opts);
    const edits = computeMinimalSmartEdits(original, formatted);
    return edits.map((e) => ({ range: e.range as Range, newText: e.newText }));
  } else {
    const start = doc.offsetAt(lspRange.start);
    const end = doc.offsetAt(lspRange.end);
    const fragment = original.slice(start, end);
    const fragmentNorm = normalizeIndentation(fragment, opts.insertSpaces, opts.tabSize);
    const formattedFragment = formatText(fragmentNorm, opts, /*isFragment*/ true);
    if (formattedFragment === fragment) return [];
    return [{ range: lspRange, newText: formattedFragment }];
  }
});

// ---------------------------------------------------------------------------
// Extra: expand selection to enclosing brackets
// ---------------------------------------------------------------------------

connection.onRequest('vitte/expandSelectionToEnclosingBrackets', (params: { textDocument: { uri: string }; position: { line: number; character: number } }) => {
  const uri = params?.textDocument?.uri;
  const doc = documents.get(uri);
  if (!doc) return null;
  const text = doc.getText();
  const range = expandSelectionToEnclosingBrackets(text, params.position);
  return range ?? null;
});

// ---------------------------------------------------------------------------
// Basic formatter (whitespace + EOL policy) — deterministic & quick
// ---------------------------------------------------------------------------

function normalizeEol(text: string, eol: 'lf' | 'crlf' | 'auto'): string {
  if (eol === 'auto') return text;
  if (eol === 'crlf') return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  return text.replace(/\r\n/g, '\n');
}

function applyWhitespacePolicy(lines: string[], opts: { tabSize: number; insertSpaces: boolean; trimTrailingWhitespace: boolean; }): string[] {
  const unit = opts.insertSpaces ? ' '.repeat(Math.max(1, opts.tabSize)) : '\t';
  return lines.map((line) => {
    if (opts.insertSpaces) {
      const leading = line.match(/^\t+/)?.[0] ?? '';
      if (leading.length > 0) line = leading.split('').map(() => unit).join('') + line.slice(leading.length);
    } else {
      const re = new RegExp(`^(?: {${opts.tabSize}})+`);
      const m = line.match(re);
      if (m) { const spaces = m[0].length; const tabs = Math.floor(spaces / opts.tabSize); line = '\t'.repeat(tabs) + line.slice(spaces); }
    }
    if (opts.trimTrailingWhitespace) line = line.replace(/[ \t]+$/g, '');
    return line;
  });
}

function formatText(text: string, opts: { tabSize: number; insertSpaces: boolean; trimTrailingWhitespace: boolean; insertFinalNewline: boolean; eol: 'lf'|'crlf'|'auto' }, isFragment = false): string {
  let work = text.replace(/\r\n/g, '\n');
  let lines = work.split('\n');
  lines = applyWhitespacePolicy(lines, opts);
  work = lines.join('\n');
  work = normalizeEol(work, opts.eol);
  if (!isFragment && opts.insertFinalNewline) {
    const term = opts.eol === 'crlf' ? '\r\n' : '\n';
    if (!work.endsWith(term)) work += term;
  }
  return work;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

documents.listen(connection);
connection.listen();
logLsp.info('Vitte LSP: listening');
