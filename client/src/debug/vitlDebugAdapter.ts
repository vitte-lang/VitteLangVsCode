import * as vscode from "vscode";

/**
 * Enregistre la fabrique pour le type de debug "vitl".
 * Appelle ceci depuis l'activation de l'extension.
 */
export function registerVitlDebugAdapter(context: vscode.ExtensionContext) {
  const factory = new VitlDebugAdapterFactory();
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("vitl", factory),
    factory
  );
}

/** Fabrique d’adaptateur inline, compatible anciens typings VS Code. */
export class VitlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory, vscode.Disposable {
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    _executable?: vscode.DebugAdapterExecutable
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    // Fallback typé pour anciens d.ts où InlineImplementation n’est pas dans l’union
    const InlineImpl = (vscode as any).DebugAdapterInlineImplementation;
    if (typeof InlineImpl === "function") {
      return new InlineImpl(new VitlInlineAdapter()) as unknown as vscode.DebugAdapterDescriptor;
    }
    vscode.window.showErrorMessage(
      "Cette version de VS Code ne supporte pas l'adaptateur inline. Mettez à jour VS Code et le package 'vscode'."
    );
    return undefined;
  }
  dispose() { /* no-op */ }
}

/** Adaptateur DAP ultra simple. Ne lance pas de process, renvoie des stubs. */
class VitlInlineAdapter implements vscode.DebugAdapter {
  private readonly _emitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  public readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> = this._emitter.event;

  handleMessage(msg: any): void {
    const cmd = msg?.command as string | undefined;

    switch (cmd) {
      case "initialize":
        this.respond(msg, true, {
          supportsConfigurationDoneRequest: true,
          supportsTerminateRequest: true,
          supportsRestartRequest: true
        });
        this.event("initialized");
        break;

      case "configurationDone":
        this.respond(msg, true);
        break;

      case "launch":
        // Stub: signale entrée puis continue
        this.event("thread", { reason: "started", threadId: 1 });
        this.event("stopped", { reason: "entry", threadId: 1, allThreadsStopped: true });
        this.respond(msg, true);
        break;

      case "continue":
      case "next":
      case "stepIn":
      case "stepOut":
      case "pause":
        this.event("continued", { threadId: 1, allThreadsContinued: true });
        this.respond(msg, true, { allThreadsContinued: true });
        break;

      case "threads":
        this.respond(msg, true, { threads: [{ id: 1, name: "Vitl Main" }] });
        break;

      case "stackTrace":
        this.respond(msg, true, {
          stackFrames: [{
            id: 1,
            name: "main",
            source: { name: "unknown.vitl" },
            line: 1,
            column: 1
          }],
          totalFrames: 1
        });
        break;

      case "setBreakpoints": {
        const req = Array.isArray(msg?.arguments?.breakpoints) ? msg.arguments.breakpoints : [];
        const breakpoints = req.map((b: any, i: number) => ({
          id: i + 1,
          verified: true,
          line: typeof b?.line === "number" ? b.line : 1
        }));
        this.respond(msg, true, { breakpoints });
        break;
      }

      case "disconnect":
      case "terminate":
        this.event("exited", { exitCode: 0 });
        this.event("terminated");
        this.respond(msg, true);
        break;

      default:
        this.respond(msg, true);
        break;
    }
  }

  dispose(): void {
    this._emitter.dispose();
  }

  /* -------------------- helpers -------------------- */

  private send(message: vscode.DebugProtocolMessage) {
    this._emitter.fire(message);
  }

  private respond(req: any, success: boolean, body?: any, message?: string) {
    this.send({
      seq: 0,
      type: "response",
      request_seq: req?.seq ?? 0,
      success,
      command: req?.command ?? "",
      message,
      body
    } as any);
  }

  private event(event: string, body?: any) {
    this.send({ seq: 0, type: "event", event, body } as any);
  }
}