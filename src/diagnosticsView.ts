import * as path from "node:path";
import * as vscode from "vscode";

type SeverityKey = 'error' | 'warning' | 'information' | 'hint';
type DisplayMode = "compact" | "detailed";

// 🟩 Vitte: diagnostics view settings & helpers
interface VitteDiagnosticsConfig {
  /** Allowed severities; when empty or undefined -> show all. */
  severities?: SeverityKey[];
  /** Debounce delay in ms for refresh. */
  refreshDebounceMs?: number;
  /** Visual density in diagnostics view. */
  displayMode?: DisplayMode;
}

const VALID_SEVERITY_MAP: Record<SeverityKey, true> = {
  error: true,
  warning: true,
  information: true,
  hint: true,
};

const DEFAULT_CFG: Readonly<Required<VitteDiagnosticsConfig>> = {
  severities: [],
  refreshDebounceMs: 150,
  displayMode: "compact",
};

function isSeverityKey(value: unknown): value is SeverityKey {
  return typeof value === 'string' && value in VALID_SEVERITY_MAP;
}

function readConfig(): Required<VitteDiagnosticsConfig> {
  const cfg = vscode.workspace.getConfiguration('vitte').get<VitteDiagnosticsConfig>('diagnostics') ?? {};
  const severities = Array.isArray(cfg.severities)
    ? cfg.severities.filter(isSeverityKey)
    : [];
  const refreshDebounceMs = typeof cfg.refreshDebounceMs === 'number'
    ? Math.max(0, cfg.refreshDebounceMs)
    : DEFAULT_CFG.refreshDebounceMs;
  const displayMode: DisplayMode = cfg.displayMode === "detailed" ? "detailed" : "compact";
  return {
    severities,
    refreshDebounceMs,
    displayMode,
  };
}

function sevToName(s?: vscode.DiagnosticSeverity): 'error' | 'warning' | 'information' | 'hint' | 'unknown' {
  switch (s) {
    case vscode.DiagnosticSeverity.Error: return 'error';
    case vscode.DiagnosticSeverity.Warning: return 'warning';
    case vscode.DiagnosticSeverity.Information: return 'information';
    case vscode.DiagnosticSeverity.Hint: return 'hint';
    default: return 'unknown';
  }
}

function matchesFilter(s: vscode.DiagnosticSeverity | undefined, allowed: SeverityKey[]): boolean {
  if (allowed.length === 0) return true;
  const name = sevToName(s);
  return name !== 'unknown' && allowed.includes(name);
}

function countBySeverity(list: AggregatedDiagnostic[]) {
  let e=0, w=0, i=0, h=0;
  for (const d of list) {
    switch (d.diagnostic.severity) {
      case vscode.DiagnosticSeverity.Error: e++; break;
      case vscode.DiagnosticSeverity.Warning: w++; break;
      case vscode.DiagnosticSeverity.Information: i++; break;
      case vscode.DiagnosticSeverity.Hint: h++; break;
    }
  }
  return { e, w, i, h };
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let tid: NodeJS.Timeout | undefined;
  const debounced = function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    if (tid) clearTimeout(tid);
    tid = setTimeout(() => fn.apply(this, args), ms);
  };
  return debounced as T;
}

const SUPPORTED_EXTS = new Set([".vitte", ".vit"]);

export interface DiagnosticsView {
  readonly provider: DiagnosticsTreeDataProvider;
  readonly tree: vscode.TreeView<TreeNode>;
  refresh(): void;
}

type TreeNode = FileNode | DiagnosticNode;

interface AggregatedDiagnostic {
  uri: vscode.Uri;
  diagnostic: vscode.Diagnostic;
  index: number;
}

function openLineText(uri: vscode.Uri, line: number): string {
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (!doc) return "";
  if (line < 0 || line >= doc.lineCount) return "";
  return doc.lineAt(line).text;
}

function syntaxSuggestion(entry: AggregatedDiagnostic): string | undefined {
  const codeRaw = entry.diagnostic.code;
  const code = typeof codeRaw === "string" || typeof codeRaw === "number" ? String(codeRaw) : "";
  if (!code) return undefined;

  if (code === "E0007") {
    const lineText = openLineText(entry.uri, entry.diagnostic.range.start.line).trim();
    if (lineText === "}") {
      return "Suggestion: accolade fermante orpheline au top-level. Supprime `}` ou ferme le bloc précédent.";
    }
    return "Suggestion: place ce code dans `proc ... { ... }` ou `entry ... { ... }`, ou ajoute une déclaration top-level (`space`, `use`, `form`, `pick`, `type`, `const`, `proc`, `entry`).";
  }
  if (code === "E0001") return "Suggestion: ajoute un identifiant valide (lettres/chiffres/`_`, sans commencer par un chiffre).";
  if (code === "E0002") return "Suggestion: ajoute une expression valide (`1`, `name`, `call()`, `{ ... }`).";
  if (code === "E0003") return "Suggestion: ajoute un pattern valide (identifiant, constructeur, pattern tuple/liste).";
  if (code === "E0004") return "Suggestion: ajoute un type valide (`int`, `i32`, `string`, `bool`, `Option[T]`, ...).";
  if (code === "E0005") return "Suggestion: termine le bloc avec `.end`.";
  if (code === "E0006") return "Suggestion: un attribut doit être suivi d’un `proc`.";
  return undefined;
}

