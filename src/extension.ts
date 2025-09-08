import * as vscode from "vscode";
import { registerVitlDebugAdapter } from "./debug/vitlDebugAdapter"; // ajustez le chemin si besoin
export function activate(ctx: vscode.ExtensionContext){ try{ registerVitlDebugAdapter?.(ctx); }catch{} }
export function deactivate(){}
