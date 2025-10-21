/**
 * languageFacts.ts — Autorité centrale sur le vocabulaire Vitte.
 * Réunit les mots-clés et littéraux réservés pour éviter les divergences
 * entre la complétion, le lint et les semantic tokens.
 */

export const KEYWORDS = [
  "module",
  "mod",
  "use",
  "import",
  "as",
  "pub",
  "const",
  "let",
  "var",
  "mut",
  "static",
  "fn",
  "return",
  "if",
  "else",
  "match",
  "switch",
  "case",
  "default",
  "while",
  "for",
  "loop",
  "in",
  "break",
  "continue",
  "type",
  "impl",
  "trait",
  "struct",
  "enum",
  "where",
  "async",
  "await",
  "yield",
  "with",
  "try",
  "catch",
  "finally",
  "throw",
  "unsafe",
  "extern",
  "inline",
  "volatile",
  "test",
  "defer"
] as const;

export type Keyword = typeof KEYWORDS[number];

export const BOOL_LITERALS = ["true", "false"] as const;
export const NIL_LITERALS = ["null", "nil", "none"] as const;

export type BoolLiteral = typeof BOOL_LITERALS[number];
export type NilLiteral = typeof NIL_LITERALS[number];

export const KEYWORD_SET: ReadonlySet<string> = new Set(KEYWORDS);
export const BOOL_LITERAL_SET: ReadonlySet<string> = new Set(BOOL_LITERALS);
export const NIL_LITERAL_SET: ReadonlySet<string> = new Set(NIL_LITERALS);

export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  ...KEYWORDS,
  ...BOOL_LITERALS,
  ...NIL_LITERALS,
]);

export function isKeyword(value: string): boolean {
  return KEYWORD_SET.has(value);
}

export function isReserved(value: string): boolean {
  return RESERVED_WORDS.has(value);
}
