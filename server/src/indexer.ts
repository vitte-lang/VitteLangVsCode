// indexer.ts — indexation robuste des symboles pour Vitte/Vitl (LSP prêt, sans dépendance runtime)

// Import minimal côté serveur LSP.
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  DocumentSymbol as LspDocumentSymbol,
  Location as LspLocation,
  Position as LspPosition,
  Range as LspRange,
  SymbolInformation as LspSymbolInformation,
  SymbolKind as LspSymbolKind,
} from "vscode-languageserver-types";

/* ============================================================================
 * Types et constantes
 * ========================================================================== */

// Utiliser "enum" plutôt que "const enum" pour éviter les soucis de transpilation TS dans certains toolchains.
export enum SK {
  Module = 2,
  Namespace = 3,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  Struct = 23,
  TypeParameter = 26,
}

export interface IndexedSymbol {
  name: string;
  kind: SK;
  uri: string;
  line: number;
  character: number;
  endLine?: number;
  endCharacter?: number;
  containerName?: string;
}

type Uri = string;

/** Index global: uri -> liste de symboles */
const INDEX = new Map<Uri, IndexedSymbol[]>();

/* ============================================================================
 * Règles d’extraction (regex heuristiques)
 * ========================================================================== */

const PATTERNS: Array<{ rx: RegExp; kind: SK; nameGroup: number }> = [
  { rx: /^\s*(?:module|mod)\s+([A-Za-z_]\w*)/gm, kind: SK.Namespace, nameGroup: 1 },
  { rx: /^\s*fn\s+([A-Za-z_]\w*)/gm,             kind: SK.Function,  nameGroup: 1 },
  { rx: /^\s*struct\s+([A-Za-z_]\w*)/gm,         kind: SK.Struct,    nameGroup: 1 },
  { rx: /^\s*enum\s+([A-Za-z_]\w*)/gm,           kind: SK.Enum,      nameGroup: 1 },
  { rx: /^\s*trait\s+([A-Za-z_]\w*)/gm,          kind: SK.Interface, nameGroup: 1 },
  { rx: /^\s*type\s+([A-Za-z_]\w*)/gm,           kind: SK.Interface, nameGroup: 1 },
  { rx: /^\s*let\s+(?:mut\s+)?([A-Za-z_]\w*)/gm, kind: SK.Variable,  nameGroup: 1 },
  { rx: /^\s*const\s+([A-Za-z_]\w*)/gm,          kind: SK.Constant,  nameGroup: 1 },
];

/* ============================================================================
 * Extraction principale
 * ========================================================================== */

/**
 * Extrait des symboles et approxime leur portée par analyse d’accolades.
 * Robuste aux chaînes et commentaires simples `//`.
 */
function extract(doc: TextDocument): IndexedSymbol[] {
  const text = doc.getText();
  const syms: IndexedSymbol[] = [];

  // 1) Déclarations
  for (const { rx, kind, nameGroup } of PATTERNS) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const name = m[nameGroup];
      if (!name) continue;
      const pos = doc.positionAt(m.index);
      syms.push({
        name,
        kind,
        uri: doc.uri,
        line: pos.line,
        character: pos.character,
      });
      if (m[0].length === 0) rx.lastIndex++;
    }
  }

  // 2) Approximation de fin de portée via pile d’accolades, en ignorant les chaînes et // commentaires.
  const lines = text.split(/\r?\n/);
  const openStack: Array<{ line: number; ch: number; symIdx: number | null }> = [];
  const startsByLine = mapStartsByLine(syms);

  for (let ln = 0; ln < lines.length; ln++) {
    const raw = lines[ln];
    const code = stripLineComment(raw);

    // Associer les symboles qui commencent sur ln au conteneur courant
    if (startsByLine.has(ln)) {
      const containerName = topContainer(openStack, syms);
      for (const idx of startsByLine.get(ln)!) {
        if (containerName) syms[idx].containerName = containerName;
      }
    }

    // Scanner accolades en ignorant les chaînes
    let i = 0;
    let inStr: "'" | '"' | null = null;
    while (i < code.length) {
      const ch = code[i];
      if (inStr) {
        if (ch === "\\") { i += 2; continue; }
        if (ch === inStr) inStr = null;
        i++; continue;
      }
      if (ch === "'" || ch === '"') { inStr = ch; i++; continue; }

      if (ch === "{") {
        openStack.push({ line: ln, ch: i, symIdx: nearestSymbolBeforeLine(syms, ln) });
      } else if (ch === "}") {
        const top = openStack.pop();
        if (top && top.symIdx != null) {
          const s = syms[top.symIdx];
          // Conserver la plus grande étendue rencontrée
          s.endLine = s.endLine !== undefined ? Math.max(s.endLine, ln) : ln;
          s.endCharacter = i;
        }
      }
      i++;
    }
  }

  // 3) Déduplication
  return dedupe(syms, (s) => `${s.kind}:${s.name}:${s.line}:${s.character}`);
}

