// navigation.ts — symboles, définitions, références, rename, workspace symbols

import {
  Position,
  Range,
  Location,
  DocumentSymbol,
  SymbolKind,
  WorkspaceSymbol,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

/* ------------------------------ Extraction base ------------------------------ */

interface FlatSymbol {
  name: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
}

const RULES: Array<{ rx: RegExp; kind: SymbolKind; nameGroup: number }> = [
  { rx: /^\s*(?:module|mod)\s+([A-Za-z_]\w*)/gm, kind: SymbolKind.Namespace, nameGroup: 1 },
  { rx: /^\s*fn\s+([A-Za-z_]\w*)/gm,             kind: SymbolKind.Function,  nameGroup: 1 },
  { rx: /^\s*struct\s+([A-Za-z_]\w*)/gm,         kind: SymbolKind.Struct,    nameGroup: 1 },
  { rx: /^\s*enum\s+([A-Za-z_]\w*)/gm,           kind: SymbolKind.Enum,      nameGroup: 1 },
  { rx: /^\s*trait\s+([A-Za-z_]\w*)/gm,          kind: SymbolKind.Interface, nameGroup: 1 },
  { rx: /^\s*type\s+([A-Za-z_]\w*)/gm,           kind: SymbolKind.Interface, nameGroup: 1 },
  { rx: /^\s*let\s+(?:mut\s+)?([A-Za-z_]\w*)/gm, kind: SymbolKind.Variable,  nameGroup: 1 },
  { rx: /^\s*const\s+([A-Za-z_]\w*)/gm,          kind: SymbolKind.Constant,  nameGroup: 1 },
];

function collectFlatSymbols(doc: TextDocument): FlatSymbol[] {
  const text = doc.getText();
  const out: FlatSymbol[] = [];

  for (const { rx, kind, nameGroup } of RULES) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const name = m[nameGroup];
      if (!name) continue;
      const start = doc.positionAt(m.index ?? 0);
      const end = doc.positionAt((m.index ?? 0) + m[0].length);
      const nameOffset = (m.index ?? 0) + m[0].indexOf(name);
      const nameStart = doc.positionAt(nameOffset);
      const nameEnd = doc.positionAt(nameOffset + name.length);
      out.push({
        name,
        kind,
        range: Range.create(start, end),
        selectionRange: Range.create(nameStart, nameEnd),
      });
      if (m[0].length === 0) rx.lastIndex++;
    }
  }
  return dedupeBy(out, s => `${s.kind}:${s.name}:${posKey(s.selectionRange.start)}`);
}

/* --------------------------------- API doc --------------------------------- */

export function documentSymbols(doc: TextDocument): DocumentSymbol[] {
  return collectFlatSymbols(doc).map(s => ({
    name: s.name,
    kind: s.kind,
    range: s.range,
    selectionRange: s.selectionRange,
    children: [],
  }));
}

export function symbolOutline(doc: TextDocument): DocumentSymbol[] {
  return documentSymbols(doc);
}

/* --------------------------- Définitions / refs ---------------------------- */

export function definitionAtPosition(doc: TextDocument, pos: Position, uri: string): Location[] {
  const word = wordAt(doc, pos);
  if (!word) return [];
  const defs = collectFlatSymbols(doc).filter(s => s.name === word);
  return defs.map(d => Location.create(uri, d.selectionRange));
}

export function referencesAtPosition(doc: TextDocument, pos: Position, uri: string): Location[] {
  const word = wordAt(doc, pos);
  if (!word) return [];
  const re = new RegExp(`\\b${escapeRx(word)}\\b`, "g");
  const text = doc.getText();
  const out: Location[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = doc.positionAt(m.index ?? 0);
    const end = doc.positionAt((m.index ?? 0) + m[0].length);
    out.push(Location.create(uri, Range.create(start, end)));
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

/* --------------------------------- Rename ---------------------------------- */

export function renameSymbol(doc: TextDocument, pos: Position, newName: string): Array<{ range: Range; newText: string }> {
  const old = wordAt(doc, pos);
  if (!old || !isValidIdent(newName)) return [];
  const re = new RegExp(`\\b${escapeRx(old)}\\b`, "g");
  const text = doc.getText();
  const edits: Array<{ range: Range; newText: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = doc.positionAt(m.index ?? 0);
    const end = doc.positionAt((m.index ?? 0) + m[0].length);
    edits.push({ range: Range.create(start, end), newText: newName });
    if (m[0].length === 0) re.lastIndex++;
  }
  return edits;
}

/* ----------------------------- Workspace symbols --------------------------- */

export function workspaceSymbols(
  query: string,
  openDocs: Array<{ uri: string; doc: TextDocument }>,
  limit = 200
): WorkspaceSymbol[] {
  const q = query.trim();
  const result: WorkspaceSymbol[] = [];
  for (const { uri, doc } of openDocs) {
    for (const s of collectFlatSymbols(doc)) {
      if (q && !s.name.toLowerCase().includes(q.toLowerCase())) continue;
      result.push({
        name: s.name,
        kind: s.kind,
        location: Location.create(uri, s.selectionRange),
      });
      if (result.length >= limit) return result;
    }
  }
  return result;
}

/* --------------------------------- Utils ----------------------------------- */

function wordAt(doc: TextDocument, pos: Position): string | null {
  const text = doc.getText();
  const off = doc.offsetAt(pos);
  let s = off, e = off;
  while (s > 0 && /[A-Za-z0-9_]/.test(text.charAt(s - 1))) s--;
  while (e < text.length && /[A-Za-z0-9_]/.test(text.charAt(e))) e++;
  return e > s ? text.slice(s, e) : null;
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function posKey(p: Position): string {
  return `${p.line}:${p.character}`;
}

function dedupeBy<T>(arr: T[], keyFn: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of arr) {
    const k = keyFn(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function isValidIdent(s: string): boolean {
  return /^[A-Za-z_]\w*$/.test(s);
}
