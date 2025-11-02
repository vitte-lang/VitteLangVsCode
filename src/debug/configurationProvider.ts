import * as vscode from 'vscode';
import * as path from 'path';

type VitteDebugJson = Partial<{
  debug: {
    program?: string;
    args?: string[];
    cwd?: string;
    trace?: boolean;
    sourceMaps?: boolean;
    env?: Record<string, string>;
  };
  toolchain?: { root?: string; runtime?: string };
}>;

/** Read and parse JSON file into object. */
async function readJsonFile<T = any>(uri: vscode.Uri): Promise<T | undefined> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    return JSON.parse(doc.getText()) as T;
  } catch {
    return undefined;
  }
}

/** Try multiple known config locations, first hit wins then shallow-merge. */
async function readVitteProjectConfig(): Promise<VitteDebugJson> {
  const results: VitteDebugJson[] = [];

  // 1) vitte.config.json at workspace root
  const rootCfg = await vscode.workspace.findFiles('vitte.config.json', '**/node_modules/**', 1);
  const rootUri = rootCfg[0];
  if (rootUri) {
    const j = await readJsonFile<VitteDebugJson>(rootUri);
    if (j) results.push(j);
  }

  // 2) .vitte/config.json fallback
  const hiddenCfg = await vscode.workspace.findFiles('.vitte/config.json', '**/node_modules/**', 1);
  const hiddenUri = hiddenCfg[0];
  if (hiddenUri) {
    const j = await readJsonFile<VitteDebugJson>(hiddenUri);
    if (j) results.push(j);
  }

  // 3) package.json { vitte: { debug: {...} } }
  const pkg = await vscode.workspace.findFiles('package.json', '**/node_modules/**', 1);
  const pkgUri = pkg[0];
  if (pkgUri) {
    const pjson = await readJsonFile<any>(pkgUri);
    if (pjson && typeof pjson.vitte === 'object') {
      const v: any = pjson.vitte;
      const pick: VitteDebugJson = { debug: {}, toolchain: {} };
      if (v.debug && typeof v.debug === 'object') pick.debug = v.debug;
      if (v.toolchain && typeof v.toolchain === 'object') pick.toolchain = v.toolchain;
      results.push(pick);
    }
  }

  // Merge shallowly from first to last, later wins
  const merged: VitteDebugJson = {};
  for (const r of results) {
    if (r.toolchain) merged.toolchain = { ...(merged.toolchain ?? {}), ...r.toolchain };
    if (r.debug) merged.debug = { ...(merged.debug ?? {}), ...r.debug };
  }
  return merged;
}

function ensureWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Expand VS Code variables and env vars in strings. */
function expand(str: string, fileUri?: vscode.Uri): string {
  const wf = ensureWorkspaceFolder() ?? '';
  const active = fileUri ?? vscode.window.activeTextEditor?.document.uri;
  const filePath = active?.fsPath ?? '';
  const fileDir = filePath ? path.dirname(filePath) : '';
  const env = process.env;
  const table: Record<string, string> = {
    workspaceFolder: wf,
    file: filePath,
    fileDirname: fileDir,
  };
  return str.replace(/\$\{(env:)?([^}]+)}/g, function (_m: string, envPrefix: string | undefined, key: string): string {
    const k = String(key);
    if (envPrefix) return env[k] ?? '';
    return table[k] ?? '';
  });
}

function coerceArgs(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string') as string[];
  if (typeof v === 'string' && v.length) return [v];
  return undefined;
}

function sanitizeEnv(obj: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

function resolveRuntimePath(cfg: vscode.WorkspaceConfiguration, project: VitteDebugJson): string {
  // Priority: launch.json > vitte.debug.program (settings) > project.debug.program > toolchain.runtime > default
  const setProgram = cfg.get<string>('debug.program');
  if (setProgram && setProgram.trim()) return setProgram;

  const projectProg = project.debug?.program || project.toolchain?.runtime;
  let candidate = projectProg || 'vitte-runtime';

  // Prepend toolchain.root when relative
  const toolchainRoot = cfg.get<string>('toolchain.root') || project.toolchain?.root || cfg.get<string>('toolchainPath');
  if (toolchainRoot && candidate && !path.isAbsolute(candidate)) {
    candidate = path.join(toolchainRoot, candidate);
  }
  return candidate;
}

/**
 * Provides initial debug configurations and resolves them using Vitte settings and project config files.
 */
class VitteDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  provideDebugConfigurations(_folder: vscode.WorkspaceFolder | undefined): vscode.ProviderResult<vscode.DebugConfiguration[]> {
    const workspaceFolder = ensureWorkspaceFolder() ?? '${workspaceFolder}';
    return [
      {
        name: 'Vitte: Launch current file',
        type: 'vitte',
        request: 'launch',
        program: 'vitte-runtime',
        args: ['run', '${file}'],
        cwd: workspaceFolder
      },
      {
        name: 'Vitte: Launch project entry',
        type: 'vitte',
        request: 'launch',
        program: 'vitte-runtime',
        args: ['run'],
        cwd: workspaceFolder
      },
      {
        name: 'Vitte: Launch with args…',
        type: 'vitte',
        request: 'launch',
        program: 'vitte-runtime',
        args: [],
        cwd: workspaceFolder
      }
    ];
  }

  async resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration | null | undefined> {
    const settings = vscode.workspace.getConfiguration('vitte');
    const project = await readVitteProjectConfig();

    const workspaceFolder = folder?.uri.fsPath ?? ensureWorkspaceFolder() ?? process.cwd();
    const activeUri = vscode.window.activeTextEditor?.document.uri;

    // Merge and sanitize environment maps (ensure values are strings)
    const mergedEnvRaw = {
      ...(project.debug?.env ?? {}),
      ...(typeof (config as any).env === 'object' && (config as any).env ? (config as any).env : {}),
    } as unknown;
    const mergedEnv = sanitizeEnv(mergedEnvRaw);

    const base: vscode.DebugConfiguration = {
      type: 'vitte',
      request: 'launch',
      name: config.name || 'Vitte: Launch',
      program: resolveRuntimePath(settings, project),
      args: coerceArgs((config as any).args) ?? coerceArgs(project.debug?.args) ?? ['run'],
      cwd: typeof (config as any).cwd === 'string' && (config as any).cwd.length > 0 ? (config as any).cwd : (project.debug?.cwd || workspaceFolder),
      env: mergedEnv,
    };

    // Optional flags
    if (typeof project.debug?.trace === 'boolean' && typeof (config as any).trace !== 'boolean') (base as any).trace = project.debug?.trace;
    if (typeof project.debug?.sourceMaps === 'boolean' && typeof (config as any).sourceMaps !== 'boolean') (base as any).sourceMaps = project.debug?.sourceMaps;

    // VS Code variable expansion
    base.program = expand(base.program, activeUri);
    base.cwd = expand(base.cwd, activeUri);
    base.args = (base.args as string[]).map((s) => expand(s, activeUri));
    if (base.env) {
      const env: Record<string, string> = {};
      const entries = Object.entries(base.env as Record<string, string>);
      for (const [k, v] of entries) env[k] = expand(String(v), activeUri);
      base.env = env;
    }

    // Sanity
    if (!base.program || typeof base.program !== 'string') {
      void vscode.window.showErrorMessage('Vitte: aucun binaire runtime configuré. Configurez "vitte.debug.program" ou vitte.config.json > debug.program.');
      return undefined;
    }

    return base;
  }
}

export function registerDebugConfigurationProvider(ctx: vscode.ExtensionContext) {
  const provider = new VitteDebugConfigurationProvider();
  ctx.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('vitte', provider));
}
