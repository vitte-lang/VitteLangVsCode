// navigation.ts — Navigation et indexation Vitte/Vitl (LSP)
import {
  Location,
  Position,
  Range,
  DocumentSymbol,
  SymbolKind,
  WorkspaceSymbol,
} from "vscode-languageserver/node";
import { extractSymbols } from "./symbols.js";

type Doc = { getText(): string };
type IndexedDecl = { name: string; kind: number; range: Range; selectionRange: Range };

const KEYWORDS = new Set([
  "module","import","use","as","pub","const","let","mut","fn",
  "return","if","else","match","while","for","in","break","continue",
  "type","impl","where","struct","mod","test","true","false"
]);

/* ============================== Utils ===================================== */

function pos(l: number, c: number): Position { return Position.create(l, c); }
function rng(l1: number, c1: number, l2: number, c2: number): Range { return Range.create(pos(l1,c1), pos(l2,c2)); }
function cmpPos(a: Position, b: Position): number { return a.line - b.line || a.character - b.character; }
function contains(outer: Range, inner: Range): boolean {
  return cmpPos(outer.start, inner.start) <= 0 && cmpPos(outer.end, inner.end) >= 0;
}
function escapeRx(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function wordAt(line: string, ch: number): string | null {
  if (ch > line.length) ch = line.length;
  const l = line.slice(0, ch).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? "";
  const r = line.slice(ch).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? "";
  const w = l + r;
  if (!w) return null;
  return KEYWORDS.has(w) ? null : w;
}
function textLines(doc: Doc): string[] { return doc.getText().split(/\r?\n/); }

/* ============================== Index ===================================== */

export type SymbolIndex = {
  byName: Map<string, IndexedDecl[]>;
  all: IndexedDecl[];
};

export function indexDocument(doc: Doc): SymbolIndex {
  const syms = extractSymbols(doc);
  const decls: IndexedDecl[] = syms.map((s: any) => ({
    name: s.name,
    kind: s.kind ?? SymbolKind.Variable,
    range: s.range ?? rng(0,0,0,0),
    selectionRange: s.selectionRange ?? (s.range ?? rng(0,0,0,0)),
  }));
  const byName = new Map<string, IndexedDecl[]>();
  for (const d of decls) {
    const arr = byName.get(d.name);
    if (arr) arr.push(d); else byName.set(d.name, [d]);
  }
  return { byName, all: decls };
}

/* =========================== Document Symbols ============================= */

function nestSymbols(nodes: IndexedDecl[]): DocumentSymbol[] {
  const sorted = [...nodes].sort((a,b) =>
    cmpPos(a.range.start, b.range.start) || -cmpPos(a.range.end, b.range.end));
  const stack: { ds: DocumentSymbol; range: Range }[] = [];
  const roots: DocumentSymbol[] = [];
  for (const n of sorted) {
    const ds: DocumentSymbol = {
      name: n.name,
      kind: mapKind(n.kind),
      range: n.range,
      selectionRange: n.selectionRange,
      children: [],
    };
    while (stack.length && !contains(stack[stack.length-1].range, n.range)) stack.pop();
    if (stack.length) stack[stack.length-1].ds.children!.push(ds);
    else roots.push(ds);
    stack.push({ ds, range: n.range });
  }
  return roots;
}

function mapKind(k: number): SymbolKind {
  switch (k) {
    case SymbolKind.Function: return SymbolKind.Function;
    case SymbolKind.Method: return SymbolKind.Method;
    case SymbolKind.Struct: return SymbolKind.Struct;
    case SymbolKind.Enum: return SymbolKind.Enum;
    case SymbolKind.Interface: return SymbolKind.Interface;
    case SymbolKind.Module: return SymbolKind.Module;
    case SymbolKind.Class: return SymbolKind.Class;
    case SymbolKind.Property: return SymbolKind.Property;
    case SymbolKind.Variable: return SymbolKind.Variable;
    case SymbolKind.Constant: return SymbolKind.Constant;
    default: return SymbolKind.Null;
  }
}

export function documentSymbols(doc: Doc): DocumentSymbol[] {
  const idx = indexDocument(doc);
  return nestSymbols(idx.all);
}

/* ============================ Definition/Refs ============================= */

export function definitionAtPosition(doc: Doc, position: Position, uri = "file://unknown"): Location[] {
  const lines = textLines(doc);
  if (position.line >= lines.length) return [];
  const w = wordAt(lines[position.line], position.character);
  if (!w) return [];
  const idx = indexDocument(doc);
  const decls = idx.byName.get(w);
  if (!decls?.length) return [];
  return decls.map(d => ({ uri, range: d.selectionRange ?? d.range }));
}

export function referencesAtPosition(doc: Doc, position: Position, uri = "file://unknown"): Location[] {
  const lines = textLines(doc);
  if (position.line >= lines.length) return [];
  const w = wordAt(lines[position.line], position.character);
  if (!w) return [];
  const rx = new RegExp(`\\b${escapeRx(w)}\\b`, "g");
  const locs: Location[] = [];
  for (let i = 0; i < lines.length; i++) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(lines[i]))) locs.push({ uri, range: rng(i, m.index!, i, m.index! + w.length) });
  }
  return locs;
}

