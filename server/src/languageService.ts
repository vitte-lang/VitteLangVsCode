/**
 * Vitte LSP — Language Service (complete minimal)
 * -----------------------------------------------
 * Diagnostics & completion without external parser, with configurable rules.
 * Pure TypeScript. API remains compatible with lsp.ts (doValidation, doComplete, doResolve).
 */

import type {
  Diagnostic,
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  InsertTextFormat,
} from 'vscode-languageserver/node';

// Lightweight TextDocument facade (subset used by TextDocuments())
export interface LspTextDocument {
  uri: string;
  getText(range?: { start: { line: number; character: number }; end: { line: number; character: number } }): string;
}

// ---------------------------------------------------------------------------
// Settings (lint/heuristics)
// ---------------------------------------------------------------------------

export interface VitteLintSettings {
  maxLineLength: number;            // warn if a line exceeds this many chars (0 to disable)
  warnTrailingWhitespace: boolean;  // highlight spaces/tabs at end of line
  hintTodoFixme: boolean;           // show TODO/FIXME/XXX as Hint
  warnMixedIndent: boolean;         // warn if both tabs and spaces are used for leading indent in file
}

const DEFAULT_SETTINGS: VitteLintSettings = {
  maxLineLength: 140,
  warnTrailingWhitespace: true,
  hintTodoFixme: true,
  warnMixedIndent: true,
};

// Small helpers
function hasTabsOnly(s: string): boolean { return /^\t+$/.test(s); }
function hasSpacesOnly(s: string): boolean { return /^ +$/.test(s); }

// ---------------------------------------------------------------------------
// Language Service
// ---------------------------------------------------------------------------

export class VitteLanguageService {
  private settings: VitteLintSettings;

