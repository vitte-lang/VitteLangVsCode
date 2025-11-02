/**
 * languageFacts.ts — Autorité centrale sur le vocabulaire Vitte.
 * Réunit les mots-clés, types, littéraux et symboles réservés pour aligner
 * complétion, lint, hover et semantic tokens.
 */

// 🟩 Mots-clés de base (réservés au niveau grammaire)
export const KEYWORDS = [
  "module", "mod", "use", "import", "as", "pub",
  "const", "let", "var", "mut", "static",
  "fn", "return",
  "if", "else",
  "match", "switch", "case", "default",
  "while", "for", "loop", "in", "break", "continue",
  "type", "impl", "trait", "struct", "enum", "where",
  "async", "await", "yield",
  "with", "try", "catch", "finally", "throw",
  "unsafe", "extern", "inline", "volatile",
  "test", "defer"
] as const;
export type Keyword = typeof KEYWORDS[number];

// 🟩 Mots-clés contextuels (acceptés selon contexte — ne bloquent pas les idents)
export const CONTEXTUAL_KEYWORDS = [
  "where", "as", "inline", "volatile", "extern", "unsafe", "with",
] as const;
export type ContextualKeyword = typeof CONTEXTUAL_KEYWORDS[number];

// 🟩 Littéraux
export const BOOL_LITERALS = ["true", "false"] as const;
export const NIL_LITERALS  = ["null", "nil", "none"] as const;
export type BoolLiteral = typeof BOOL_LITERALS[number];
export type NilLiteral  = typeof NIL_LITERALS[number];

// 🟩 Types primitifs (réservés côté type-lexer)
export const PRIMITIVE_TYPES = [
  "bool", "char", "str", "string", "void", "never",
  "i8", "i16", "i32", "i64", "i128",
  "u8", "u16", "u32", "u64", "u128",
  "f16", "f32", "f64"
] as const;
export type PrimitiveType = typeof PRIMITIVE_TYPES[number];

// 🟩 Opérateurs et symboles significatifs (pour tokenizer/semantic)
export const OPERATORS = [
  "=", "+", "-", "*", "/", "%", "**",
  "==", "!=", "<", "<=", ">", ">=",
  "&&", "||", "!",
  "&", "|", "^", "~",
  "<<", ">>",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=",
  "->", "=>", "::", ":", ",", ";", "..", "...",
] as const;

export const BRACKETS = ["(", ")", "[", "]", "{", "}"] as const;

// 🟩 Ensembles (lookup O(1))
export const KEYWORD_SET: ReadonlySet<string>       = new Set(KEYWORDS);
export const CONTEXTUAL_KEYWORD_SET: ReadonlySet<string> = new Set(CONTEXTUAL_KEYWORDS);
export const BOOL_LITERAL_SET: ReadonlySet<string>  = new Set(BOOL_LITERALS);
export const NIL_LITERAL_SET: ReadonlySet<string>   = new Set(NIL_LITERALS);
export const PRIMITIVE_TYPE_SET: ReadonlySet<string> = new Set(PRIMITIVE_TYPES);
export const OPERATOR_SET: ReadonlySet<string>      = new Set(OPERATORS);
export const BRACKET_SET: ReadonlySet<string>       = new Set(BRACKETS);

// 🟩 Réservés (union globale pour filtres/complétion)
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  ...KEYWORDS,
  ...BOOL_LITERALS,
  ...NIL_LITERALS,
  ...PRIMITIVE_TYPES,
]);

// 🟩 Helpers d’identifiants (ASCII sûr ; un lexer Unicode pourra remplacer)
export function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
export function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

// 🟩 Classification rapide
export function isKeyword(value: string): boolean {
  return KEYWORD_SET.has(value);
}
export function isContextualKeyword(value: string): boolean {
  return CONTEXTUAL_KEYWORD_SET.has(value);
}
export function isBoolLiteral(value: string): boolean {
  return BOOL_LITERAL_SET.has(value);
}
export function isNilLiteral(value: string): boolean {
  return NIL_LITERAL_SET.has(value);
}
export function isPrimitiveType(value: string): boolean {
  return PRIMITIVE_TYPE_SET.has(value);
}
export function isReserved(value: string): boolean {
  return RESERVED_WORDS.has(value);
}

export type TokenKind =
  | "keyword"
  | "contextualKeyword"
  | "type"
  | "bool"
  | "nil"
  | "operator"
  | "bracket"
  | "identifier";

/** 🟩 Retourne une classification basique pour un mot/lexème. */
export function classifyWord(value: string): TokenKind {
  if (isKeyword(value)) return "keyword";
  if (isContextualKeyword(value)) return "contextualKeyword";
  if (isPrimitiveType(value)) return "type";
  if (isBoolLiteral(value)) return "bool";
  if (isNilLiteral(value)) return "nil";
  if (OPERATOR_SET.has(value)) return "operator";
  if (BRACKET_SET.has(value)) return "bracket";
  return "identifier";
}

// 🟩 Scan d’un identifiant depuis une position (utilitaire hover/rename)
export function scanIdentifierAt(text: string, offset: number): { start: number; end: number } | null {
  if (offset < 0 || offset >= text.length) return null;
  let s = offset;
  let e = offset;
  while (s > 0 && isIdentifierPart(text[s - 1])) s--;
  while (e < text.length && isIdentifierPart(text[e])) e++;
  if (s === e || !isIdentifierStart(text[s])) return null;
  return { start: s, end: e };
}

// 🟩 Suggestions de complétion simples (priorité: mots-clés > types > bool/nil)
export function suggestCompletions(prefix: string): string[] {
  const p = prefix || "";
  const startWith = (s: string) => s.startsWith(p);
  const kw  = KEYWORDS.filter(startWith);
  const ty  = PRIMITIVE_TYPES.filter(startWith);
  const lit = [...BOOL_LITERALS, ...NIL_LITERALS].filter(startWith);
  return [...kw, ...ty, ...lit];
}

// 🟩 Export compact des faits (pratique pour le client)
export const LanguageFacts = {
  KEYWORDS,
  CONTEXTUAL_KEYWORDS,
  BOOL_LITERALS,
  NIL_LITERALS,
  PRIMITIVE_TYPES,
  OPERATORS,
  BRACKETS,
  isKeyword,
  isContextualKeyword,
  isBoolLiteral,
  isNilLiteral,
  isPrimitiveType,
  isReserved,
  classifyWord,
  suggestCompletions,
  scanIdentifierAt,
} as const;

export default LanguageFacts;
