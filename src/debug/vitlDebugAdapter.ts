import * as vscode from "vscode";

export function registerVitlDebugAdapter(context: vscode.ExtensionContext) {
  const factory = new VitlDebugAdapterFactory();
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory("vitl", factory),
    factory
  );
}

class VitlDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory, vscode.Disposable {
  createDebugAdapterDescriptor(_s: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const Inline: any = (vscode as any).DebugAdapterInlineImplementation;
    if (Inline) {
      return new Inline(new InlineAdapter()) as unknown as vscode.DebugAdapterDescriptor;
    }
    return undefined; // fallback: pas d'inline dispo → VS Code refusera la session
  }
  dispose() {}
}

class InlineAdapter implements vscode.DebugAdapter {
  private readonly emitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> = this.emitter.event;

  handleMessage(msg: any): void {
    const cmd = msg?.command as string | undefined;
    if (cmd === "initialize") {
      this.respond(msg, true, { supportsConfigurationDoneRequest: true });
      this.event("initialized");
      return;
    }
    if (cmd === "disconnect" || cmd === "terminate") {
      this.event("exited", { exitCode: 0 });
      this.event("terminated");
      this.respond(msg, true);
      return;
    }
    // stubs par défaut
    this.respond(msg, true);
  }

  dispose(): void { this.emitter.dispose(); }

  private send(m: vscode.DebugProtocolMessage) { this.emitter.fire(m); }
  private event(event: string, body?: any) { this.send({ seq: 0, type: "event", event, body } as any); }
  private respond(req: any, success: boolean, body?: any, message?: string) {
    this.send({ seq: 0, type: "response", request_seq: req?.seq ?? 0, success, command: req?.command ?? "", message, body } as any);
  }
}
