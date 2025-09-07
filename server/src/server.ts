/* Vitte/Vitl LSP — serveur compact et robuste */
import {
  createConnection, ProposedFeatures,
  InitializeParams, InitializeResult,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  CompletionItem, CompletionItemKind,
  Diagnostic, DiagnosticSeverity, DiagnosticTag,
  Position, Range, Location,
  SymbolKind, DocumentSymbol, WorkspaceFolder,
  SemanticTokensParams, SemanticTokensLegend, SemanticTokensBuilder,
  TextDocuments
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/* -------------------------------------------------------------------------- */
/* Connexion / Documents                                                      */
/* -------------------------------------------------------------------------- */

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

/** Anti-bruit: anti-revalidate per-doc */
const debounceTimers = new Map<string, NodeJS.Timeout>();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let workspaceFolders: WorkspaceFolder[] | null = null;

/* -------------------------------------------------------------------------- */
/* Réglages                                                                   */
/* -------------------------------------------------------------------------- */

interface ServerSettings {
  maxNumberOfProblems: number;
  lineLengthLimit: number;
  enableSemanticTokens: boolean;
}
const defaultSettings: ServerSettings = {
  maxNumberOfProblems: 200,
  lineLengthLimit: 120,
  enableSemanticTokens: true
};
/** Cache des réglages par (uri::section) pour vitte/vitl */
const documentSettings = new Map<string, Thenable<ServerSettings>>();

function sectionFor(doc: TextDocument): "vitte" | "vitl" {
  return doc.languageId === "vitl" ? "vitl" : "vitte";
}
function settingsKey(uri: string, section: string): string {
  return `${uri}::${section}`;
}
function getDocumentSettings(doc: TextDocument): Thenable<ServerSettings> {
  const section = sectionFor(doc);
  if (!hasConfigurationCapability) return Promise.resolve(defaultSettings);
  const key = settingsKey(doc.uri, section);
  let r = documentSettings.get(key);
  if (!r) {
    r = connection.workspace.getConfiguration({ scopeUri: doc.uri, section }) as Thenable<ServerSettings>;
    documentSettings.set(key, r);
  }
  return r;
}

/* -------------------------------------------------------------------------- */
/* Lint basique                                                               */
/* -------------------------------------------------------------------------- */

const DIAG_RE_TODO = /\b(TODO|FIXME)\b/g;
const DIAG_RE_QUESTION = /\?{3,}/g;
const DIAG_RE_TRAILING_WS = /[ \t]+$/;

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument);
  const lines = textDocument.getText().split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  let problems = 0;

  const pushDiag = (d: Diagnostic) => {
    diagnostics.push(d);
    problems++;
    return problems < settings.maxNumberOfProblems;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // TODO / FIXME
    for (const m of matchAllRx(DIAG_RE_TODO, line)) {
      const start = m.index ?? 0;
      if (!pushDiag({
        severity: DiagnosticSeverity.Warning,
        message: `Marqueur ${m[1]} détecté — à traiter.`,
        range: Range.create(Position.create(i, start), Position.create(i, start + m[1].length)),
        source: "vitte/vitl-lsp",
      })) break;
    }
    if (problems >= settings.maxNumberOfProblems) break;

    // "???"
    for (const m of matchAllRx(DIAG_RE_QUESTION, line)) {
      const start = m.index ?? 0;
      if (!pushDiag({
        severity: DiagnosticSeverity.Error,
        message: `Séquence "???" détectée — remplace par du vrai code ou un TODO.`,
        range: Range.create(Position.create(i, start), Position.create(i, start + m[0].length)),
        source: "vitte/vitl-lsp",
      })) break;
    }
    if (problems >= settings.maxNumberOfProblems) break;

    // Espaces fin de ligne
    const tw = line.match(DIAG_RE_TRAILING_WS) as (RegExpMatchArray & { index?: number }) | null;
    if (tw && (tw as any).index != null) {
      if (!pushDiag({
        severity: DiagnosticSeverity.Hint,
        message: "Espace(s) superflu(s) en fin de ligne.",
        range: Range.create(Position.create(i, (tw as any).index), Position.create(i, line.length)),
        source: "vitte/vitl-lsp",
        tags: [DiagnosticTag.Unnecessary],
      })) break;
    }
    if (problems >= settings.maxNumberOfProblems) break;

    // Ligne trop longue
    if (line.length > settings.lineLengthLimit) {
      pushDiag({
        severity: DiagnosticSeverity.Information,
        message: `Ligne longue (${line.length} > ${settings.lineLengthLimit}).`,
        range: Range.create(Position.create(i, settings.lineLengthLimit), Position.create(i, line.length)),
        source: "vitte/vitl-lsp",
      });
    }
    if (problems >= settings.maxNumberOfProblems) break;
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

/* -------------------------------------------------------------------------- */
/* Symboles / Complétion / Hover / Définitions                                */
/* -------------------------------------------------------------------------- */

const KEYWORDS = [
  // Vitte / Rust-like
  "module","use","pub","fn","struct","enum","trait","impl","let","const","mut",
  "match","if","else","while","for","loop","return",
  // Python-like
  "def","class","import","from","as","in","is","and","or","not","elif","try","except","finally",
  "with","yield","lambda","pass","global","nonlocal","assert","del","raise","await","async",
  // Go-like
  "package","interface","map","chan","go","defer","select","type","var","const","break","continue",
  "fallthrough","range","default","switch","case",
  // C/C++
  "int","float","double","char","short","long","signed","unsigned","void","bool","sizeof","typedef",
  "union","static","extern","inline","volatile","restrict","goto","register","do",
  // ASM
  "mov","add","sub","mul","div","inc","dec","cmp","jmp","je","jne","jg","jl","jge","jle",
  "push","pop","call","ret","lea","xor","shl","shr","nop",
  // Divers
  "true","false","null","nil","none","self","this","super","new","delete","catch","throw","throws",
  "export","namespace","using","override","virtual","abstract","extends","implements","operator",
  "template","constexpr","friend","static_cast","dynamic_cast","reinterpret_cast"
];

/** Mapping propre SymbolKind → CompletionItemKind */
function mapSymbolKindToCompletionItemKind(k: SymbolKind): CompletionItemKind {
  switch (k) {
    case SymbolKind.Function:  return CompletionItemKind.Function;
    case SymbolKind.Method:    return CompletionItemKind.Method;
    case SymbolKind.Struct:    return CompletionItemKind.Struct;
    case SymbolKind.Enum:      return CompletionItemKind.Enum;
    case SymbolKind.Interface: return CompletionItemKind.Interface;
    case SymbolKind.Namespace: return CompletionItemKind.Module;
    case SymbolKind.Class:     return CompletionItemKind.Class;
    case SymbolKind.Property:  return CompletionItemKind.Property;
    case SymbolKind.Variable:  return CompletionItemKind.Variable;
    case SymbolKind.Constant:  return CompletionItemKind.Constant;
    case SymbolKind.Module:    return CompletionItemKind.Module;
    case SymbolKind.Field:     return CompletionItemKind.Field;
    case SymbolKind.Constructor:return CompletionItemKind.Constructor;
    case SymbolKind.TypeParameter:return CompletionItemKind.TypeParameter;
    default:                   return CompletionItemKind.Text;
  }
}

connection.onCompletion((_params): CompletionItem[] => {
  const doc = documents.get(_params.textDocument.uri);
  const items: CompletionItem[] = [];

  for (const kw of KEYWORDS) {
    items.push({ label: kw, kind: CompletionItemKind.Keyword, detail: "mot-clé Vitte/Vitl" });
  }

  if (doc) {
    for (const s of extractSymbols(doc)) {
      items.push({
        label: s.name,
        kind: mapSymbolKindToCompletionItemKind(s.kind),
        detail: "symbole (doc)"
      });
    }
  }
  return items;
});

const HOVER_DOC: Record<string,string> = {
  mut: "Marque la mutabilité (autorise la modification).",
  def: "Définit une fonction (style Python).",
  class: "Définit une classe (style Python).",
  import: "Importe un module ou symbole.",
  from: "Importe depuis un module (Python).",
  lambda: "Fonction anonyme (Python).",
  await: "Attente asynchrone.",
  async: "Déclare un contexte asynchrone.",
  package: "Déclare le paquet courant (Go).",
  interface: "Déclare une interface (Go).",
  defer: "Diffère l’exécution jusqu’au retour (Go).",
  select: "Multiplexage de canaux (Go).",
  typedef: "Alias de type (C/C++).",
  sizeof: "Taille en octets d’un type/objet.",
  switch: "Sélection multi-branches.",
  case: "Branche d’un switch.",
  break: "Sort d’une boucle/switch.",
  continue: "Passe à l’itération suivante.",
  inline: "Suggestion d’inlining.",
  mov: "Copie registre/mémoire (ASM).",
  add: "Addition (ASM).",
  jmp: "Saut inconditionnel (ASM).",
  push: "Empile une valeur (ASM).",
  pop: "Dépile une valeur (ASM).",
  call: "Appel de sous-routine (ASM).",
  ret: "Retour de sous-routine (ASM).",
  module: "Déclare un module (espace de noms).",
  use: "Importe un symbole/module.",
  pub: "Rend public.",
  fn: "Déclare une fonction.",
  struct: "Type agrégé.",
  enum: "Énumération.",
  trait: "Interface de comportements.",
  impl: "Implémentation.",
  let: "Variable locale.",
  const: "Constante compile-time.",
  match: "Branchements par motifs.",
  if: "Conditionnelle.",
  else: "Alternative.",
  while: "Boucle conditionnelle.",
  for: "Boucle sur itérable.",
  loop: "Boucle infinie.",
  return: "Retour de fonction."
};

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = getWordAt(doc, params.position);
  if (!word) return null;
  const docstr = HOVER_DOC[word];
  if (!docstr) return null;
  return { contents: { kind: "markdown", value: `**${word}** — ${docstr}` } };
});

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;
  const word = getWordAt(doc, params.position);
  if (!word) return null;

  const reDefs = [
    new RegExp(`\\bfn\\s+${escapeRx(word)}\\b`),
    new RegExp(`\\bstruct\\s+${escapeRx(word)}\\b`),
    new RegExp(`\\benum\\s+${escapeRx(word)}\\b`),
    new RegExp(`\\btrait\\s+${escapeRx(word)}\\b`),
    new RegExp(`\\bmodule\\s+${escapeRx(word)}\\b`)
  ];

  const text = doc.getText();
  for (const rx of reDefs) {
    const m = rx.exec(text);
    if (m && m.index !== undefined) {
      const pos = doc.positionAt(m.index);
      return Location.create(doc.uri, Range.create(pos, pos));
    }
  }
  return null;
});

