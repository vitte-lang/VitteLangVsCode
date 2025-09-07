// completion.ts — complétions sans dépendance JS

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
  Range,
  SymbolKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/* --------------------------------- Mots-clés -------------------------------- */

const KEYWORDS: readonly string[] = [
  "module","import","use","as","pub","const","let","mut","fn",
  "return","if","else","match","while","for","in","break","continue",
  "type","impl","where","struct","mod","test","true","false",
];

/* --------------------------------- Snippets -------------------------------- */

const SNIPPETS: CompletionItem[] = [
  {
    label: "fn",
    kind: CompletionItemKind.Snippet,
    insertText: "fn ${1:name}(${2:params})${3: -> ${4:Type}} {\n\t$0\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Déclare une fonction",
    documentation: "Déclare une fonction avec paramètres et type de retour optionnel.",
    sortText: "3",
  },
  {
    label: "main",
    kind: CompletionItemKind.Snippet,
    insertText: "fn main() {\n\t$0\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Point d’entrée",
    documentation: "Déclare la fonction principale `main`.",
    sortText: "3",
  },
  {
    label: "struct",
    kind: CompletionItemKind.Snippet,
    insertText: "struct ${1:Name} {\n\t${2:field}: ${3:Type},\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Déclare une struct",
    documentation: "Déclare une structure avec des champs typés.",
    sortText: "3",
  },
  {
    label: "enum",
    kind: CompletionItemKind.Snippet,
    insertText: "enum ${1:Name} {\n\t${2:Variant1},\n\t${3:Variant2}\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Déclare une enum",
    documentation: "Déclare une énumération avec plusieurs variantes.",
    sortText: "3",
  },
  {
    label: "impl",
    kind: CompletionItemKind.Snippet,
    insertText: "impl ${1:Type} {\n\tfn ${2:new}(${3:args}) -> Self {\n\t\t$0\n\t}\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Impl bloc",
    documentation: "Implémente des méthodes pour un type donné.",
    sortText: "3",
  },
  {
    label: "match",
    kind: CompletionItemKind.Snippet,
    insertText: "match ${1:expr} {\n\t${2:Pattern} => ${3:expr},\n\t_ => ${0:default}\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Match expression",
    documentation: "Expression de branchement avec motifs.",
    sortText: "3",
  },
  {
    label: "ifelse",
    kind: CompletionItemKind.Snippet,
    insertText: "if ${1:cond} {\n\t${2}\n} else {\n\t${0}\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "If / Else",
    documentation: "Structure conditionnelle complète.",
    sortText: "3",
  },
  {
    label: "for",
    kind: CompletionItemKind.Snippet,
    insertText: "for ${1:item} in ${2:iter} {\n\t$0\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Boucle for",
    documentation: "Boucle for-in sur un itérable.",
    sortText: "3",
  },
  {
    label: "while",
    kind: CompletionItemKind.Snippet,
    insertText: "while ${1:cond} {\n\t$0\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Boucle while",
    documentation: "Boucle conditionnelle.",
    sortText: "3",
  },
  {
    label: "loop",
    kind: CompletionItemKind.Snippet,
    insertText: "loop {\n\t$0\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Boucle infinie",
    documentation: "Boucle sans fin avec `break` pour sortir.",
    sortText: "3",
  },
  {
    label: "print",
    kind: CompletionItemKind.Snippet,
    insertText: "println(\"${1:msg}\");",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Affichage console",
    documentation: "Affiche un message sur la sortie standard.",
    sortText: "3",
  },
  {
    label: "test",
    kind: CompletionItemKind.Snippet,
    insertText: "#[test]\nfn ${1:it_works}() {\n\t$0\n}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Test unitaire",
    documentation: "Déclare une fonction de test unitaire.",
    sortText: "3",
  },
  {
    label: "doc",
    kind: CompletionItemKind.Snippet,
    insertText: "/// ${1:Résumé}\n///\n/// ${0:Détails}",
    insertTextFormat: InsertTextFormat.Snippet,
    detail: "Commentaire doc",
    documentation: "Ajoute un commentaire de documentation triple-slash.",
    sortText: "3",
  },
];

/* ----------------------------- Libellés SymbolKind ----------------------------- */

const SYMBOL_KIND_LABEL: Record<number, string> = {
  [SymbolKind.File]: "File",
  [SymbolKind.Module]: "Module",
  [SymbolKind.Namespace]: "Namespace",
  [SymbolKind.Package]: "Package",
  [SymbolKind.Class]: "Class",
  [SymbolKind.Method]: "Method",
  [SymbolKind.Property]: "Property",
  [SymbolKind.Field]: "Field",
  [SymbolKind.Constructor]: "Constructor",
  [SymbolKind.Enum]: "Enum",
  [SymbolKind.Interface]: "Interface",
  [SymbolKind.Function]: "Function",
  [SymbolKind.Variable]: "Variable",
  [SymbolKind.Constant]: "Constant",
  [SymbolKind.String]: "String",
  [SymbolKind.Number]: "Number",
  [SymbolKind.Boolean]: "Boolean",
  [SymbolKind.Array]: "Array",
  [SymbolKind.Object]: "Object",
  [SymbolKind.Key]: "Key",
  [SymbolKind.Null]: "Null",
  [SymbolKind.EnumMember]: "EnumMember",
  [SymbolKind.Struct]: "Struct",
  [SymbolKind.Event]: "Event",
  [SymbolKind.Operator]: "Operator",
  [SymbolKind.TypeParameter]: "TypeParameter",
};

