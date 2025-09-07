// lint.ts — Linter minimal pour Vitte/Vitl (LSP)
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
} from "vscode-languageserver/node";

/* ============================== Config ==================================== */

export type LintOptions = {
  maxLineLength?: number;          // 120 par défaut
  allowTabs?: boolean;             // false par défaut
  allowTrailingWhitespace?: boolean; // false par défaut
};

const DEFAULTS: Required<LintOptions> = {
  maxLineLength: 120,
  allowTabs: false,
  allowTrailingWhitespace: false,
};

const KEYWORDS = new Set<string>([
  "module","import","use","as","pub","const","let","mut","fn",
  "return","if","else","match","while","for","in","break","continue",
  "type","impl","where","struct","mod","test","true","false"
]);

/* =============================== Regex ==================================== */

const rxTrailingWS = /[ \t]+$/;
const rxTab = /\t/;
const rxTodo = /(^|\s)(TODO|FIXME|XXX)(:|\b)/;
const rxLineEndSemicolon = /;\s*$/;

const rxIdent = /[A-Za-z_][A-Za-z0-9_]*/g;
const rxNumber =
  /(?:0x[0-9A-Fa-f](?:[0-9A-Fa-f_])*)|(?:0b[01](?:[01_])*)|(?:\d(?:[\d_])*(?:\.(?:\d(?:[\d_])*))?(?:[eE][+-]?\d(?:[\d_])*)?)/g;

const rxString = /"(?:\\.|[^"\\])*"/g;
const rxChar = /'(?:\\.|[^'\\])'/g;

const rxCommentLine = /\/\/[^\n]*/g;
const rxCommentDoc = /\/\/![^\n]*/g;
const rxCommentBlock = /\/\*[\s\S]*?\*\//g;

/* =============================== Core ===================================== */

export function lintText(text: string, uri = "file://unknown", opts: LintOptions = {}): Diagnostic[] {
  const cfg = { ...DEFAULTS, ...opts };
  const diags: Diagnostic[] = [];

  const lines = text.split(/\r?\n/);

  // Ligne par ligne: longueur, tabs, espaces finaux, TODO
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!cfg.allowTabs && rxTab.test(line)) {
      diags.push(diag(i, line.indexOf("\t"), i, line.indexOf("\t") + 1,
        "Tabulation détectée. Utiliser des espaces.", DiagnosticSeverity.Warning, uri, "format.tabs"));
    }

    if (!cfg.allowTrailingWhitespace && rxTrailingWS.test(line)) {
      const m = line.match(rxTrailingWS)!;
      const start = m.index ?? (line.length - m[0].length);
      diags.push(diag(i, start, i, line.length,
        "Espaces en fin de ligne.", DiagnosticSeverity.Hint, uri, "format.trailingWhitespace"));
    }

    if (line.length > cfg.maxLineLength) {
      diags.push(diag(i, cfg.maxLineLength, i, line.length,
        `Ligne trop longue (${line.length} > ${cfg.maxLineLength}).`, DiagnosticSeverity.Information, uri, "format.lineLength"));
    }

    const todo = line.match(rxTodo);
    if (todo) {
      const idx = todo.index ?? 0;
      diags.push(diag(i, idx, i, idx + todo[0].length,
        "Marqueur de tâche détecté.", DiagnosticSeverity.Hint, uri, "note.todo"));
    }
  }

  // Nettoyage grossier pour l’analyse de structure
  const stripped = stripNonCode(text);

  // Parenthésage: (), [], {}
  diags.push(...checkBrackets(stripped, uri));

  // Tokens basiques: identifiants, nombres, chaînes/char sont déjà retirés
  diags.push(...checkIdentifiersAndKeywords(stripped, uri));

  // Heuristique: points-virgules manquants après statements simples (facultatif)
  diags.push(...checkSemicolonHeuristics(stripped, uri));

  return diags;
}

/* ============================= Helpers ==================================== */

function diag(
  line: number, chStart: number, lineEnd: number, chEnd: number,
  message: string, severity: DiagnosticSeverity, uri: string, code: string
): Diagnostic {
  return {
    range: Range.create(Position.create(line, chStart), Position.create(lineEnd, chEnd)),
    message,
    severity,
    source: "vitte-lint",
    code,
  };
}