function diagnosticCodeText(d: vscode.Diagnostic): string {
  const raw = d.code;
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
}

function diagnosticExplanationMessage(entry: AggregatedDiagnostic): string {
  const pos = entry.diagnostic.range.start;
  const code = diagnosticCodeText(entry.diagnostic);
  const source = entry.diagnostic.source ? `Source: ${entry.diagnostic.source}` : "Source: unknown";
  const suggestion = syntaxSuggestion(entry) ?? "Suggestion: inspect the surrounding block and apply the closest Quick Fix.";
  const codePart = code ? `Code: ${code}\n` : "";
  return `${source}\n${codePart}${entry.uri.fsPath}:${pos.line + 1}:${pos.character + 1}\n\n${entry.diagnostic.message}\n\n${suggestion}`;
}

function toAggregatedDiagnostic(arg: unknown): AggregatedDiagnostic | undefined {
  if (!arg || typeof arg !== "object") return undefined;
  const maybe = arg as { uri?: unknown; diagnostic?: unknown; index?: unknown };
  if (!(maybe.uri instanceof vscode.Uri)) return undefined;
  const diagnostic = maybe.diagnostic as vscode.Diagnostic | undefined;
  if (!diagnostic || !(diagnostic.range instanceof vscode.Range)) return undefined;
  return { uri: maybe.uri, diagnostic, index: typeof maybe.index === "number" ? maybe.index : 0 };
}

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly uri: vscode.Uri,
    private readonly entries: AggregatedDiagnostic[],
    private readonly displayMode: DisplayMode,
    collState: vscode.TreeItemCollapsibleState
  ) {
    super(relativeLabel(uri), collState);
    const c = countBySeverity(entries);
    const parts: string[] = [];
    if (c.e) parts.push(`${c.e} erreur${c.e>1?'s':''}`);
    if (c.w) parts.push(`${c.w} avertissement${c.w>1?'s':''}`);
    if (c.i) parts.push(`${c.i} info${c.i>1?'s':''}`);
    if (c.h) parts.push(`${c.h} astuce${c.h>1?'s':''}`);
    if (displayMode === "detailed") {
      const total = `${entries.length} ${entries.length > 1 ? "problèmes" : "problème"}`;
      this.description = parts.length ? `${total} • ${parts.join(", ")}` : total;
    } else {
      this.description = `${entries.length}`;
    }
    this.contextValue = "vitteDiagnosticFile";
    this.iconPath = vscode.ThemeIcon.File;
  }

  get children(): DiagnosticNode[] {
    return this.entries.map(entry => new DiagnosticNode(entry, this.displayMode));
  }
}

class DiagnosticNode extends vscode.TreeItem {
  constructor(public readonly entry: AggregatedDiagnostic, displayMode: DisplayMode) {
    super(formatDiagnosticNodeLabel(entry, displayMode), vscode.TreeItemCollapsibleState.None);
    const pos = entry.diagnostic.range.start;
    const severityName = sevToName(entry.diagnostic.severity);
    this.description = displayMode === "detailed"
      ? `${severityName} • L${pos.line + 1}:C${pos.character + 1}`
      : `L${pos.line + 1}:C${pos.character + 1}`;
    const parts = [
      entry.diagnostic.message,
      `${entry.uri.fsPath}:${pos.line + 1}:${pos.character + 1}`,
      entry.diagnostic.source ? `Source: ${entry.diagnostic.source}` : ""
    ].filter(Boolean);
    const codeValue = entry.diagnostic.code;
    const codeText = typeof codeValue === 'string' || typeof codeValue === 'number'
      ? `Code: ${String(codeValue)}`
      : undefined;
    const suggestion = syntaxSuggestion(entry);
    const extra = [severityName && `Niveau: ${severityName}`, codeText, suggestion].filter(Boolean).join('\n');
    this.tooltip = [parts.join('\n'), extra].filter(Boolean).join('\n');
    this.iconPath = iconForSeverity(entry.diagnostic.severity);
    this.command = {
      command: "vitte.diagnostics.explain",
      title: "Expliquer le diagnostic",
      arguments: [entry]
    };
    this.contextValue = "vitteDiagnostic";
  }
}

class DiagnosticsTreeDataProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined> = this.onDidChangeEmitter.event;

  private nodes: FileNode[] = [];
  private cfg: Required<VitteDiagnosticsConfig> = DEFAULT_CFG;
  private schedule = debounce(() => this.refresh(), this.cfg.refreshDebounceMs);

  refresh(): void {
    this.cfg = readConfig();
    try {
      // rebuild nodes from diagnostics with filtering
      this.nodes = buildFileNodes(this.cfg);
    } catch (err) {
      this.nodes = [];
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[vitte] diagnostics refresh failed: ${msg}`);
    }
    this.onDidChangeEmitter.fire(undefined);
  }

  refreshDebounced(): void {
    // re-create debouncer if delay changed
    this.schedule = debounce(() => this.refresh(), this.cfg.refreshDebounceMs);
    this.schedule();
  }

  hasItems(): boolean {
    return this.nodes.length > 0;
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
    if (!element) return this.nodes;
    if (element instanceof FileNode) return element.children;
    return [];
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }
}

export function registerDiagnosticsView(context: vscode.ExtensionContext): DiagnosticsView {
  const provider = new DiagnosticsTreeDataProvider();
  const tree = vscode.window.createTreeView<TreeNode>("vitteDiagnostics", { treeDataProvider: provider });

  const refresh = () => {
    provider.refresh();
    if (provider.hasItems()) {
      tree.message = '';
    } else {
      tree.message = '$(pass-filled) Aucun diagnostic Vitte détecté';
    }
  };

  const refreshDebounced = () => {
    provider.refreshDebounced();
    if (!provider.hasItems()) tree.message = '$(pass-filled) Aucun diagnostic Vitte détecté';
  };

  refresh();

  context.subscriptions.push(
    tree,
    provider,
    vscode.languages.onDidChangeDiagnostics(refreshDebounced),
    vscode.workspace.onDidCloseTextDocument(refreshDebounced),
    vscode.workspace.onDidOpenTextDocument(refreshDebounced),
    vscode.workspace.onDidSaveTextDocument(refreshDebounced),
    vscode.commands.registerCommand("vitte.diagnostics.refresh", refresh),
    vscode.commands.registerCommand("vitte.diagnostics.open", async (arg?: unknown) => {
      const entry = toAggregatedDiagnostic(arg);
      if (!entry) return;
      const doc = await vscode.workspace.openTextDocument(entry.uri);
      const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: true });
      const range = entry.diagnostic.range;
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
    }),
    vscode.commands.registerCommand('vitte.diagnostics.copy', async (arg?: unknown) => {
      const entry = toAggregatedDiagnostic(arg);
      if (!entry) return;
      const pos = entry.diagnostic.range.start;
      const text = `${entry.uri.fsPath}:${pos.line + 1}:${pos.character + 1} — ${entry.diagnostic.message}`;
      await vscode.env.clipboard.writeText(text);
      void vscode.window.setStatusBarMessage('Diagnostic copié dans le presse-papiers', 2000);
    }),
    vscode.commands.registerCommand("vitte.diagnostics.explain", async (arg?: unknown) => {
      let entry = toAggregatedDiagnostic(arg);
      if (!entry) {
        const active = vscode.window.activeTextEditor;
        if (!active) return;
        const pos = active.selection.active;
        const hit = vscode.languages.getDiagnostics(active.document.uri).find((d) => d.range.contains(pos) || d.range.start.line === pos.line);
        if (!hit) {
          void vscode.window.showInformationMessage("Vitte: no diagnostic at cursor.");
          return;
        }
        entry = { uri: active.document.uri, diagnostic: hit, index: 0 };
      }
      const doc = await vscode.workspace.openTextDocument(entry.uri);
      const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: true });
      const range = entry.diagnostic.range;
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
      const detail = diagnosticExplanationMessage(entry);
      void vscode.window.showInformationMessage(`Vitte diagnostic: ${entry.diagnostic.message}`, "Copy explanation")
        .then(async (choice) => {
          if (choice !== "Copy explanation") return;
          await vscode.env.clipboard.writeText(detail);
          void vscode.window.setStatusBarMessage("Vitte diagnostic explanation copied", 2000);
        });
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("vitte.diagnostics.displayMode")) return;
      refresh();
    }),
  );

  vscode.window.onDidChangeActiveTextEditor(refresh, undefined, context.subscriptions);

  return { provider, tree, refresh };
}

function buildFileNodes(cfg: Required<VitteDiagnosticsConfig>): FileNode[] {
  const entries = collectDiagnostics(cfg);
  const byFile = new Map<string, AggregatedDiagnostic[]>();
  for (const entry of entries) {
    const key = entry.uri.toString();
    const arr = byFile.get(key) ?? [];
    arr.push(entry);
    byFile.set(key, arr);
  }

  const perFile = Array.from(byFile.values())
    .map(list => list.slice().sort(compareDiagnostics))
    .filter(list => list.length > 0);

  perFile.sort(compareFiles);

  return perFile.map(list => {
    const [head] = list;
    if (!head) {
      throw new Error('Invariant: diagnostics list is empty');
    }
    return new FileNode(head.uri, list, cfg.displayMode, vscode.TreeItemCollapsibleState.Expanded);
  });
}

function collectDiagnostics(cfg: Required<VitteDiagnosticsConfig>): AggregatedDiagnostic[] {
  const all = vscode.languages.getDiagnostics();
  const collected: AggregatedDiagnostic[] = [];
  for (const [uri, diagnostics] of all) {
    if (uri.scheme !== 'file') continue;
    if (!SUPPORTED_EXTS.has(path.extname(uri.fsPath))) continue;
    if (!Array.isArray(diagnostics)) continue;
    diagnostics.forEach((diagnostic, index) => {
      if (!matchesFilter(diagnostic.severity, cfg.severities)) return;
      collected.push({ uri, diagnostic, index });
    });
  }
  return collected;
}

function compareDiagnostics(a: AggregatedDiagnostic, b: AggregatedDiagnostic): number {
  const severityDiff = (a.diagnostic.severity ?? vscode.DiagnosticSeverity.Information) -
    (b.diagnostic.severity ?? vscode.DiagnosticSeverity.Information);
  if (severityDiff !== 0) return severityDiff;
  const lineDiff = a.diagnostic.range.start.line - b.diagnostic.range.start.line;
  if (lineDiff !== 0) return lineDiff;
  return a.diagnostic.range.start.character - b.diagnostic.range.start.character;
}

function compareFiles(
  a: readonly AggregatedDiagnostic[] | undefined,
  b: readonly AggregatedDiagnostic[] | undefined,
): number {
  const headA = firstEntry(a);
  const headB = firstEntry(b);
  const sevA = severityOrder(headA?.diagnostic.severity);
  const sevB = severityOrder(headB?.diagnostic.severity);
  if (sevA !== sevB) return sevA - sevB;
  const countA = a?.length ?? 0;
  const countB = b?.length ?? 0;
  if (countA !== countB) return countB - countA;
  const uriA = headA?.uri;
  const uriB = headB?.uri;
  return relativeLabel(uriA).localeCompare(relativeLabel(uriB));
}

function firstEntry(
  list: readonly AggregatedDiagnostic[] | undefined,
): AggregatedDiagnostic | undefined {
  if (!list || list.length === 0) return undefined;
  return list[0];
}

function relativeLabel(uri: vscode.Uri | undefined): string {
  if (!uri) return "";
  const rel = vscode.workspace.asRelativePath(uri, false);
  return rel || uri.fsPath;
}

function iconForSeverity(severity: vscode.DiagnosticSeverity | undefined): vscode.ThemeIcon {
  const makeIcon = (id: string): vscode.ThemeIcon => ({ id } as vscode.ThemeIcon);
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return makeIcon("error");
    case vscode.DiagnosticSeverity.Warning:
      return makeIcon("warning");
    case vscode.DiagnosticSeverity.Information:
      return makeIcon("info");
    case vscode.DiagnosticSeverity.Hint:
      return makeIcon("lightbulb");
    default:
      return makeIcon("question");
  }
}

function severityOrder(severity: vscode.DiagnosticSeverity | undefined): number {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error: return 0;
    case vscode.DiagnosticSeverity.Warning: return 1;
    case vscode.DiagnosticSeverity.Information: return 2;
    case vscode.DiagnosticSeverity.Hint: return 3;
    default: return 4;
  }
}

function diagnosticCodeLabel(diagnostic: vscode.Diagnostic): string {
  const raw = diagnostic.code;
  if (typeof raw === "string" || typeof raw === "number") return `[${String(raw)}] `;
  return "";
}

function compactText(text: string, maxLen = 100): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function formatDiagnosticNodeLabel(entry: AggregatedDiagnostic, displayMode: DisplayMode): string {
  const prefix = diagnosticCodeLabel(entry.diagnostic);
  const message = displayMode === "detailed"
    ? entry.diagnostic.message
    : compactText(entry.diagnostic.message, 100);
  return `${prefix}${message}`;
}
