// indexer.ts — indexation légère des symboles pour Vitte/Vitl

import { TextDocument } from "vscode-languageserver-textdocument";

/** Sous-ensemble de SymbolKind LSP en valeurs numériques (compat) */
export const enum SK {
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
  TypeParameter = 26
}

export interface IndexedSymbol {
  name: string;
  kind: SK;
  uri: string;
  line: number;
  character: number;
}

/** Index global: uri -> liste de symboles */
const INDEX = new Map<string, IndexedSymbol[]>();

/* ------------------------------- extraction ------------------------------- */

const PATTERNS: Array<{ rx: RegExp; kind: SK; nameGroup: number }> = [
  { rx: /^\s*(?:module|mod)\s+([A-Za-z_]\w*)/gm, kind: SK.Namespace, nameGroup: 1 },
  { rx: /^\s*fn\s+([A-Za-z_]\w*)/gm,             kind: SK.Function,  nameGroup: 1 },
  { rx: /^\s*struct\s+([A-Za-z_]\w*)/gm,         kind: SK.Struct,    nameGroup: 1 },
  { rx: /^\s*enum\s+([A-Za-z_]\w*)/gm,           kind: SK.Enum,      nameGroup: 1 },
  { rx: /^\s*trait\s+([A-Za-z_]\w*)/gm,          kind: SK.Interface, nameGroup: 1 },
  { rx: /^\s*type\s+([A-Za-z_]\w*)/gm,           kind: SK.Interface, nameGroup: 1 },
  { rx: /^\s*let\s+(?:mut\s+)?([A-Za-z_]\w*)/gm, kind: SK.Variable,  nameGroup: 1 },
  { rx: /^\s*const\s+([A-Za-z_]\w*)/gm,          kind: SK.Constant,  nameGroup: 1 }
];

function extract(doc: TextDocument): IndexedSymbol[] {
  const text = doc.getText();
  const out: IndexedSymbol[] = [];

  for (const { rx, kind, nameGroup } of PATTERNS) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const name = m[nameGroup];
      if (!name) continue;
      const pos = doc.positionAt(m.index ?? 0);
      out.push({
        name,
        kind,
        uri: doc.uri,
        line: pos.line,
        character: pos.character
      });
      if (m[0].length === 0) rx.lastIndex++; // sécurité
    }
  }

  // Déduplication (name, kind, line, character)
  if (out.length > 1) {
    const seen = new Set<string>();
    return out.filter(s => {
      const k = `${s.kind}:${s.name}:${s.line}:${s.character}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return out;
}

/* --------------------------------- API ------------------------------------ */

/** Indexe un document dans l’index global (remplace l’entrée précédente). */
export function indexDocument(doc: TextDocument): void {
  INDEX.set(doc.uri, extract(doc));
}

/** Supprime un document de l’index. */
export function removeDocument(uri: string): void {
  INDEX.delete(uri);
}

/** Vide l’index global. */
export function clearIndex(): void {
  INDEX.clear();
}

/** Retourne l’index complet (lecture seule). */
export function getIndex(): ReadonlyMap<string, IndexedSymbol[]> {
  return INDEX;
}

/** Retourne les symboles indexés pour un URI. */
export function getDocumentIndex(uri: string): IndexedSymbol[] {
  return INDEX.get(uri) ?? [];
}

/**
 * Recherche naïve dans l’index (préfixe + sous-chaîne, case-insensitive).
 * @param query chaîne de recherche
 * @param limit limite de résultats
 */
export function searchWorkspaceSymbols(query: string, limit = 400): IndexedSymbol[] {
  const q = query.trim().toLowerCase();
  if (!q) return flattenIndex().slice(0, limit);

  // score: 2 = préfixe, 1 = sous-chaîne, 0 = non-match
  const scored: Array<{ s: IndexedSymbol; score: number }> = [];
  for (const list of INDEX.values()) {
    for (const s of list) {
      const n = s.name.toLowerCase();
      let score = 0;
      if (n.startsWith(q)) score = 2;
      else if (n.includes(q)) score = 1;
      if (score) scored.push({ s, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name));
  return scored.slice(0, limit).map(x => x.s);
}

/* --------------------------------- util ----------------------------------- */

function flattenIndex(): IndexedSymbol[] {
  const acc: IndexedSymbol[] = [];
  for (const list of INDEX.values()) acc.push(...list);
  return acc;
}
