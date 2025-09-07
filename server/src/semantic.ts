// semantic.ts
import {
  SemanticTokensLegend,
  SemanticTokensBuilder,
  Position,
  Range,
  Hover,
  MarkupKind,
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  InlayHint,
  InlayHintKind,
} from "vscode-languageserver/node";
import { extractSymbols } from "./symbols.js";

type Doc = { getText(): string };
const KEYWORDS = new Set([
  "module","import","use","as","pub","const","let","mut","fn",
  "return","if","else","match","while","for","in","break","continue",
  "type","impl","where","struct","mod","test","true","false"
]);
const TOKEN_TYPES = [
  "namespace","type","class","enum","interface","struct","typeParameter","parameter",
  "variable","property","enumMember","event","function","method","macro",
  "keyword","modifier","comment","string","number","regexp","operator"
] as const;
const TOKEN_MODS = [
  "declaration","definition","readonly","static","deprecated","abstract","async",
  "modification","documentation","defaultLibrary"
] as const;
const typeIndex: Record<string, number> = Object.fromEntries(TOKEN_TYPES.map((t,i)=>[t,i]));
const modIndex: Record<string, number> = Object.fromEntries(TOKEN_MODS.map((t,i)=>[t,i]));

function legend(): SemanticTokensLegend {
  return { tokenTypes: [...TOKEN_TYPES], tokenModifiers: [...TOKEN_MODS] };
}

function isIdentStart(c: string) { return /[A-Za-z_]/.test(c); }
function isIdent(c: string) { return /[A-Za-z0-9_]/.test(c); }

function tokenize(doc: Doc): { line: number; start: number; length: number; type: number; mods: number }[] {
  const out: { line: number; start: number; length: number; type: number; mods: number }[] = [];
  const lines = doc.getText().split(/\r?\n/);
  let inBlock = false;
  for (let ln = 0; ln < lines.length; ln++) {
    const s = lines[ln];
    if (!inBlock && s.includes("//!")) {
      const idx = s.indexOf("//!");
      out.push({ line: ln, start: idx, length: s.length - idx, type: typeIndex.comment, mods: 1<<modIndex.documentation });
      continue;
    }
    if (!inBlock && s.includes("//")) {
      const idx = s.indexOf("//");
      out.push({ line: ln, start: idx, length: s.length - idx, type: typeIndex.comment, mods: 0 });
      continue;
    }
    let i = 0;
    let state: "code"|"str"|"char" = "code";
    while (i < s.length) {
      if (!inBlock && state==="code" && s[i]==="/" && i+1<s.length && s[i+1]==="*") { inBlock = true; i+=2; continue; }
      if (inBlock) {
        const end = s.indexOf("*/", i);
        if (end === -1) { out.push({ line: ln, start: 0, length: s.length, type: typeIndex.comment, mods: 0 }); i = s.length; continue; }
        out.push({ line: ln, start: i, length: end+2-i, type: typeIndex.comment, mods: 0 });
        i = end+2; inBlock = false; continue;
      }
      if (state==="code" && s[i]==='"') { const j = scanString(s, i, '"'); out.push({ line: ln, start: i, length: j-i, type: typeIndex.string, mods: 0 }); i=j; continue; }
      if (state==="code" && s[i]==="'") { const j = scanString(s, i, "'"); out.push({ line: ln, start: i, length: j-i, type: typeIndex.string, mods: 0 }); i=j; continue; }
      if (state==="code" && /[0-9]/.test(s[i])) { const j = scanNumber(s, i); out.push({ line: ln, start: i, length: j-i, type: typeIndex.number, mods: 0 }); i=j; continue; }
      if (state==="code" && isIdentStart(s[i])) {
        const j = scanIdent(s, i);
        const tok = s.slice(i,j);
        if (KEYWORDS.has(tok)) {
          out.push({ line: ln, start: i, length: j-i, type: typeIndex.keyword, mods: 0 });
        }
        i=j; continue;
      }
      if ("+-/*%&|^=!<>".includes(s[i])) { out.push({ line: ln, start: i, length: 1, type: typeIndex.operator, mods: 0 }); i++; continue; }
      i++;
    }
  }
  return out;
}