connection.onDocumentSymbol((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  return extractSymbols(doc);
});

function extractSymbols(doc: TextDocument): DocumentSymbol[] {
  const lines = doc.getText().split(/\r?\n/);
  const symbols: DocumentSymbol[] = [];
  const patterns: Array<[RegExp, SymbolKind, (m: RegExpMatchArray) => string]> = [
    [/^\s*module\s+([A-Za-z_]\w*)/g, SymbolKind.Namespace,  (m) => m[1]],
    [/^\s*fn\s+([A-Za-z_]\w*)/g,     SymbolKind.Function,   (m) => m[1]],
    [/^\s*struct\s+([A-Za-z_]\w*)/g, SymbolKind.Struct,     (m) => m[1]],
    [/^\s*enum\s+([A-Za-z_]\w*)/g,   SymbolKind.Enum,       (m) => m[1]],
    [/^\s*trait\s+([A-Za-z_]\w*)/g,  SymbolKind.Interface,  (m) => m[1]],
    [/^\s*let\s+([A-Za-z_]\w*)/g,    SymbolKind.Variable,   (m) => m[1]],
    [/^\s*const\s+([A-Za-z_]\w*)/g,  SymbolKind.Constant,   (m) => m[1]],
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const [rx, kind, nameSel] of patterns) {
      for (const m of matchAllRx(rx, line)) {
        const name = nameSel(m);
        const start = Position.create(i, m.index ?? 0);
        const end = Position.create(i, (m.index ?? 0) + m[0].length);
        symbols.push({
          name, kind,
          range: Range.create(start, end),
          selectionRange: Range.create(start, end),
          children: [],
        });
      }
    }
  }
  return symbols;
}

