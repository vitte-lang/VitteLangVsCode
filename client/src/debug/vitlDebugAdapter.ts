import * as vscode from "vscode";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";

/**
 * Debug Adapter inline pour Vitl.
 * Exécute la CLI "vitl" (ou runtimeExecutable fourni) et streame stdout/stderr.
 * Pas d'instrumentation VM : breakpoints/step sont no-op mais reconnus proprement.
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

  onDidSendMessage?: (m: any) => void;

  handleMessage(message: any): void {
    try {
      switch (message.command) {
        case "initialize":
          this.send({
            type: "response",
            request_seq: message.seq ?? 0,
            success: true,
            command: "initialize",
            body: {
              supportsConfigurationDoneRequest: true,
              supportsTerminateRequest: true,
              supportsCompletionsRequest: false
            }
          });
          this.event("initialized");
          break;

        case "configurationDone":
          this.ok(message);
          break;

        case "launch":
          this.handleLaunch(message);
          break;

        case "disconnect":
        case "terminate":
          this.stop();
          this.event("terminated");
          this.ok(message);
          break;

        case "threads":
          this.ok(message, { threads: [{ id: 1, name: "Vitl Main" }] });
          break;

        case "continue":
        case "next":
        case "stepIn":
        case "stepOut":
          this.event("continued", { threadId: 1, allThreadsContinued: true });
          this.ok(message, { allThreadsContinued: true });
          break;

        case "stackTrace":
          this.ok(message, {
            stackFrames: this.fakeStack(),
            totalFrames: 1
          });
          break;

        case "scopes":
          this.ok(message, {
            scopes: [{ name: "Locals", variablesReference: 1000, expensive: false }]
          });
          break;

        case "variables":
          this.ok(message, { variables: [] });
          break;

        case "setBreakpoints": {
          const sourcePath = message.arguments?.source?.path as string | undefined;
          const reqBps: Array<{ line: number }> = Array.isArray(message.arguments?.breakpoints)
            ? message.arguments.breakpoints
            : [];
          const verified = reqBps.map((b) => ({
            verified: true,
            line: b.line,
            source: sourcePath ? { path: sourcePath } : undefined
          }));
          this.ok(message, { breakpoints: verified });
          break;
        }

        case "evaluate":
          this.ok(message, { result: "evaluate not supported (Vitl stub)", variablesReference: 0 });
          break;

        default:
          this.ok(message);
          break;
      }
    } catch (err: any) {
      this.err(message, String(err?.message ?? err));
    }
  }

  /* --------------------------- LIFECYCLE -------------------------------- */

  private handleLaunch(message: any) {
    const a = message.arguments ?? {};
    this.programPath = (a.program as string | undefined) ?? null;
    this.cwd = (a.cwd as string | undefined) || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.runtime = (a.runtimeExecutable as string | undefined) || "vitl";
    const runtimeArgs = Array.isArray(a.runtimeArgs) ? (a.runtimeArgs as string[]) : [];
    const progArgs = Array.isArray(a.args) ? (a.args as string[]) : [];
    this.args = [...runtimeArgs, ...(this.programPath ? [this.programPath] : []), ...progArgs];
    this.stopOnEntry = !!a.stopOnEntry;

    if (!this.programPath) {
      this.err(message, "Missing 'program' in launch arguments");
      return;
    }

    this.cp = spawn(this.runtime, this.args, {
      cwd: this.cwd,
      shell: process.platform === "win32",
      env: process.env
    });

    this.cp.stdout.on("data", (d) => this.output(d.toString(), "stdout"));
    this.cp.stderr.on("data", (d) => this.output(d.toString(), "stderr"));
    this.cp.on("error", (e) => this.output(`Process error: ${e.message}\n`, "stderr"));
    this.cp.on("exit", (code) => {
      this.event("exited", { exitCode: code ?? 0 });
      this.event("terminated");
    });

    if (this.stopOnEntry) {
      this.event("stopped", { reason: "entry", threadId: 1, allThreadsStopped: true });
    } else {
      this.event("continued", { threadId: 1, allThreadsContinued: true });
    }

    this.ok(message);
  }

  private stop() {
    if (!this.cp) return;
    try {
      if (process.platform === "win32") this.cp.kill();
      else {
        this.cp.kill("SIGTERM");
        setTimeout(() => this.cp && this.cp.kill("SIGKILL"), 1200);
      }
    } catch {}
    this.cp = null;
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

  private ok(req: any, body?: any) {
    this.send({
      seq: 0,
      type: "response",
      request_seq: req.seq ?? 0,
      success: true,
      command: req.command,
      body
    });
  }

  private err(req: any, message: string) {
    this.send({
      seq: 0,
      type: "response",
      request_seq: req.seq ?? 0,
      success: false,
      command: req.command,
      message
    });
  }

  private event(event: string, body?: any) {
    this.send({ type: "event", event, body });
  }

  private output(text: string, category: "stdout" | "stderr" = "stdout") {
    this.event("output", { category, output: text });
  }

  private send(msg: any) {
    this.onDidSendMessage?.(msg);
  }

  dispose() {
    this.stop();
  }
}