function scanString(s: string, i: number, q: string): number {
  let j = i+1;
  while (j < s.length) {
    if (s[j] === "\\" && j+1 < s.length) { j += 2; continue; }
    if (s[j] === q) { j++; break; }
    j++;
  }
  return j;
}
function scanNumber(s: string, i: number): number {
  let j = i;
  if (s.startsWith("0x", i) || s.startsWith("0X", i)) { j+=2; while (j<s.length && /[0-9A-Fa-f_]/.test(s[j])) j++; return j; }
  if (s.startsWith("0b", i) || s.startsWith("0B", i)) { j+=2; while (j<s.length && /[01_]/.test(s[j])) j++; return j; }
  while (j<s.length && /[0-9_]/.test(s[j])) j++;
  if (s[j]==="." && /[0-9]/.test(s[j+1]??"")) { j++; while (j<s.length && /[0-9_]/.test(s[j])) j++; }
  if ((s[j]==="e"||s[j]==="E")) { let k=j+1; if (s[k]==="+"||s[k]==="-") k++; if (/[0-9]/.test(s[k]??"")) { j=k+1; while (j<s.length && /[0-9_]/.test(s[j])) j++; } }
  return j;
}
function scanIdent(s: string, i: number): number { let j=i+1; while (j<s.length && isIdent(s[j])) j++; return j; }

function classifyDeclarations(doc: Doc) {
  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  const decls: { name: string; type: number; mods: number; line: number; start: number; length: number }[] = [];
  const rxFn = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  const rxStruct = /\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  const rxType = /\btype\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  const rxMod = /\bmod\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  const rxConst = /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  const rxLet = /\blet\s+(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)/g;
  for (let ln=0; ln<lines.length; ln++) {
    const L = stripStringsAndComments(lines[ln]);
    let m: RegExpExecArray|null;
    rxFn.lastIndex=0; while ((m=rxFn.exec(L))) decls.push({ name: m[1], type: typeIndex.function, mods: 1<<modIndex.declaration, line: ln, start: m.index!+m[0].indexOf(m[1]), length: m[1].length });
    rxStruct.lastIndex=0; while ((m=rxStruct.exec(L))) decls.push({ name: m[1], type: typeIndex.struct, mods: 1<<modIndex.declaration, line: ln, start: m.index!+m[0].indexOf(m[1]), length: m[1].length });
    rxType.lastIndex=0; while ((m=rxType.exec(L))) decls.push({ name: m[1], type: typeIndex.type, mods: 1<<modIndex.declaration, line: ln, start: m.index!+m[0].indexOf(m[1]), length: m[1].length });
    rxMod.lastIndex=0; while ((m=rxMod.exec(L))) decls.push({ name: m[1], type: typeIndex.namespace, mods: 1<<modIndex.declaration, line: ln, start: m.index!+m[0].indexOf(m[1]), length: m[1].length });
    rxConst.lastIndex=0; while ((m=rxConst.exec(L))) decls.push({ name: m[1], type: typeIndex.variable, mods: (1<<modIndex.declaration)|(1<<modIndex.readonly), line: ln, start: m.index!+m[0].indexOf(m[1]), length: m[1].length });
    rxLet.lastIndex=0; while ((m=rxLet.exec(L))) decls.push({ name: m[1], type: typeIndex.variable, mods: 1<<modIndex.declaration, line: ln, start: m.index!+m[0].indexOf(m[1]), length: m[1].length });
  }
  return decls;
}

function stripStringsAndComments(s: string): string {
  let out = "";
  for (let i=0;i<s.length;){
    if (s[i]==='"'){ const j=scanString(s,i,'"'); out += " ".repeat(j-i); i=j; continue; }
    if (s[i]==="'"){ const j=scanString(s,i,"'"); out += " ".repeat(j-i); i=j; continue; }
    if (s[i]==="/" && i+1<s.length && s[i+1]==="/"){ out += " ".repeat(s.length-i); break; }
    if (s[i]==="/" && i+1<s.length && s[i+1]==="*"){ const j = s.indexOf("*/", i+2); const end = j===-1? s.length : j+2; out += " ".repeat(end-i); i=end; continue; }
    out += s[i]; i++;
  }
  return out;
}

export function getSemanticTokensLegend(): SemanticTokensLegend {
  return legend();
}

export function buildSemanticTokens(doc: Doc) {
  const builder = new SemanticTokensBuilder(legend());
  const base = tokenize(doc);
  for (const t of base) builder.push(t.line, t.start, t.length, t.type, t.mods);
  const decls = classifyDeclarations(doc);
  for (const d of decls) builder.push(d.line, d.start, d.length, d.type, d.mods);
  return builder.build();
}

export function provideHover(doc: Doc, position: Position): Hover | null {
  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  if (position.line >= lines.length) return null;
  const w = wordAt(lines[position.line], position.character);
  if (!w) return null;
  const syms = extractSymbols(doc);
  const s = syms.find((x: any) => x.name === w);
  if (s) {
    const kind = String(s.kind ?? "symbol");
    return { contents: { kind: MarkupKind.Markdown, value: `\`${w}\` — ${kind}` } };
  }
  if (KEYWORDS.has(w)) return { contents: { kind: MarkupKind.Markdown, value: `mot-clé \`${w}\`` } };
  return { contents: { kind: MarkupKind.Markdown, value: `identifiant \`${w}\`` } };
}

