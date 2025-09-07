import * as vscode from "vscode";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Debug Adapter inline pour Vitl.
 * Exécute la CLI "vitl" et streame stdout/stderr.
 * Breakpoints/step no-op, protocole DAP respecté.
 */
export class VitlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new VitlInlineAdapter());
  }
  dispose() {}
}

type LaunchArgs = {
  program?: string;
  cwd?: string;
  runtimeExecutable?: string;
  runtimeArgs?: string[];
  args?: string[];
  argsFile?: string;           // optionnel: fichier texte d’arguments (un par ligne ou format shell simple)
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  timeoutMs?: number;          // optionnel: kill si dépasse
};

class VitlInlineAdapter implements vscode.DebugAdapter {
  private cp: ChildProcessWithoutNullStreams | null = null;
  private programPath: string | null = null;
  private cwd: string | undefined;
  private runtime = "vitl";
  private args: string[] = [];
  private env: NodeJS.ProcessEnv | undefined;
  private stopOnEntry = false;
  private terminated = false;
  private timeoutHandle: NodeJS.Timeout | null = null;
  private lastLaunch: { request: any; args: LaunchArgs } | null = null;

  private readonly _emitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  public readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> = this._emitter.event;

  handleMessage(message: any): void {
    try {
      const cmd = message?.command as string | undefined;

      switch (cmd) {
        case "initialize":
          this.respond(message, true, {
            supportsConfigurationDoneRequest: true,
            supportsTerminateRequest: true,
            supportsRestartRequest: true,
            supportsCompletionsRequest: false,
            supportsEvaluateForHovers: false,
            supportsSetVariable: false,
            supportsLoadedSourcesRequest: true,
            supportsReadMemoryRequest: false,
            supportsWriteMemoryRequest: false
          });
          this.event("initialized");
          break;

        case "configurationDone":
          this.respond(message, true);
          break;

        case "launch":
          this.handleLaunch(message);
          break;

        case "restart": // DAP facultatif
          this.handleRestart(message);
          break;

        case "disconnect":
        case "terminate":
          if (message?.arguments?.restart) {
            // Arrêt doux puis relance
            this.stop();
            this.event("terminated");
            if (this.lastLaunch) this.handleLaunch(this.lastLaunch.request);
            this.respond(message, true);
          } else {
            this.stop();
            this.event("terminated");
            this.respond(message, true);
          }
          break;

        case "threads":
          this.respond(message, true, { threads: [{ id: 1, name: "Vitl Main" }] });
          break;

        case "continue":
        case "next":
        case "stepIn":
        case "stepOut":
        case "pause":
          this.event("continued", { threadId: 1, allThreadsContinued: true });
          this.respond(message, true, { allThreadsContinued: true });
          break;

        case "stackTrace":
          this.respond(message, true, { stackFrames: this.fakeStack(), totalFrames: 1 });
          break;

        case "scopes":
          this.respond(message, true, { scopes: [{ name: "Locals", variablesReference: 1000, expensive: false }] });
          break;

        case "variables":
          this.respond(message, true, { variables: [] });
          break;

        case "setBreakpoints": {
          const sourcePath = message?.arguments?.source?.path as string | undefined;
          const reqBps: Array<{ line: number; column?: number }> = Array.isArray(message?.arguments?.breakpoints)
            ? message.arguments.breakpoints
            : [];
          const verified = reqBps.map((b, i) => ({
            id: i + 1,
            verified: true,
            line: b.line,
            column: b.column ?? 1,
            source: sourcePath ? { path: sourcePath } : undefined
          }));
          this.respond(message, true, { breakpoints: verified });
          break;
        }

        case "evaluate":
          this.respond(message, true, { result: "evaluate not supported (Vitl stub)", type: "string", variablesReference: 0 });
          break;

        case "loadedSources":
          this.respond(message, true, { sources: this.loadedSources() });
          break;

        case "source": {
          const spath = message?.arguments?.source?.path as string | undefined;
          if (spath && fs.existsSync(spath)) {
            const content = fs.readFileSync(spath, "utf8");
            this.respond(message, true, { content, mimeType: "text/plain" });
          } else {
            this.respond(message, false, undefined, "Source not found");
          }
          break;
        }

        case "setExceptionBreakpoints":
        case "completions":
        case "setVariable":
        default:
          this.respond(message, true);
          break;
      }
    } catch (e: any) {
      this.respond(message, false, undefined, String(e?.message ?? e));
    }
  }

  /* --------------------------- LIFECYCLE -------------------------------- */

