import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as net from 'net';
import * as path from 'path';

/**
 * Vitl Debug Adapter
 * Tries to start a DAP server from `vitl-runtime` first, then falls back to stdio.
 * Understands workspace settings under `vitte.*` to keep parity with Vitte.
 */
export function registerVitlDebugAdapter(context: vscode.ExtensionContext) {
  const factory = new VitlDebugAdapterFactory();
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('vitl', factory),
    factory
  );
}

class VitlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory, vscode.Disposable {
  private readonly sessions = new Map<string, cp.ChildProcess>();

  dispose(): void {
    for (const p of this.sessions.values()) {
      try { p.kill(); } catch { /* noop */ }
    }
    this.sessions.clear();
  }

  async createDebugAdapterDescriptor(session: vscode.DebugSession): Promise<vscode.DebugAdapterDescriptor> {
    const cfg = vscode.workspace.getConfiguration('vitte');

    const { program, cwd, extraArgs } = this.resolveRuntimeAndArgs(cfg, session);

    // Prefer server mode
    const server = await this.tryStartServer(program, cwd, extraArgs);
    if (server.ok) {
      this.sessions.set(session.id, server.proc);
      return new vscode.DebugAdapterServer(server.port, '127.0.0.1');
    }

    // Fallback to stdio
    const exec = this.buildExecutable(program, cwd, extraArgs);
    const opts: vscode.DebugAdapterExecutableOptions = { cwd: exec.cwd };
    const envMap = this.toVscodeEnv(exec.env);
    if (envMap) { (opts as any).env = envMap; }
    return new vscode.DebugAdapterExecutable(exec.command, exec.args, opts);
  }

  // ---- helpers (typing/guards) ------------------------------------------------
  private toVscodeEnv(env: NodeJS.ProcessEnv | undefined): { [key: string]: string } | undefined {
    if (!env) return undefined;
    const out: { [key: string]: string } = {};
    for (const k of Object.keys(env)) {
      const v = env[k];
      if (typeof v === 'string') out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }

  private ensureString(x: string | undefined, fallback: string): string {
    return (typeof x === 'string' && x.length > 0) ? x : fallback;
  }

  private sanitizeArgs(args: Array<string | undefined>): string[] {
    return args.filter((a): a is string => typeof a === 'string' && a.length > 0);
  }

  // ---- resolution -------------------------------------------------------------
  private resolveRuntimeAndArgs(cfg: vscode.WorkspaceConfiguration, session: vscode.DebugSession): { program: string; cwd: string; extraArgs: string[] } {
    // Settings or default (accept vitl‑specific first, then vitte.debug.program, else 'vitl-runtime')
    const explicit = cfg.get<string>('vitl.debug.program')
      || cfg.get<string>('debug.program')
      || 'vitl-runtime';

    const toolchainRoot = cfg.get<string>('toolchain.root') || cfg.get<string>('toolchainPath');
    const program = toolchainRoot && explicit && !path.isAbsolute(explicit)
      ? path.join(toolchainRoot, explicit)
      : explicit;

    const cwd = typeof (session.configuration as any).cwd === 'string' && (session.configuration as any).cwd.length > 0
      ? (session.configuration as any).cwd
      : (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
          ? vscode.workspace.workspaceFolders[0].uri.fsPath
          : process.cwd());

    // Allow passing args from launch.json
    const extraArgs = this.sanitizeArgs(
      Array.isArray((session.configuration as any).args)
        ? (session.configuration as any).args
        : (typeof (session.configuration as any).args === 'string' ? [(session.configuration as any).args] : [])
    );

    return { program: this.ensureString(program, 'vitl-runtime'), cwd: this.ensureString(cwd, process.cwd()), extraArgs };
  }

  // ---- server probing ---------------------------------------------------------
  private async tryStartServer(program: string, cwd: string, extraArgs: string[]): Promise<{ ok: true, proc: cp.ChildProcess, port: number } | { ok: false, error: Error }> {
    // Strategy A: `dap --port 0`
    const a = await this.spawnAndDetectPort(program, ['dap', '--port', '0', ...extraArgs], cwd);
    if (a.ok) return a;

    // Strategy B: `--dap --port 0`
    const b = await this.spawnAndDetectPort(program, ['--dap', '--port', '0', ...extraArgs], cwd);
    if (b.ok) return b;

    // Strategy C: `dap` and parse announced port
    const c = await this.spawnAndDetectPort(program, ['dap', ...extraArgs], cwd);
    if (c.ok) return c;

    return { ok: false, error: new Error('No DAP server mode detected for vitl runtime') };
  }

  private spawnAndDetectPort(program: string, args: string[], cwd: string): Promise<{ ok: true, proc: cp.ChildProcess, port: number } | { ok: false, error: Error }> {
    return new Promise((resolve) => {
      let resolved = false;
      const cmd = this.ensureString(program, 'vitl-runtime');
      const argv = this.sanitizeArgs(args);
      const proc = cp.spawn(cmd, argv, { cwd: this.ensureString(cwd, process.cwd()), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });

      const finish = (err?: Error) => {
        if (!resolved) {
          resolved = true;
          resolve({ ok: false, error: err ?? new Error('port detection failed') });
        }
      };

      const sniff = (buf: Buffer) => {
        if (resolved) return;
        const text = buf.toString();
        const m = text.match(/(?:listening\s+on\s+[^:]+:|port\s*=|DAP_PORT=)(\d{3,5})/i);
        if (m) {
          const g = m[1];
          if (!g) return;
          const port = Number.parseInt(g, 10);
          if (Number.isInteger(port) && port > 0 && port < 65536) {
            resolved = true;
            // quick probe
            const sock = new net.Socket();
            sock.once('error', () => resolve({ ok: true, proc, port }));
            sock.connect(port, '127.0.0.1', () => { sock.destroy(); resolve({ ok: true, proc, port }); });
          }
        }
      };

      proc.stdout?.on('data', sniff);
      proc.stderr?.on('data', sniff);
      proc.once('error', (e) => finish(e as Error));
      proc.once('exit', (code, sig) => finish(new Error(`exited early (code=${String(code)}, sig=${String(sig ?? 'null')})`)));
      setTimeout(() => finish(new Error('timeout waiting for dap port')), 4000);
    });
  }

  // ---- stdio fallback ---------------------------------------------------------
  private buildExecutable(program: string, cwd: string, extraArgs: string[]) {
    // Try stdio flags, otherwise pass through
    const candidates: string[][] = [
      ['dap', '--stdio'],
      ['--dap', '--stdio'],
      []
    ];
    const base = this.sanitizeArgs(extraArgs);
    const args = base.length > 0 ? base : candidates[0];
    return { command: program, args, cwd, env: process.env as NodeJS.ProcessEnv };
  }
}