function wordAt(line: string, ch: number): string | null {
  if (ch > line.length) ch = line.length;
  const l = line.slice(0, ch).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? "";
  const r = line.slice(ch).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? "";
  const w = l + r;
  return w || null;
}

export function provideSignatureHelp(doc: Doc, position: Position): SignatureHelp | null {
  const text = doc.getText();
  const offset = offsetAt(text, position);
  const call = findCallBefore(text, offset);
  if (!call) return null;
  const name = call.name;
  const sig = findFunctionSignature(text, name);
  if (!sig) return null;
  const params = sig.params.map(p => ParameterInformation.create(p));
  const info = SignatureInformation.create(`${name}(${sig.params.join(", ")})`, undefined, ...params);
  const activeParam = Math.min(call.argIndex, Math.max(0, params.length - 1));
  return { signatures: [info], activeSignature: 0, activeParameter: activeParam };
}

function offsetAt(text: string, pos: Position): number {
  const lines = text.split(/\r?\n/);
  let off = 0;
  for (let i=0;i<pos.line;i++) off += (lines[i]?.length ?? 0) + 1;
  return off + pos.character;
}

function findCallBefore(text: string, offset: number): { name: string; argIndex: number } | null {
  let i = offset - 1;
  while (i>=0 && /\s/.test(text[i])) i--;
  let depth = 0, comma = 0;
  while (i>=0) {
    const c = text[i];
    if (c === ")") depth++;
    else if (c === "(") {
      if (depth===0) {
        let j=i-1;
        while (j>=0 && /\s/.test(text[j])) j--;
        let k=j;
        while (k>=0 && /[A-Za-z0-9_]/.test(text[k])) k--;
        const name = text.slice(k+1, j+1);
        if (!name) return null;
        return { name, argIndex: comma };
      }
      depth--;
    } else if (c === "," && depth===0) comma++;
    i--;
  }
  return null;
}

function findFunctionSignature(text: string, name: string): { params: string[] } | null {
  const rx = new RegExp(`\\bfn\\s+${escapeRegExp(name)}\\s*\\(([^)]*)\\)`, "m");
  const m = rx.exec(stripBlockAndLineComments(text));
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return { params: [] };
  const params = splitParams(raw).map(x=>x.trim());
  return { params };
}

function splitParams(s: string): string[] {
  const out: string[] = [];
  let depth=0, cur="";
  for (let i=0;i<s.length;i++){
    const c=s[i];
    if (c==="("||c==="["||c==="{") depth++;
    else if (c===")"||c==="]"||c==="}") depth--;
    if (c==="," && depth===0){ out.push(cur); cur=""; continue; }
    cur+=c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function stripBlockAndLineComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function provideInlayHints(doc: Doc): InlayHint[] {
  const text = doc.getText();
  const hints: InlayHint[] = [];
  const funcs = Array.from(text.matchAll(/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g));
  const paramsByFn = new Map<string, string[]>();
  for (const m of funcs) {
    const name = m[1];
    const params = splitParams((m[2]??"").trim()).map(p => (p.split(":")[0]??"").trim()).filter(Boolean);
    paramsByFn.set(name, params);
  }
  const lines = text.split(/\r?\n/);
  for (let ln=0; ln<lines.length; ln++) {
    const L = stripStringsAndComments(lines[ln]);
    let m: RegExpExecArray|null;
    const rx = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    rx.lastIndex=0;
    while ((m=rx.exec(L))) {
      const fn = m[1];
      const params = paramsByFn.get(fn);
      if (!params || params.length===0) continue;
      const start = m.index! + m[0].length;
      let j = start, depth=1, argIdx=0, argStart=start;
      while (j<L.length && depth>0) {
        const c=L[j];
        if (c==="(") depth++;
        else if (c===")") depth--;
        else if (c==="," && depth===1) {
          const label = params[argIdx] ? params[argIdx]+": " : "";
          hints.push({ position: Position.create(ln, argStart), label, kind: InlayHintKind.Parameter });
          argIdx++; argStart = j+1;
        }
        j++;
      }
      if (argStart<j-1) {
        const label = params[argIdx] ? params[argIdx]+": " : "";
        hints.push({ position: Position.create(ln, argStart), label, kind: InlayHintKind.Parameter });
      }
    }
  }
  return hints;
}