/* ============================================================================
 * API d’index
 * ========================================================================== */

/** Indexe un document (remplace l’entrée précédente). */
export function indexDocument(doc: TextDocument): void {
  INDEX.set(doc.uri, extract(doc));
}

/** Indexe une chaîne pour un uri donné. */
export function indexText(uri: string, text: string): void {
  const doc = TextDocument.create(uri, "vitte", 0, text);
  INDEX.set(uri, extract(doc));
}

/** Réindexe un document (alias plus explicite). */
export function updateDocument(doc: TextDocument): void {
  INDEX.set(doc.uri, extract(doc));
}

/** Supprime un document de l’index. */
export function removeDocument(uri: string): void {
  INDEX.delete(uri);
}

/** Vide l’index. */
export function clearIndex(): void {
  INDEX.clear();
}

/** Récupère l’index brut (lecture seule). */
export function getIndex(): ReadonlyMap<Uri, IndexedSymbol[]> {
  return INDEX;
}

/** Récupère les symboles d’un document. */
export function getDocumentIndex(uri: string): IndexedSymbol[] {
  return INDEX.get(uri) ?? [];
}

/* ============================================================================
 * Requêtes et conversions LSP
 * ========================================================================== */

/** Recherche globale par fuzzy + préfixe, tri par score et nature. */
export function searchWorkspaceSymbols(query: string, limit = 400): IndexedSymbol[] {
  const q = query.trim().toLowerCase();
  const all = flattenIndex();
  if (!q) return all.slice(0, limit);

  const scored = all
    .map((s) => ({ s, score: fuzzyScore(s.name.toLowerCase(), q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      rankKind(b.s.kind) - rankKind(a.s.kind) ||
      a.s.name.localeCompare(b.s.name)
    )
    .slice(0, limit)
    .map((x) => x.s);

  return scored;
}

/** Conversion vers SymbolInformation[] (Workspace Symbols). */
export function toWorkspaceSymbols(syms: IndexedSymbol[]): LspSymbolInformation[] {
  return syms.map((s) => ({
    name: s.name,
    kind: toLspKind(s.kind),
    location: {
      uri: s.uri,
      range: lspRange(s.line, s.character, s.endLine ?? s.line, s.endCharacter ?? s.character),
    } as LspLocation,
    containerName: s.containerName,
  }));
}

/** Conversion hiérarchique DocumentSymbol[] pour un document. */
export function toDocumentSymbols(doc: TextDocument): LspDocumentSymbol[] {
  const list = getDocumentIndex(doc.uri);
  // Simple regroupement par containerName. Les doublons de nom sont pris tels quels.
  const byName = new Map<string, LspDocumentSymbol>();
  const roots: LspDocumentSymbol[] = [];

  for (const s of list) {
    const ds: LspDocumentSymbol = {
      name: s.name,
      kind: toLspKind(s.kind),
      range: lspRange(s.line, s.character, s.endLine ?? s.line, s.endCharacter ?? s.character),
      selectionRange: lspRange(s.line, s.character, s.line, Math.max(s.character, s.character + s.name.length)),
      children: [],
    };
    if (s.containerName && byName.has(s.containerName)) {
      byName.get(s.containerName)!.children!.push(ds);
    } else {
      roots.push(ds);
    }
    byName.set(s.name, ds);
  }
  return roots;
}

/** Renvoie les symboles à une position. */
export function symbolsAtPosition(uri: string, pos: { line: number; character: number }): IndexedSymbol[] {
  const list = getDocumentIndex(uri);
  return list.filter((s) => inRange(pos, s));
}

/** Définition naïve: symbole portant le même nom, priorisant le même fichier. */
export function findDefinition(uri: string, name: string): IndexedSymbol | undefined {
  const local = getDocumentIndex(uri).find((s) => s.name === name);
  if (local) return local;
  for (const [, list] of INDEX) {
    const hit = list.find((s) => s.name === name);
    if (hit) return hit;
  }
  return undefined;
}

/** Références naïves: symboles du même nom dans l’index. */
export function findReferences(_uri: string, name: string, limit = 500): IndexedSymbol[] {
  const acc: IndexedSymbol[] = [];
  for (const list of INDEX.values()) {
    for (const s of list) {
      if (s.name === name) {
        acc.push(s);
        if (acc.length >= limit) return acc;
      }
    }
  }
  return acc;
}

/* ============================================================================
 * Utilitaires internes
 * ========================================================================== */

function mapStartsByLine(syms: IndexedSymbol[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  syms.forEach((s, i) => {
    const arr = m.get(s.line) ?? [];
    arr.push(i);
    m.set(s.line, arr);
  });
  return m;
}

function topContainer(stack: Array<{ symIdx: number | null }>, syms: IndexedSymbol[]): string | undefined {
  for (let i = stack.length - 1; i >= 0; i--) {
    const idx = stack[i].symIdx;
    if (idx != null) return syms[idx].name;
  }
  return undefined;
}

function nearestSymbolBeforeLine(list: IndexedSymbol[], line: number): number | null {
  let bestIdx: number | null = null;
  let bestDelta = Infinity;
  for (let i = 0; i < list.length; i++) {
    const d = line - list[i].line;
    if (d >= 0 && d < bestDelta) {
      bestDelta = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function stripLineComment(line: string): string {
  // Retire "//..." hors chaînes pour ne pas fausser le comptage d’accolades
  let i = 0;
  let inStr: "'" | '"' | null = null;
  while (i < line.length) {
    const ch = line[i];
    if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++; continue;
    }
    if (ch === "'" || ch === '"') { inStr = ch; i++; continue; }
    if (ch === "/" && i + 1 < line.length && line[i + 1] === "/") {
      return line.slice(0, i);
    }
    i++;
  }
  return line;
}

function inRange(pos: { line: number; character: number }, s: IndexedSymbol): boolean {
  const startOk =
    pos.line > s.line || (pos.line === s.line && pos.character >= s.character);
  const endLine = s.endLine ?? s.line;
  const endChar = s.endCharacter ?? s.character;
  const endOk = pos.line < endLine || (pos.line === endLine && pos.character <= endChar);
  return startOk && endOk;
}

function flattenIndex(): IndexedSymbol[] {
  const acc: IndexedSymbol[] = [];
  for (const list of INDEX.values()) acc.push(...list);
  return acc;
}

function toLspKind(k: SK): LspSymbolKind {
  // Les valeurs numériques de SK sont alignées avec LSP. Cast sûr.
  return k as unknown as LspSymbolKind;
}

function lspRange(sl: number, sc: number, el: number, ec: number): LspRange {
  return {
    start: { line: sl, character: sc } as LspPosition,
    end: { line: el, character: ec } as LspPosition,
  };
}

/** Fuzzy score simple. Favorise le préfixe et les sous-séquences denses. */
function fuzzyScore(candidate: string, query: string): number {
  if (candidate === query) return 1000;
  if (candidate.startsWith(query)) return 800 - Math.min(200, candidate.length - query.length);
  let qi = 0;
  let streak = 0;
  let score = 0;
  for (let i = 0; i < candidate.length && qi < query.length; i++) {
    if (candidate[i] === query[qi]) {
      qi++; streak++; score += 5 + Math.min(10, streak);
    } else {
      streak = 0;
    }
  }
  return qi === query.length ? 300 + score : 0;
}

/** Ordre de priorité par nature de symbole. */
function rankKind(k: SK): number {
  switch (k) {
    case SK.Namespace:
    case SK.Module: return 6;
    case SK.Class:
    case SK.Struct:
    case SK.Interface:
    case SK.Enum:   return 5;
    case SK.Function:
    case SK.Method:
    case SK.Constructor: return 4;
    case SK.Property:
    case SK.Field:  return 3;
    case SK.Variable:
    case SK.Constant: return 2;
    default: return 1;
  }
}

/** Déduplication générique. */
function dedupe<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
