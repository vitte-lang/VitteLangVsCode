import * as vscode from "vscode";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";

/**
 * Debug Adapter inline pour Vitl.
 * Lance la CLI "vitl" (ou runtimeExecutable) et streame stdout/stderr.
 * Pas d’instrumentation VM : breakpoints/step sont no-op mais le protocole DAP est respecté.
 */
export class VitlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new VitlInlineAdapter());
  }
  dispose() {}
}

class VitlInlineAdapter implements vscode.DebugAdapter {
  private cp: ChildProcessWithoutNullStreams | null = null;
  private programPath: string | null = null;
  private cwd: string | undefined;
  private runtime = "vitl";
  private args: string[] = [];
  private stopOnEntry = false;
  private terminated = false;

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
            supportsRestartRequest: false,
            supportsCompletionsRequest: false,
            supportsEvaluateForHovers: false,
            supportsSetVariable: false
          });
          this.event("initialized");
          break;

        case "configurationDone":
          this.respond(message, true);
          break;

        case "launch":
          this.handleLaunch(message);
          break;

        case "disconnect":
        case "terminate":
          this.stop();
          this.event("terminated");
          this.respond(message, true);
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
          this.respond(message, true, {
            stackFrames: this.fakeStack(),
            totalFrames: 1
          });
          break;

        case "scopes":
          this.respond(message, true, {
            scopes: [{ name: "Locals", variablesReference: 1000, expensive: false }]
          });
          break;

        case "variables":
          this.respond(message, true, { variables: [] });
          break;

        case "setBreakpoints": {
          const sourcePath = message?.arguments?.source?.path as string | undefined;
          const reqBps: Array<{ line: number }> = Array.isArray(message?.arguments?.breakpoints)
            ? message.arguments.breakpoints
            : [];
          const verified = reqBps.map((b, i) => ({
            id: i + 1,
            verified: true,
            line: b.line,
            source: sourcePath ? { path: sourcePath } : undefined
          }));
          this.respond(message, true, { breakpoints: verified });
          break;
        }

        case "evaluate":
          this.respond(message, true, {
            result: "evaluate not supported (Vitl stub)",
            type: "string",
            variablesReference: 0
          });
          break;

        case "setExceptionBreakpoints":
        case "loadedSources":
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
    const a = message?.arguments ?? {};
    this.programPath = typeof a.program === "string" ? a.program : null;

    if (!this.programPath) {
      this.respond(message, false, undefined, "Missing 'program' in launch arguments");
      return;
    }

    this.cwd = typeof a.cwd === "string" ? a.cwd : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.runtime = typeof a.runtimeExecutable === "string" && a.runtimeExecutable.trim() ? a.runtimeExecutable : "vitl";
    const runtimeArgs = Array.isArray(a.runtimeArgs) ? a.runtimeArgs.filter((x: any) => typeof x === "string") : [];
    const progArgs = Array.isArray(a.args) ? a.args.filter((x: any) => typeof x === "string") : [];
    this.args = [...runtimeArgs, this.programPath, ...progArgs];
    this.stopOnEntry = !!a.stopOnEntry;

    if (this.cp) this.stop();

    this.terminated = false;
    this.cp = spawn(this.runtime, this.args, {
      cwd: this.cwd,
      shell: process.platform === "win32",
      env: process.env
    });

    this.event("process", {
      name: path.basename(this.runtime),
      systemProcessId: this.cp.pid,
      isLocalProcess: true,
      startMethod: "launch",
      pointerSize: 64
    });
    this.event("thread", { reason: "started", threadId: 1 });

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
    });

    if (this.stopOnEntry) {
      this.event("stopped", { reason: "entry", threadId: 1, allThreadsStopped: true });
    } else {
      this.event("continued", { threadId: 1, allThreadsContinued: true });
    }

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
    }
  }

  /* ---------------------------- HELPERS -------------------------------- */

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

  private output(text: string, category: "stdout" | "stderr" = "stdout") {
    this.event("output", { category, output: text });
  }

  private send(msg: any) {
    this._emitter.fire(msg as vscode.DebugProtocolMessage);
  }

  dispose() {
    this.stop();
    this._emitter.dispose();
  }
}