/* -------------------------------------------------------------------------- */
/* Semantic Tokens                                                            */
/* -------------------------------------------------------------------------- */

const TOKEN_TYPES = [
  "namespace","type","function","variable","parameter",
  "property","keyword","number","string","comment"
] as const;
const TOKEN_MODS: string[] = [];
const SEMANTIC_LEGEND: SemanticTokensLegend = {
  tokenTypes: Array.from(TOKEN_TYPES),
  tokenModifiers: TOKEN_MODS
};

const TOKEN_MAP = {
  namespace: TOKEN_TYPES.indexOf("namespace"),
  type:      TOKEN_TYPES.indexOf("type"),
  function:  TOKEN_TYPES.indexOf("function"),
  variable:  TOKEN_TYPES.indexOf("variable"),
  parameter: TOKEN_TYPES.indexOf("parameter"),
  property:  TOKEN_TYPES.indexOf("property"),
  keyword:   TOKEN_TYPES.indexOf("keyword"),
  number:    TOKEN_TYPES.indexOf("number"),
  string:    TOKEN_TYPES.indexOf("string"),
  comment:   TOKEN_TYPES.indexOf("comment"),
} as const;
function token(k: keyof typeof TOKEN_MAP): number { return TOKEN_MAP[k]; }

connection.languages.semanticTokens.on((params: SemanticTokensParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return { data: [] };

  const builder = new SemanticTokensBuilder();
  const lines = doc.getText().split(/\r?\n/);
  const NO_MOD = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Commentaires
    const cmt = line.indexOf("//");
    if (cmt >= 0) {
      builder.push(lineIdx, cmt, line.length - cmt, token("comment"), NO_MOD);
      continue;
    }

    // Strings
    for (const m of matchAllRx(/"([^"\\]|\\.)*"/g, line)) {
      builder.push(lineIdx, m.index, m[0].length, token("string"), NO_MOD);
    }

    // Nombres
    for (const m of matchAllRx(/\b\d(_?\d)*(\.\d(_?\d)*)?\b/g, line)) {
      builder.push(lineIdx, m.index, m[0].length, token("number"), NO_MOD);
    }

    // Mots-clés
    for (const kw of KEYWORDS) {
      for (const m of matchAllRx(new RegExp(`\\b${escapeRx(kw)}\\b`, "g"), line)) {
        builder.push(lineIdx, m.index, m[0].length, token("keyword"), NO_MOD);
      }
    }

    // Déclarations (colorer le nom uniquement)
    const decls: Array<[RegExp, keyof typeof TOKEN_MAP, 1 | 2]> = [
      [/^\s*module\s+([A-Za-z_]\w*)/g,      "namespace", 1],
      [/^\s*fn\s+([A-Za-z_]\w*)/g,          "function",  1],
      [/^\s*struct\s+([A-Za-z_]\w*)/g,      "type",      1],
      [/^\s*enum\s+([A-Za-z_]\w*)/g,        "type",      1],
      [/^\s*trait\s+([A-Za-z_]\w*)/g,       "type",      1],
      [/^\s*(let|const)\s+([A-Za-z_]\w*)/g, "variable",  2],
    ];
    for (const [rx, kind, group] of decls) {
      for (const m of matchAllRx(rx, line)) {
        const name = m[group];
        if (!name) continue;
        const start = line.indexOf(name, m.index ?? 0);
        if (start >= 0) builder.push(lineIdx, start, name.length, token(kind), NO_MOD);
      }
    }
  }

  return builder.build();
});