function stripNonCode(src: string): string {
  return src
    .replace(rxCommentBlock, (m) => " ".repeat(m.length))
    .replace(rxCommentDoc, (m) => " ".repeat(m.length))
    .replace(rxCommentLine, (m) => " ".repeat(m.length))
    .replace(rxString, (m) => " ".repeat(m.length))
    .replace(rxChar, (m) => " ".repeat(m.length));
}

function checkBrackets(text: string, uri: string): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const openers = new Set(["(", "[", "{"]);
  const stack: { ch: string; line: number; col: number }[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    for (let j = 0; j < L.length; j++) {
      const c = L[j];
      if (openers.has(c)) stack.push({ ch: c, line: i, col: j });
      else if (c in pairs) {
        if (stack.length === 0) {
          diags.push(diag(i, j, i, j + 1, `Fermeture inattendue '${c}'.`, DiagnosticSeverity.Error, uri, "syntax.brackets"));
        } else {
          const top = stack.pop()!;
          if (pairs[c] !== top.ch) {
            diags.push(diag(i, j, i, j + 1, `Attendu '${matchingCloser(top.ch)}' avant '${c}'.`, DiagnosticSeverity.Error, uri, "syntax.brackets"));
          }
        }
      }
    }
  }
  for (const unclosed of stack) {
    diags.push(diag(unclosed.line, unclosed.col, unclosed.line, unclosed.col + 1,
      `Délimiteur non fermé '${unclosed.ch}'.`, DiagnosticSeverity.Error, uri, "syntax.brackets"));
  }
  return diags;
}

function matchingCloser(open: string): string {
  if (open === "(") return ")";
  if (open === "[") return "]";
  return "}";
}

function checkIdentifiersAndKeywords(text: string, uri: string): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];

    // Marque les nombres invalides simples (underscore en début/fin)
    for (const m of L.matchAll(rxNumber)) {
      const tok = m[0];
      if (/__/.test(tok) || /^_/.test(tok) || /_$/.test(tok)) {
        const s = m.index ?? 0;
        diags.push(diag(i, s, i, s + tok.length, "Littéral numérique invalide (underscore mal placé).",
          DiagnosticSeverity.Warning, uri, "lex.number"));
      }
    }

    // Identifiants: signale collision visuelle avec mots-clés en suffixant/prefixant
    for (const m of L.matchAll(rxIdent)) {
      const tok = m[0];
      const idx = m.index ?? 0;

      if (KEYWORDS.has(tok)) continue;

      // Heuristique: identifiant qui encapsule un mot-clé exact
      for (const kw of KEYWORDS) {
        if (tok === kw) continue;
        if (tok.startsWith(kw) && tok.length > kw.length && /[A-Za-z0-9_]/.test(tok[kw.length])) continue;
        if (tok.endsWith(kw) && tok.length > kw.length) {
          const s = idx;
          diags.push(diag(i, s, i, s + tok.length, `Éviter d'incorporer le mot-clé '${kw}' dans un identifiant.`,
            DiagnosticSeverity.Hint, uri, "style.ident.keywordShadow"));
          break;
        }
      }
    }
  }
  return diags;
}

function checkSemicolonHeuristics(text: string, uri: string): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const lines = text.split(/\r?\n/);

  // Après certaines formes simples d'assignation/const/let/expr, recommander ';'
  const starters = /^(?:\s*)(?:let|const|return|break|continue|type)\b/;
  const blockEnders = /^(?:\s*)[}\])]\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];

    if (blockEnders.test(L)) continue;
    if (/{\s*$/.test(L)) continue; // début de bloc
    if (/\b(if|while|for|match)\b/.test(L)) continue; // géré comme structures

    if (starters.test(L)) {
      if (!rxLineEndSemicolon.test(L)) {
        const col = Math.max(0, L.length - 1);
        diags.push(diag(i, col, i, L.length,
          "Point-virgule probablement attendu ici.", DiagnosticSeverity.Hint, uri, "style.semicolon"));
      }
    }
  }
  return diags;
}

/* ============================= LSP Bridge ================================= */

export function lintToPublishable(text: string, uri: string, options?: LintOptions): Diagnostic[] {
  return lintText(text, uri, options);
}