  constructor(opts: Partial<VitteLintSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...opts };
  }

  /** Update settings at runtime without recreating the service. */
  setSettings(partial: Partial<VitteLintSettings>) {
    this.settings = { ...this.settings, ...partial };
  }

  /** Basic diagnostics: TODO/FIXME/XXX, long lines, trailing spaces, mixed indentation. */
  async doValidation(doc: LspTextDocument): Promise<Diagnostic[]> {
    const cfg = this.settings;
    const text = doc.getText();
    const diagnostics: Diagnostic[] = [];

    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let sawTabIndent = false;
    let sawSpaceIndent = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Leading indentation sampling for mixed‑indent detection
      const mIndent = /^(\s*)/.exec(line);
      if (mIndent) {
        const lead = mIndent[1];
        if (lead.length > 0) {
          // Only consider pure tab or pure space runs at the beginning
          if (hasTabsOnly(lead)) sawTabIndent = true; else if (hasSpacesOnly(lead)) sawSpaceIndent = true;
        }
      }

      // TODO/FIXME/XXX as Hint
      if (cfg.hintTodoFixme) {
        const m = /(TODO|FIXME|XXX)(:?)(.*)/.exec(line);
        if (m) {
          diagnostics.push({
            severity: 3 /* Hint */ as DiagnosticSeverity,
            message: `Note: ${m[1]}${m[2]}${m[3] ?? ''}`.trim(),
            range: { start: { line: i, character: m.index }, end: { line: i, character: m.index + m[0].length } },
            source: 'vitte-lsp',
            code: 'vitte.todofixme',
          });
        }
      }

      // Long line
      if (cfg.maxLineLength > 0 && line.length > cfg.maxLineLength) {
        diagnostics.push({
          severity: 2 /* Warning */ as DiagnosticSeverity,
          message: `Ligne trop longue (${line.length} > ${cfg.maxLineLength})`,
          range: { start: { line: i, character: cfg.maxLineLength }, end: { line: i, character: line.length } },
          source: 'vitte-lsp',
          code: 'vitte.maxLineLength',
        });
      }

      // Trailing whitespace
      if (cfg.warnTrailingWhitespace) {
        const tw = /(\s+)$/.exec(line);
        if (tw && tw[1].length > 0) {
          const start = line.length - tw[1].length;
          diagnostics.push({
            severity: 2 /* Warning */ as DiagnosticSeverity,
            message: 'Espace en fin de ligne',
            range: { start: { line: i, character: start }, end: { line: i, character: line.length } },
            source: 'vitte-lsp',
            code: 'vitte.trailingWhitespace',
          });
        }
      }
    }

    // Mixed indentation (file scope)
    if (cfg.warnMixedIndent && sawTabIndent && sawSpaceIndent) {
      diagnostics.push({
        severity: 2 /* Warning */ as DiagnosticSeverity,
        message: 'Indentation mixte détectée (tabs et espaces). Normalisez votre indentation.',
        range: { start: { line: 0, character: 0 }, end: { line: Math.max(0, lines.length - 1), character: 0 } },
        source: 'vitte-lsp',
        code: 'vitte.mixedIndent',
      });
    }

    return diagnostics;
  }

  /**
   * Completions: keywords + simple snippets for declarations.
   * We avoid context parsing; snippets are provided for productivity.
   */
  doComplete(_params: TextDocumentPositionParams): CompletionItem[] {
    const K = 14 as unknown as CompletionItemKind; // Keyword kind
    const Snip = 2 as unknown as InsertTextFormat; // Snippet

    const items: CompletionItem[] = [
      { label: 'fn', kind: K, detail: 'Déclaration de fonction', insertTextFormat: Snip, insertText: 'fn ${1:name}(${2:args}) {\n\t$0\n}' },
      { label: 'struct', kind: K, detail: 'Déclaration de structure', insertTextFormat: Snip, insertText: 'struct ${1:Name} {\n\t$0\n}' },
      { label: 'enum', kind: K, detail: 'Déclaration d’énumération', insertTextFormat: Snip, insertText: 'enum ${1:Name} {\n\t${2:Variant}\n}' },
      { label: 'trait', kind: K, detail: 'Trait / interface', insertTextFormat: Snip, insertText: 'trait ${1:Name} {\n\t$0\n}' },
      { label: 'impl', kind: K, detail: 'Bloc d’implémentation', insertTextFormat: Snip, insertText: 'impl ${1:Type} {\n\t$0\n}' },
      { label: 'let', kind: K, detail: 'Binding (variable)', insertTextFormat: Snip, insertText: 'let ${1:name} = ${2:value};' },
      { label: 'const', kind: K, detail: 'Constante', insertTextFormat: Snip, insertText: 'const ${1:NAME} = ${2:value};' },
      { label: 'return', kind: K, detail: 'Retour de fonction', insertTextFormat: Snip, insertText: 'return ${1:value};' },
      { label: 'match', kind: K, detail: 'Expression de correspondance', insertTextFormat: Snip, insertText: 'match ${1:expr} {\n\t${2:pattern} => ${3:result},\n}' },
      { label: 'if', kind: K, detail: 'Condition', insertTextFormat: Snip, insertText: 'if ${1:cond} {\n\t$0\n}' },
      { label: 'else', kind: K, detail: 'Alternative', insertTextFormat: Snip, insertText: 'else {\n\t$0\n}' },
      { label: 'while', kind: K, detail: 'Boucle while', insertTextFormat: Snip, insertText: 'while ${1:cond} {\n\t$0\n}' },
      { label: 'for', kind: K, detail: 'Boucle for', insertTextFormat: Snip, insertText: 'for ${1:item} in ${2:iter} {\n\t$0\n}' },
      { label: 'use', kind: K, detail: 'Import', insertTextFormat: Snip, insertText: 'use ${1:path};' },
      { label: 'mod', kind: K, detail: 'Module', insertTextFormat: Snip, insertText: 'mod ${1:name};' },
      { label: 'type', kind: K, detail: 'Alias de type', insertTextFormat: Snip, insertText: 'type ${1:Name} = ${2:Existing};' },
    ];
    return items;
  }

  /** Attach a bit more detail on resolve. */
  doResolve(item: CompletionItem): CompletionItem {
    const label = String(item.label);
    const extra = this._docFor(label);
    if (!item.detail) item.detail = extra.title;
    item.documentation = { kind: 'markdown', value: extra.markdown } as any;
    return item;
  }

  private _docFor(label: string): { title: string; markdown: string } {
    switch (label) {
      case 'fn': return { title: 'Déclaration de fonction', markdown: '**fn** — Déclare une fonction.\n\n```vitte\nfn name(args) {\n    // corps\n}\n```' };
      case 'struct': return { title: 'Déclaration de structure', markdown: '**struct** — Regroupe des champs.\n\n```vitte\nstruct Name {\n    field: Type\n}\n```' };
      case 'enum': return { title: 'Déclaration d’énumération', markdown: '**enum** — Variantes nommées.\n\n```vitte\nenum Name {\n    Variant\n}\n```' };
      case 'trait': return { title: 'Trait / interface', markdown: '**trait** — Contrat de méthodes.\n\n```vitte\ntrait Name {\n    fn method();\n}\n```' };
      case 'impl': return { title: 'Bloc d’implémentation', markdown: '**impl** — Implémente un trait ou des méthodes.\n\n```vitte\nimpl Type {\n    fn method() {}\n}\n```' };
      case 'let': return { title: 'Binding', markdown: '**let** — Nouveau binding.\n\n```vitte\nlet x = 1;\n```' };
      case 'const': return { title: 'Constante', markdown: '**const** — Valeur immuable.\n\n```vitte\nconst NAME = 1;\n```' };
      case 'match': return { title: 'Expression de correspondance', markdown: '**match** — Branches par motif.\n\n```vitte\nmatch x {\n    0 => 1,\n}\n```' };
      default: return { title: String(label), markdown: `**${label}**` };
    }
  }
}

export default VitteLanguageService;
