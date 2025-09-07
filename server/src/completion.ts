import {
  CompletionItemKind,
  Position,
  Range
} from "vscode-languageserver/node";

import { extractSymbols } from "./symbols.js";

/* -------------------------------------------------------------------------- */
/* Mots-clés                                                                   */
/* -------------------------------------------------------------------------- */

const KEYWORDS = [
  "module","import","use","as","pub","const","let","mut","fn",
  "return","if","else","match","while","for","in","break","continue",
  "type","impl","where","struct","mod","test","true","false"
];

/* -------------------------------------------------------------------------- */
/* Snippets                                                                    */
/* -------------------------------------------------------------------------- */

const SNIPPETS = [
  {
    label: "fn",
    kind: CompletionItemKind.Snippet,
    insertText: "fn ${1:name}(${2:params})${3: -> ${4:Type}} {\n\t$0\n}",
    insertTextFormat: 2,
    detail: "Déclare une fonction",
    documentation: "Déclare une fonction avec paramètres et type de retour optionnel."
  },
  {
    label: "main",
    kind: CompletionItemKind.Snippet,
    insertText: "fn main() {\n\t$0\n}",
    insertTextFormat: 2,
    detail: "Point d’entrée",
    documentation: "Déclare la fonction principale `main`."
  },
  {
    label: "struct",
    kind: CompletionItemKind.Snippet,
    insertText: "struct ${1:Name} {\n\t${2:field}: ${3:Type},\n}",
    insertTextFormat: 2,
    detail: "Déclare une struct",
    documentation: "Déclare une structure avec des champs typés."
  },
  {
    label: "enum",
    kind: CompletionItemKind.Snippet,
    insertText: "enum ${1:Name} {\n\t${2:Variant1},\n\t${3:Variant2}\n}",
    insertTextFormat: 2,
    detail: "Déclare une enum",
    documentation: "Déclare une énumération avec plusieurs variantes."
  },
  {
    label: "impl",
    kind: CompletionItemKind.Snippet,
    insertText: "impl ${1:Type} {\n\tfn ${2:new}(${3:args}) -> Self {\n\t\t$0\n\t}\n}",
    insertTextFormat: 2,
    detail: "Impl bloc",
    documentation: "Implémente des méthodes pour un type donné."
  },
  {
    label: "match",
    kind: CompletionItemKind.Snippet,
    insertText: "match ${1:expr} {\n\t${2:Pattern} => ${3:expr},\n\t_ => ${0:default}\n}",
    insertTextFormat: 2,
    detail: "Match expression",
    documentation: "Expression de branchement avec motifs."
  },
  {
    label: "ifelse",
    kind: CompletionItemKind.Snippet,
    insertText: "if ${1:cond} {\n\t${2}\n} else {\n\t${0}\n}",
    insertTextFormat: 2,
    detail: "If / Else",
    documentation: "Structure conditionnelle complète."
  },
  {
    label: "for",
    kind: CompletionItemKind.Snippet,
    insertText: "for ${1:item} in ${2:iter} {\n\t$0\n}",
    insertTextFormat: 2,
    detail: "Boucle for",
    documentation: "Boucle for-in sur un itérable."
  },
  {
    label: "while",
    kind: CompletionItemKind.Snippet,
    insertText: "while ${1:cond} {\n\t$0\n}",
    insertTextFormat: 2,
    detail: "Boucle while",
    documentation: "Boucle conditionnelle."
  },
  {
    label: "loop",
    kind: CompletionItemKind.Snippet,
    insertText: "loop {\n\t$0\n}",
    insertTextFormat: 2,
    detail: "Boucle infinie",
    documentation: "Boucle sans fin avec `break` pour sortir."
  },
  {
    label: "print",
    kind: CompletionItemKind.Snippet,
    insertText: "println(\"${1:msg}\");",
    insertTextFormat: 2,
    detail: "Affichage console",
    documentation: "Affiche un message sur la sortie standard."
  },
  {
    label: "test",
    kind: CompletionItemKind.Snippet,
    insertText: "#[test]\nfn ${1:it_works}() {\n\t$0\n}",
    insertTextFormat: 2,
    detail: "Test unitaire",
    documentation: "Déclare une fonction de test unitaire."
  },
  {
    label: "doc",
    kind: CompletionItemKind.Snippet,
    insertText: "/// ${1:Résumé}\n///\n/// ${0:Détails}",
    insertTextFormat: 2,
    detail: "Commentaire doc",
    documentation: "Ajoute un commentaire de documentation triple-slash."
  }
];

/* -------------------------------------------------------------------------- */
/* Symboles dynamiques                                                         */
/* -------------------------------------------------------------------------- */

function documentSymbolsCompletion(doc) {
  const items = [];
  for (const sym of extractSymbols(doc)) {
    items.push({
      label: sym.name,
      kind: mapSymbolKindToCompletionKind(sym.kind),
      detail: `Symbole (${sym.kind})`,
      documentation: "Déclaré dans ce document.",
      sortText: "1"
    });
  }
  return items;
}

function mapSymbolKindToCompletionKind(k) {
  switch (k) {
    case 12: return CompletionItemKind.Function;
    case 6:  return CompletionItemKind.Method;
    case 23: return CompletionItemKind.Struct;
    case 13: return CompletionItemKind.Enum;
    case 11: return CompletionItemKind.Interface;
    case 3:  return CompletionItemKind.Module;
    case 5:  return CompletionItemKind.Class;
    case 7:  return CompletionItemKind.Property;
    case 21: return CompletionItemKind.Constant; // corrigé: Constant
    case 6:  return CompletionItemKind.Variable; // fallback si votre enum interne = 6
    default: return CompletionItemKind.Text;
  }
}

/* -------------------------------------------------------------------------- */
/* Diagnostics → propositions de corrections                                  */
/* -------------------------------------------------------------------------- */

function diagnosticsCompletion(line) {
  const items = [];
  if (line.includes("???")) {
    items.push({
      label: "TODO",
      kind: CompletionItemKind.Text,
      insertText: "TODO",
      detail: "Remplacer ??? par TODO",
      documentation: "Transforme la séquence ??? en TODO/FIXME.",
      sortText: "0"
    });
  }
  if (/\/\/\s*TODO/.test(line)) {
    items.push({
      label: "FIXME",
      kind: CompletionItemKind.Text,
      insertText: "FIXME",
      detail: "Alternative à TODO",
      documentation: "Indique un correctif nécessaire."
    });
  }
  return items;
}

/* -------------------------------------------------------------------------- */
/* API principale                                                              */
/* -------------------------------------------------------------------------- */

export function provideCompletions(doc, position) {
  const items = [];

  for (const kw of KEYWORDS) {
    items.push({
      label: kw,
      kind: CompletionItemKind.Keyword,
      detail: "Mot-clé Vitte/Vitl",
      documentation: `Mot-clé du langage : \`${kw}\`.`,
      sortText: "2"
    });
  }

  items.push(...SNIPPETS.map(s => ({ ...s, sortText: "3" })));

  items.push(...documentSymbolsCompletion(doc));

  const line = doc.getText(Range.create(
    Position.create(position.line, 0),
    Position.create(position.line, position.character)
  ));
  items.push(...diagnosticsCompletion(line));

  return items;
}

