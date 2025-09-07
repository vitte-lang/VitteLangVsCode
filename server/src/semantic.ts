// semantic.ts — simple et robuste

import {
  Position,
  Hover,
  MarkupKind,
  SemanticTokensLegend,
  SemanticTokensBuilder,
  SemanticTokens,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/* ------------------------------ Legend stable ----------------------------- */
/* Garder l’ordre en phase avec server.ts */
const TOKEN_TYPES = [
  "namespace", // 0
  "type",      // 1
  "function",  // 2
  "variable",  // 3
  "parameter", // 4
  "property",  // 5
  "keyword",   // 6
  "number",    // 7
  "string",    // 8
  "comment",   // 9
] as const;

const TOKEN_MODIFIERS: string[] = [];

const TYPE_INDEX = {
  namespace: 0,
  type: 1,
  function: 2,
  variable: 3,
  parameter: 4,
  property: 5,
  keyword: 6,
  number: 7,
  string: 8,
  comment: 9,
} as const;

export function getSemanticTokensLegend(): SemanticTokensLegend {
  return { tokenTypes: Array.from(TOKEN_TYPES), tokenModifiers: TOKEN_MODIFIERS };
}

/* --------------------------------- Hover ---------------------------------- */

const HOVER_DOC: Record<string, string> = {
  module: "Déclare un module.",
  import: "Importe un chemin.",
  use: "Rend un symbole accessible dans le scope courant.",
  as: "Alias de symbole.",
  pub: "Visibilité publique.",
  const: "Constante compile-time.",
  let: "Déclare une variable locale.",
  mut: "Rend la variable mutable.",
  fn: "Déclare une fonction.",
  struct: "Déclare une structure.",
  enum: "Déclare une énumération.",
  impl: "Bloc d’implémentation.",
  type: "Alias de type.",
  where: "Contraintes de type.",
  if: "Conditionnelle.",
  else: "Branche alternative.",
  match: "Branchements par motifs.",
  while: "Boucle conditionnelle.",
  for: "Boucle itérative.",
  in: "Itération sur une séquence.",
  break: "Interrompt une boucle.",
  continue: "Passe à l’itération suivante.",
  return: "Retourne depuis une fonction.",
  true: "Booléen vrai.",
  false: "Booléen faux.",
};

export function provideHover(doc: TextDocument, position: Position): Hover | null {
  const w = wordAt(doc, position);
  if (!w) return null;
  const info = HOVER_DOC[w];
  if (!info) return null;
  return { contents: { kind: MarkupKind.Markdown, value: `**${w}** — ${info}` } };
}

function wordAt(doc: TextDocument, pos: Position): string | null {
  const text = doc.getText();
  const off = doc.offsetAt(pos);
  let s = off, e = off;
  while (s > 0 && /[A-Za-z0-9_]/.test(text.charAt(s - 1))) s--;
  while (e < text.length && /[A-Za-z0-9_]/.test(text.charAt(e))) e++;
  return e > s ? text.slice(s, e) : null;
}

/* --------------------------- Semantic tokeniser --------------------------- */

const KW = new Set([
  "module","import","use","as","pub","const","let","mut","fn","return",
  "if","else","match","while","for","in","break","continue",
  "type","impl","where","struct","mod","test","true","false",
]);

export function buildSemanticTokens(doc: TextDocument): SemanticTokens {
  const builder = new SemanticTokensBuilder();
  const lines = doc.getText().split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // commentaires //
    const cmt = line.indexOf("//");
    if (cmt >= 0) {
      builder.push(lineIdx, cmt, line.length - cmt, TYPE_INDEX.comment, 0);
      // continue; // on sort tôt pour la simplicité
      continue;
    }

    // chaînes "..."
    for (const m of matchAll(/"([^"\\]|\\.)*"/g, line)) {
      builder.push(lineIdx, m.index, m[0].length, TYPE_INDEX.string, 0);
    }

    // nombres décimaux/float
    for (const m of matchAll(/\b\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d+)?\b/g, line)) {
      builder.push(lineIdx, m.index, m[0].length, TYPE_INDEX.number, 0);
    }

    // mots-clés
    for (const m of matchAll(/\b[A-Za-z_]\w*\b/g, line)) {
      if (KW.has(m[0])) {
        builder.push(lineIdx, m.index, m[0].length, TYPE_INDEX.keyword, 0);
      }
    }

    // déclarations: colorer uniquement le nom
    colorDecl(builder, lineIdx, line, /^\s*(?:module|mod)\s+([A-Za-z_]\w*)/g, TYPE_INDEX.namespace, 1);
    colorDecl(builder, lineIdx, line, /^\s*struct\s+([A-Za-z_]\w*)/g, TYPE_INDEX.type, 1);
    colorDecl(builder, lineIdx, line, /^\s*enum\s+([A-Za-z_]\w*)/g, TYPE_INDEX.type, 1);
    colorDecl(builder, lineIdx, line, /^\s*type\s+([A-Za-z_]\w*)/g, TYPE_INDEX.type, 1);
    colorDecl(builder, lineIdx, line, /^\s*fn\s+([A-Za-z_]\w*)/g, TYPE_INDEX.function, 1);
    colorDecl(builder, lineIdx, line, /^\s*(?:let|const)\s+(?:mut\s+)?([A-Za-z_]\w*)/g, TYPE_INDEX.variable, 1);
  }

  return builder.build();
}

/* --------------------------------- utils ---------------------------------- */

function colorDecl(
  builder: SemanticTokensBuilder,
  lineIdx: number,
  line: string,
  rx: RegExp,
  tokenTypeIndex: number,
  group: number
) {
  rx.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(line))) {
    const name = m[group];
    if (!name) continue;
    const start = (m.index ?? 0) + m[0].indexOf(name);
    builder.push(lineIdx, start, name.length, tokenTypeIndex, 0);
    if (m[0].length === 0) rx.lastIndex++;
  }
}

function* matchAll(rx: RegExp, s: string): Generator<RegExpMatchArray & { index: number }> {
  const r = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(s))) {
    const arr = m as RegExpMatchArray & { index: number };
    arr.index = m.index ?? 0;
    if (m[0].length === 0) r.lastIndex++;
    yield arr;
  }
}
