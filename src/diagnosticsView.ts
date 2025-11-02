import * as path from "node:path";
import * as vscode from "vscode";

// 🟩 Vitte: diagnostics view settings & helpers
interface VitteDiagnosticsConfig {
  /** Allowed severities; when empty or undefined -> show all. */
  severities?: Array<'error' | 'warning' | 'information' | 'hint'>;
  /** Debounce delay in ms for refresh. */
  refreshDebounceMs?: number;
}

const DEFAULT_CFG: Required<VitteDiagnosticsConfig> = {
  severities: [],
  refreshDebounceMs: 150,
};

function readConfig(): Required<VitteDiagnosticsConfig> {
  const cfg = vscode.workspace.getConfiguration('vitte').get<VitteDiagnosticsConfig>('diagnostics');
  if (!cfg) return DEFAULT_CFG;
  return {
    severities: Array.isArray(cfg.severities) ? cfg.severities.slice() as any : [],
    refreshDebounceMs: typeof cfg.refreshDebounceMs === 'number' ? Math.max(0, cfg.refreshDebounceMs) : 150,
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

function matchesFilter(s: vscode.DiagnosticSeverity | undefined, allowed: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  const name = sevToName(s);
  return name !== 'unknown' && allowed.includes(name as any);
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

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let tid: NodeJS.Timeout | undefined;
  return function(this: any, ...args: any[]) {
    if (tid) clearTimeout(tid);
    tid = setTimeout(() => fn.apply(this, args), ms);
  } as T;
}

const SUPPORTED_EXTS = new Set([".vitte", ".vit", ".vitl"]);

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

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly uri: vscode.Uri,
    private readonly entries: AggregatedDiagnostic[],
    collState: vscode.TreeItemCollapsibleState
  ) {
    super(relativeLabel(uri), collState);
    const c = countBySeverity(entries);
    const parts: string[] = [];
    if (c.e) parts.push(`${c.e} erreur${c.e>1?'s':''}`);
    if (c.w) parts.push(`${c.w} avertissement${c.w>1?'s':''}`);
    if (c.i) parts.push(`${c.i} info${c.i>1?'s':''}`);
    if (c.h) parts.push(`${c.h} astuce${c.h>1?'s':''}`);
    this.description = parts.length ? parts.join(', ') : `${entries.length} ${entries.length > 1 ? 'problèmes' : 'problème'}`;
    this.contextValue = "vitteDiagnosticFile";
    this.iconPath = vscode.ThemeIcon.File;
  }

  get children(): DiagnosticNode[] {
    return this.entries.map(entry => new DiagnosticNode(entry));
  }
}

class DiagnosticNode extends vscode.TreeItem {
  constructor(public readonly entry: AggregatedDiagnostic) {
    super(entry.diagnostic.message, vscode.TreeItemCollapsibleState.None);
    const pos = entry.diagnostic.range.start;
    this.description = `L${pos.line + 1}:C${pos.character + 1}`;
    const parts = [
      entry.diagnostic.message,
      `${entry.uri.fsPath}:${pos.line + 1}:${pos.character + 1}`,
      entry.diagnostic.source ? `Source: ${entry.diagnostic.source}` : ""
    ].filter(Boolean);
    const severityName = sevToName(entry.diagnostic.severity);
    const code = entry.diagnostic.code ? `Code: ${String(entry.diagnostic.code)}` : '';
    const extra = [severityName && `Niveau: ${severityName}`, code].filter(Boolean).join('\n');
    this.tooltip = [parts.join('\n'), extra].filter(Boolean).join('\n');
    this.iconPath = iconForSeverity(entry.diagnostic.severity);
    this.command = {
      command: "vitte.diagnostics.open",
      title: "Ouvrir le diagnostic",
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
    // rebuild nodes from diagnostics with filtering
    this.nodes = buildFileNodes(this.cfg);
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
    vscode.commands.registerCommand("vitte.diagnostics.open", async (entry: AggregatedDiagnostic) => {
      if (!entry?.uri) return;
      const doc = await vscode.workspace.openTextDocument(entry.uri);
      const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: true });
      const range = entry.diagnostic.range;
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
    }),
    vscode.commands.registerCommand('vitte.diagnostics.copy', async (entry: AggregatedDiagnostic) => {
      if (!entry) return;
      const pos = entry.diagnostic.range.start;
      const text = `${entry.uri.fsPath}:${pos.line + 1}:${pos.character + 1} — ${entry.diagnostic.message}`;
      await vscode.env.clipboard.writeText(text);
      void vscode.window.setStatusBarMessage('Diagnostic copié dans le presse-papiers', 2000);
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
    .map(list => list.sort(compareDiagnostics))
    .filter(list => list.length > 0);

  perFile.sort(compareFiles);

  return perFile.map(list => new FileNode(list[0]!.uri, list, vscode.TreeItemCollapsibleState.Expanded));
}

function collectDiagnostics(cfg: Required<VitteDiagnosticsConfig>): AggregatedDiagnostic[] {
  const all = vscode.languages.getDiagnostics();
  const collected: AggregatedDiagnostic[] = [];
  for (const [uri, diagnostics] of all) {
    if (uri.scheme !== 'file') continue;
    if (!SUPPORTED_EXTS.has(path.extname(uri.fsPath))) continue;
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

function compareFiles(a: AggregatedDiagnostic[], b: AggregatedDiagnostic[]): number {
  const uriA = a[0]?.uri;
  const uriB = b[0]?.uri;
  return relativeLabel(uriA).localeCompare(relativeLabel(uriB));
}

function relativeLabel(uri: vscode.Uri | undefined): string {
  if (!uri) return "";
  const rel = vscode.workspace.asRelativePath(uri, false);
  return rel || uri.fsPath;
}

function iconForSeverity(severity: vscode.DiagnosticSeverity | undefined): vscode.ThemeIcon {
  const ctor = (vscode.ThemeIcon as unknown as { new(id: string): vscode.ThemeIcon });
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return new ctor("error");
    case vscode.DiagnosticSeverity.Warning:
      return new ctor("warning");
    case vscode.DiagnosticSeverity.Information:
      return new ctor("info");
    case vscode.DiagnosticSeverity.Hint:
      return new ctor("lightbulb");
    default:
      return new ctor("question");
  }
}