/* --------------------------- Symboles dynamiques --------------------------- */

interface ExtractedSym { name: string; kind: SymbolKind; }

function extractSymbols(doc: TextDocument): ExtractedSym[] {
  const text = doc.getText();
  const rules: Array<{ rx: RegExp; kind: SymbolKind; g: number }> = [
    { rx: /^\s*(?:module|mod)\s+([A-Za-z_]\w*)/gm, kind: SymbolKind.Namespace, g: 1 },
    { rx: /^\s*fn\s+([A-Za-z_]\w*)/gm,             kind: SymbolKind.Function,  g: 1 },
    { rx: /^\s*struct\s+([A-Za-z_]\w*)/gm,         kind: SymbolKind.Struct,    g: 1 },
    { rx: /^\s*enum\s+([A-Za-z_]\w*)/gm,           kind: SymbolKind.Enum,      g: 1 },
    { rx: /^\s*trait\s+([A-Za-z_]\w*)/gm,          kind: SymbolKind.Interface, g: 1 },
    { rx: /^\s*type\s+([A-Za-z_]\w*)/gm,           kind: SymbolKind.Interface, g: 1 },
    { rx: /^\s*let\s+(?:mut\s+)?([A-Za-z_]\w*)/gm, kind: SymbolKind.Variable,  g: 1 },
    { rx: /^\s*const\s+([A-Za-z_]\w*)/gm,          kind: SymbolKind.Constant,  g: 1 },
  ];

  const out: ExtractedSym[] = [];
  for (const { rx, kind, g } of rules) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const name = m[g];
      if (name) out.push({ name, kind });
      if (m[0].length === 0) rx.lastIndex++;
    }
  }

  // déduplication
  const seen = new Set<string>();
  return out.filter(s => {
    const k = `${s.kind}:${s.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mapSymbolKindToCompletionKind(k: SymbolKind): CompletionItemKind {
  switch (k) {
    case SymbolKind.Function:     return CompletionItemKind.Function;
    case SymbolKind.Method:       return CompletionItemKind.Method;
    case SymbolKind.Struct:       return CompletionItemKind.Struct;
    case SymbolKind.Enum:         return CompletionItemKind.Enum;
    case SymbolKind.Interface:    return CompletionItemKind.Interface;
    case SymbolKind.Namespace:    return CompletionItemKind.Module;
    case SymbolKind.Class:        return CompletionItemKind.Class;
    case SymbolKind.Property:     return CompletionItemKind.Property;
    case SymbolKind.Field:        return CompletionItemKind.Field;
    case SymbolKind.Variable:     return CompletionItemKind.Variable;
    case SymbolKind.Constant:     return CompletionItemKind.Constant;
    case SymbolKind.Constructor:  return CompletionItemKind.Constructor;
    case SymbolKind.TypeParameter:return CompletionItemKind.TypeParameter;
    default:                      return CompletionItemKind.Text;
  }
}

/* --------------------- Diagnostics → complétions contextuelles ------------- */

function diagnosticsCompletion(linePrefix: string): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (linePrefix.includes("???")) {
    items.push({
      label: "TODO",
      kind: CompletionItemKind.Text,
      insertText: "TODO",
      detail: "Remplacer ??? par TODO",
      documentation: "Transforme la séquence ??? en TODO/FIXME.",
      sortText: "0",
    });
  }
  if (/\/\/\s*TODO/.test(linePrefix)) {
    items.push({
      label: "FIXME",
      kind: CompletionItemKind.Text,
      insertText: "FIXME",
      detail: "Alternative à TODO",
      documentation: "Indique un correctif nécessaire.",
      sortText: "0",
    });
  }
  return items;
}

/* ---------------------------------- API ----------------------------------- */

export function provideCompletions(doc: TextDocument, position: Position): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Mots-clés
  for (const kw of KEYWORDS) {
    items.push({
      label: kw,
      kind: CompletionItemKind.Keyword,
      detail: "Mot-clé",
      documentation: `Mot-clé du langage : \`${kw}\`.`,
      sortText: "2",
    });
  }

  // Snippets
  items.push(...SNIPPETS);

  // Symboles du document
  for (const s of extractSymbols(doc)) {
    items.push({
      label: s.name,
      kind: mapSymbolKindToCompletionKind(s.kind),
      detail: `Symbole (${SYMBOL_KIND_LABEL[s.kind] ?? "?"})`,
      documentation: "Déclaré dans ce document.",
      sortText: "1",
    });
  }

  // Propositions liées à la ligne courante
  const linePrefix = doc.getText(Range.create(
    { line: position.line, character: 0 },
    { line: position.line, character: position.character }
  ));
  items.push(...diagnosticsCompletion(linePrefix));

  return items;
}