/* -------------------------------------------------------------------------- */
/* Initialisation / événements                                                 */
/* -------------------------------------------------------------------------- */

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const caps = params.capabilities;
  hasConfigurationCapability = !!(caps.workspace && caps.workspace.configuration);
  hasWorkspaceFolderCapability = !!(caps.workspace && caps.workspace.workspaceFolders);
  workspaceFolders = params.workspaceFolders ?? null;

  const init: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false, triggerCharacters: [".", ":", ">"] },
      hoverProvider: true,
      definitionProvider: true,
      documentSymbolProvider: true,
      semanticTokensProvider: { legend: SEMANTIC_LEGEND, full: true, range: false }
    }
  };
  if (hasWorkspaceFolderCapability) {
    init.capabilities.workspace = { workspaceFolders: { supported: true, changeNotifications: true } };
  }
  return init;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((e) => {
      workspaceFolders = e.added.length
        ? e.added
        : (workspaceFolders?.filter((wf) => !e.removed.find((r) => r.uri === wf.uri)) ?? null);
    });
  }
});

connection.onDidChangeConfiguration(() => {
  documentSettings.clear();
  // Revalider tous les documents ouverts après changement de conf
  for (const doc of documents.all()) {
    scheduleValidate(doc);
  }
});

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                 */
/* -------------------------------------------------------------------------- */

function scheduleValidate(doc: TextDocument, ms = 120): void {
  const key = doc.uri;
  const t = debounceTimers.get(key);
  if (t) clearTimeout(t);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      void validateTextDocument(doc);
    }, ms)
  );
}

function getWordAt(doc: TextDocument, pos: Position): string | null {
  const text = doc.getText();
  const offset = doc.offsetAt(pos);
  let start = offset, end = offset;
  while (start > 0 && /[\w_]/.test(text.charAt(start - 1))) start--;
  while (end < text.length && /[\w_]/.test(text.charAt(end))) end++;
  return end > start ? text.slice(start, end) : null;
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/