/* ================================ Rename ================================== */

export function renameSymbol(doc: Doc, position: Position, newName: string): { range: Range; newText: string }[] {
  const lines = textLines(doc);
  if (position.line >= lines.length) return [];
  const w = wordAt(lines[position.line], position.character);
  if (!w) return [];
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName) || KEYWORDS.has(newName)) return [];
  const rx = new RegExp(`\\b${escapeRx(w)}\\b`, "g");
  const edits: { range: Range; newText: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(lines[i]))) edits.push({ range: rng(i, m.index!, i, m.index! + w.length), newText: newName });
  }
  return edits;
}

/* ============================ Workspace Symbols =========================== */

export function workspaceSymbols(query: string, docs: { uri: string; doc: Doc }[], limit = 200): WorkspaceSymbol[] {
  const q = query.trim();
  if (!q) return [];
  const out: WorkspaceSymbol[] = [];
  for (const { uri, doc } of docs) {
    const idx = indexDocument(doc);
    for (const d of idx.all) {
      const s = fuzzyScore(q, d.name);
      if (s <= 0) continue;
      out.push({
        name: d.name,
        kind: mapKind(d.kind),
        location: { uri, range: d.selectionRange ?? d.range },
        containerName: containerNameOf(d, idx.all),
      });
    }
  }
  return out
    .sort((a,b) => {
      const sa = fuzzyScore(q, a.name), sb = fuzzyScore(q, b.name);
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

function containerNameOf(d: IndexedDecl, all: IndexedDecl[]): string | undefined {
  let best: IndexedDecl | undefined;
  for (const other of all) {
    if (other === d) continue;
    if (contains(other.range, d.range)) {
      if (!best || contains(best.range, other.range)) best = other;
    }
  }
  return best?.name;
}

function fuzzyScore(q: string, s: string): number {
  let i = 0, j = 0, score = 0, streak = 0;
  const qq = q.toLowerCase(), ss = s.toLowerCase();
  while (i < qq.length && j < ss.length) {
    if (qq[i] === ss[j]) { score += 1 + streak; streak++; i++; j++; }
    else { streak = 0; j++; }
  }
  return i === qq.length ? score : 0;
}

/* ============================== Symbol Outline ============================ */

export function symbolOutline(doc: Doc): { name: string; kind: SymbolKind; level: number; range: Range }[] {
  const flat: { name: string; kind: SymbolKind; range: Range }[] =
    indexDocument(doc).all.map(d => ({ name: d.name, kind: mapKind(d.kind), range: d.range }));
  const levels = new Array(flat.length).fill(0);
  for (let i = 0; i < flat.length; i++) {
    for (let j = 0; j < flat.length; j++) {
      if (i === j) continue;
      if (contains(flat[j].range, flat[i].range)) levels[i]++;
    }
  }
  return flat
    .map((f, i) => ({ name: f.name, kind: f.kind, level: levels[i], range: f.range }))
    .sort((a,b) =>
      cmpPos(a.range.start, b.range.start) ||
      -cmpPos(a.range.end, b.range.end));
}
