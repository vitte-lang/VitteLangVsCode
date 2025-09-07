// formatting.ts
import {
  TextEdit,
  Range,
  Position,
  FormattingOptions,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export interface ExtraFormattingOptions extends FormattingOptions {
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  trimFinalNewlines?: boolean;
  ensureSpaceAroundOperators?: boolean;
}

export function provideFormattingEdits(
  doc: TextDocument,
  options: ExtraFormattingOptions = {
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    insertFinalNewline: true,
    ensureSpaceAroundOperators: true,
  }
): TextEdit[] {
  const original = doc.getText();
  const lines = original.split(/\r?\n/);

  const tabSize = options.tabSize ?? 2;
  const spaceUnit = " ".repeat(tabSize);
  const useSpaces = options.insertSpaces ?? true;

  const out: string[] = [];
  for (let line of lines) {
    // Convert indentation tabs/spaces
    if (useSpaces) {
      // tabs -> spaces
      line = line.replace(/\t/g, spaceUnit);
    } else {
      // collapse groups of N spaces -> tab
      const re = new RegExp(` {${tabSize}}`, "g");
      line = line.replace(re, "\t");
    }

    // Trim trailing whitespace
    if (options.trimTrailingWhitespace) {
      line = line.replace(/[ \t]+$/g, "");
    }

    // Ensure spaces around common binary operators (outside strings)
    if (options.ensureSpaceAroundOperators) {
      line = ensureSpacesAroundOpsOutsideStrings(line);
    }

    // Collapse accidental double spaces around operators
    line = line.replace(/ {2,}(?=(=|\+|-|\*|\/|%|<|>|!|&|\||\^))/g, " ");
    line = line.replace(/(?<=(=|\+|-|\*|\/|%|<|>|!|&|\||\^)) {2,}/g, " ");

    out.push(line);
  }

  let text = out.join("\n");

  // Trim final newlines
  if (options.trimFinalNewlines) {
    text = text.replace(/\n+$/g, "\n");
  }

  // Enforce final newline
  if (options.insertFinalNewline && !text.endsWith("\n")) {
    text += "\n";
  }

  if (text === original) return [];

  return [TextEdit.replace(fullRange(doc), text)];
}

export function formatDocument(
  doc: TextDocument,
  options: ExtraFormattingOptions = {
    tabSize: 2,
    insertSpaces: true,
    trimTrailingWhitespace: true,
    insertFinalNewline: true,
    ensureSpaceAroundOperators: true,
  }
): TextEdit[] {
  return provideFormattingEdits(doc, options);
}

/* --------------------------------- utils ---------------------------------- */

function fullRange(doc: TextDocument): Range {
  const lastLine = doc.lineCount > 0 ? doc.lineCount - 1 : 0;
  const lastLen =
    doc.getText().split(/\r?\n/)[lastLine]?.length ?? 0;
  return Range.create(Position.create(0, 0), Position.create(lastLine, lastLen));
}

function ensureSpacesAroundOpsOutsideStrings(line: string): string {
  // Operateurs communs. Ordre long -> court pour éviter chevauchements.
  const ops = [
    "\\+=", "-=", "\\*=", "/=", "%=", "<<=", ">>=", "&=", "\\^=", "\\|=",
    "===", "!==", "==", "!=", "<=", ">=", "&&", "\\|\\|", "<<", ">>",
    "\\+", "-", "\\*", "/", "%", "<", ">", "=", "&", "\\|", "\\^",
  ];
  const rx = new RegExp(`\\s*(${ops.join("|")})\\s*`, "g");

  // Applique la règle hors chaînes "..." ou '...'
  let out = "";
  let i = 0;
  let inStr: '"' | "'" | null = null;

  while (i < line.length) {
    const ch = line[i];

    if (inStr) {
      out += ch;
      if (ch === "\\") {
        // skip escaped char
        if (i + 1 < line.length) {
          out += line[i + 1];
          i += 2;
          continue;
        }
      } else if (ch === inStr) {
        inStr = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = ch as '"' | "'";
      out += ch;
      i++;
      continue;
    }

    // try operator at current offset
    const sub = line.slice(i);
    rx.lastIndex = 0;
    const m = rx.exec(sub);
    if (m && m.index === 0) {
      out += ` ${m[1]} `;
      i += m[0].length;
      continue;
    }

    out += ch;
    i++;
  }

  // compact spaces to single around ops
  out = out.replace(/ {2,}/g, " ");
  // avoid adding space at line start/end accidentally
  return out.replace(/^ +/, "").replace(/ +$/, "");
}
