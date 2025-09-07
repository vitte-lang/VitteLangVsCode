import {
  TextEdit,
  Range,
  Position
} from "vscode-languageserver/node"

export function formatDocument(doc, options = { tabSize: 2, insertSpaces: true, trimTrailingWhitespace: true, insertFinalNewline: true, ensureSpaceAroundOperators: true }) {
  const text = doc.getText()
  const lines = text.split(/\r?\n/)
  const edits = []
  const indentUnit = options.insertSpaces ? " ".repeat(options.tabSize) : "\t"
  let indentLevel = 0

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    let trimmed = line.trim()
    if (trimmed === "") {
      if (line.length > 0) edits.push(replaceLine(doc, i, ""))
      continue
    }
    if (/^[\}\]\)]/.test(trimmed)) indentLevel = Math.max(indentLevel - 1, 0)
    let targetIndent = indentUnit.repeat(indentLevel)
    if (options.trimTrailingWhitespace) trimmed = trimmed.replace(/[ \t]+$/g, "")
    if (options.ensureSpaceAroundOperators) trimmed = ensureOperatorSpacing(trimmed)
    const newLine = targetIndent + trimmed
    if (line !== newLine) edits.push(replaceLine(doc, i, newLine))
    if (/[\{\[\(]\s*$/.test(trimmed)) indentLevel++
  }

  if (options.insertFinalNewline) {
    if (lines.length === 0 || lines[lines.length - 1].trim() !== "") {
      edits.push(TextEdit.insert(Position.create(lines.length, 0), "\n"))
    }
  }

  return edits
}

export function formatRange(doc, range, options = { tabSize: 2, insertSpaces: true }) {
  const text = doc.getText(range)
  const subDoc = { getText: () => text }
  const edits = formatDocument(subDoc, options)
  const baseLine = range.start.line
  return edits.map(e => {
    const r = Range.create(
      Position.create(baseLine + e.range.start.line, e.range.start.character),
      Position.create(baseLine + e.range.end.line, e.range.end.character)
    )
    return TextEdit.replace(r, e.newText)
  })
}

function replaceLine(doc, line, newText) {
  const orig = doc.getText().split(/\r?\n/)[line]
  return TextEdit.replace(Range.create(Position.create(line, 0), Position.create(line, orig.length)), newText)
}

function ensureOperatorSpacing(line) {
  return line
    .replace(/([^\s])([+\-*/=<>!%&|^]+)/g, "$1 $2")
    .replace(/([+\-*/=<>!%&|^]+)([^\s])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
}
