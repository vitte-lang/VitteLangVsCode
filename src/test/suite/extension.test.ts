import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

const EXTENSION_ID = "VitteStudio.vitte-studio";

interface ExtensionTestApi {
  getStatusText(): string;
  getStatusTooltip(): string;
  getClientState(): unknown;
  runAction(action: string): Promise<void>;
  resolveServerModuleForTest(ctx: Pick<vscode.ExtensionContext, "asAbsolutePath">): string;
}

async function waitUntil(condition: () => boolean | Promise<boolean>, timeout = 5000, step = 50): Promise<void> {
  const start = Date.now();
  while (Date.now() - start <= timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, step));
  }
  throw new Error("Timed out waiting for condition");
}

suite("Vitte extension", () => {
  let extension: vscode.Extension<unknown> | undefined;
  let api: ExtensionTestApi | undefined;

  suiteSetup(async () => {
    extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, "Extension introuvable dans le registre VS Code");
    await extension.activate();
    assert.ok(extension.isActive, "Extension non active après activation");
    api = extension.exports as ExtensionTestApi;
  });

  test("Extension s’active sans erreur", () => {
    assert.ok(extension, "Extension non initialisée");
    assert.ok(extension.isActive, "Extension non active après activation");
    assert.ok(api, "API de test non exposée par l’extension");
  });

  test("Les commandes principales sont déclarées", async () => {
    const commands = await vscode.commands.getCommands(true);
    const expected = [
      "vitte.showServerLog",
      "vitte.restartServer",
      "vitte.runAction",
      "vitte.diagnostics.refresh",
    ];

    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `Commande ${cmd} non enregistrée`);
    }
  });

  test("La commande restart redémarre le client", async () => {
    const testApi = api;
    assert.ok(testApi, "API de test non disponible");
    await vscode.commands.executeCommand("vitte.restartServer");
    await waitUntil(() => testApi.getStatusText().startsWith("$(check)"), 8000);
    const tooltip = testApi.getStatusTooltip().toLowerCase();
    assert.ok(
      tooltip.includes("opérationnel") || tooltip.includes("running"),
      "Le statut du client n’indique pas qu’il est démarré"
    );
    assert.ok(
      tooltip.includes("diagnostics"),
      "Le statut ne mentionne pas la synthèse des diagnostics"
    );
  });

  test("La commande runAction déclenche l’action sélectionnée", async () => {
    const testApi = api;
    assert.ok(testApi, "API de test non disponible");

    const disposables: vscode.Disposable[] = [];
    let formatCalled = false;

    disposables.push(
      vscode.commands.registerCommand("editor.action.formatDocument", () => {
        formatCalled = true;
      })
    );

    const windowAny = vscode.window as unknown as { showQuickPick: (...args: unknown[]) => Thenable<unknown> };
    const originalQuickPick = windowAny.showQuickPick;
    windowAny.showQuickPick = () => Promise.resolve({
      label: "Format document",
      description: "editor.action.formatDocument",
      action: "format",
    });

    const document = await vscode.workspace.openTextDocument({ content: "test", language: "vitte" });
    await vscode.window.showTextDocument(document, { preview: false });

    try {
      await vscode.commands.executeCommand("vitte.runAction");
      await waitUntil(() => formatCalled, 1000, 20);
    } finally {
      windowAny.showQuickPick = originalQuickPick;
      for (const disposable of disposables) {
        disposable.dispose();
      }
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    }

    assert.ok(formatCalled, "La commande de formatage n’a pas été appelée");
  });

  test("Une résolution sans serveur signale une erreur explicite", () => {
    const ext = extension;
    assert.ok(ext, "Extension non initialisée");
    const testApi = api;
    assert.ok(testApi, "API de test non disponible");

    const fakeRoot = path.join(
      ext.extensionPath,
      ".test-missing-server",
      Date.now().toString(36)
    );
    assert.ok(!fs.existsSync(fakeRoot), "Le répertoire factice ne devrait pas exister");
    const fakeContext = {
      asAbsolutePath: (relPath: string) => path.join(fakeRoot, relPath),
    } as Pick<vscode.ExtensionContext, "asAbsolutePath">;

    assert.throws(
      () => testApi.resolveServerModuleForTest(fakeContext),
      /Module serveur Vitte introuvable/
    );
  });
});