  private handleLaunch(message: any) {
    const a = (message?.arguments ?? {}) as LaunchArgs;
    this.lastLaunch = { request: message, args: a };

    this.programPath = this.normPath(a.program) ?? null;
    if (!this.programPath) {
      this.respond(message, false, undefined, "Missing 'program' in launch arguments");
      return;
    }

    this.cwd = this.normPath(a.cwd) ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.runtime = this.nonEmpty(a.runtimeExecutable) ?? "vitl";

    const runtimeArgs = Array.isArray(a.runtimeArgs) ? a.runtimeArgs.filter(isString) : [];
    const progArgsFile = this.readArgsFile(a.argsFile);
    const progArgs = Array.isArray(a.args) ? a.args.filter(isString) : [];
    this.args = [...runtimeArgs, this.programPath, ...progArgsFile, ...progArgs];

    this.stopOnEntry = !!a.stopOnEntry;

    // ENV: merge process.env et a.env
    this.env = { ...process.env, ...(a.env ?? {}) };

    // Anti double lancement
    if (this.cp) this.stop();

    // Lancement
    this.terminated = false;
    this.cp = spawn(this.runtime, this.args, {
      cwd: this.cwd,
      shell: process.platform === "win32", // .cmd/.bat
      env: this.env
    });

    // Timer de sécurité
    if (typeof a.timeoutMs === "number" && a.timeoutMs > 0) {
      this.timeoutHandle = setTimeout(() => {
        this.output(`[vitl] timeout ${a.timeoutMs}ms atteint, arrêt du process\n`, "stderr");
        this.stop();
        this.event("exited", { exitCode: 1 });
        this.event("terminated");
      }, a.timeoutMs);
    }

    // Événements process
    this.event("process", {
      name: path.basename(this.runtime),
      systemProcessId: this.cp.pid,
      isLocalProcess: true,
      startMethod: "launch",
      pointerSize: 64
    });
    this.event("thread", { reason: "started", threadId: 1 });

    // Streams
    this.cp.stdout.on("data", (d) => this.output(d.toString(), "stdout"));
    this.cp.stderr.on("data", (d) => this.output(d.toString(), "stderr"));

    this.cp.on("error", (e) => {
      this.output(`Process error: ${e.message}\n`, "stderr");
      if (!this.terminated) {
        this.event("exited", { exitCode: 1 });
        this.event("terminated");
        this.terminated = true;
      }
    });

    this.cp.on("exit", (code, signal) => {
      const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
      if (!this.terminated) {
        this.event("exited", { exitCode });
        this.event("terminated");
        this.terminated = true;
      }
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }
    });

    if (this.stopOnEntry) {
      this.event("stopped", { reason: "entry", threadId: 1, allThreadsStopped: true });
    } else {
      this.event("continued", { threadId: 1, allThreadsContinued: true });
    }

    this.respond(message, true);
  }

  private handleRestart(message: any) {
    if (!this.lastLaunch) {
      this.respond(message, false, undefined, "No previous launch to restart");
      return;
    }
    this.stop();
    this.event("terminated");
    this.handleLaunch(this.lastLaunch.request);
    this.respond(message, true);
  }

  private stop() {
    if (!this.cp) return;
    try {
      if (process.platform === "win32") {
        this.cp.kill();
      } else {
        this.cp.kill("SIGTERM");
        const ref = this.cp;
        setTimeout(() => {
          if (ref.exitCode === null) ref.kill("SIGKILL");
        }, 1200);
      }
    } catch {
      // ignore
    } finally {
      this.cp = null;
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
      }
    }
  }

  /* ---------------------------- HELPERS -------------------------------- */

  private loadedSources() {
    const list: Array<{ name?: string; path?: string }> = [];
    if (this.programPath) list.push({ name: path.basename(this.programPath), path: this.programPath });
    return list;
  }

  private fakeStack() {
    const file = this.programPath || "unknown.vitl";
    return [
      {
        id: 1,
        name: path.basename(file),
        source: { path: file, name: path.basename(file) },
        line: 1,
        column: 1
      }
    ];
  }

  private respond(req: any, success: boolean, body?: any, message?: string) {
    this.send({
      seq: 0,
      type: "response",
      request_seq: req?.seq ?? 0,
      success,
      command: req?.command,
      message,
      body
    });
  }

  private event(event: string, body?: any) {
    this.send({ type: "event", event, body });
  }

  private output(text: string, category: "stdout" | "stderr" | "console" = "stdout") {
    this.event("output", { category, output: text });
  }

  private send(msg: any) {
    this._emitter.fire(msg as vscode.DebugProtocolMessage);
  }

  private normPath(p?: string) {
    if (!p || typeof p !== "string") return undefined;
    if (p.startsWith("~")) return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(1));
    return p;
  }

  private nonEmpty(s?: string) {
    return typeof s === "string" && s.trim() ? s : undefined;
  }

  private readArgsFile(file?: string): string[] {
    const f = this.normPath(file);
    if (!f) return [];
    try {
      const raw = fs.readFileSync(f, "utf8");
      // Supporte: une arg par ligne OU parsing simple d’une ligne type shell.
      if (raw.includes("\n")) {
        return raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
      }
      // Split basique respectant quotes simples/doubles
      const out: string[] = [];
      let cur = "";
      let quote: '"' | "'" | null = null;
      for (const ch of raw.trim()) {
        if (quote) {
          if ((quote === '"' && ch === '"') || (quote === "'" && ch === "'")) {
            quote = null;
          } else {
            cur += ch;
          }
        } else {
          if (ch === '"' || ch === "'") quote = ch as '"' | "'";
          else if (/\s/.test(ch)) {
            if (cur) {
              out.push(cur);
              cur = "";
            }
          } else cur += ch;
        }
      }
      if (cur) out.push(cur);
      return out;
    } catch {
      this.output(`[vitl] argsFile not readable: ${f}\n`, "stderr");
      return [];
    }
  }

  dispose() {
    this.stop();
    this._emitter.dispose();
  }
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}
