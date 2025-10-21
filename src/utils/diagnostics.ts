import * as path from "node:path";
import * as vscode from "vscode";

export const VITTE_FILE_EXTS = new Set([".vitte", ".vit", ".vitl"]);

export interface DiagnosticsSummary {
  errors: number;
  warnings: number;
  info: number;
  hints: number;
}

export type DiagnosticsLevel = "clean" | "warning" | "error";

export function summarizeWorkspaceDiagnostics(): DiagnosticsSummary {
  return summarizeDiagnosticsInternal((uri) => isVitteFile(uri));
}

export function summarizeDiagnosticsForUris(uris: Iterable<string | vscode.Uri>): DiagnosticsSummary {
  const wanted = new Set<string>();
  for (const entry of uris) {
    if (!entry) continue;
    if (typeof entry === "string") {
      wanted.add(entry);
    } else {
      wanted.add(entry.toString());
    }
  }
  if (wanted.size === 0) {
    return summarizeDiagnosticsInternal(() => false);
  }
  return summarizeDiagnosticsInternal((uri) => wanted.has(uri.toString()));
}

export function diagnosticsLevel(summary: DiagnosticsSummary): DiagnosticsLevel {
  if (summary.errors > 0) return "error";
  if (summary.warnings > 0) return "warning";
  return "clean";
}

export function formatDiagnosticsSummary(summary: DiagnosticsSummary): string {
  const parts: string[] = [];
  if (summary.errors > 0) {
    parts.push(formatCount(summary.errors, "erreur"));
  }
  if (summary.warnings > 0) {
    parts.push(formatCount(summary.warnings, "avertissement"));
  }
  if (summary.info > 0) {
    parts.push(formatCount(summary.info, "info"));
  }
  if (summary.hints > 0) {
    parts.push(formatCount(summary.hints, "suggestion"));
  }
  if (parts.length === 0) {
    return "Diagnostics : aucun problème détecté";
  }
  return `Diagnostics : ${parts.join(", ")}`;
}

function summarizeDiagnosticsInternal(predicate: (uri: vscode.Uri) => boolean): DiagnosticsSummary {
  const summary: DiagnosticsSummary = { errors: 0, warnings: 0, info: 0, hints: 0 };
  for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
    if (!predicate(uri)) continue;
    for (const diagnostic of diagnostics) {
      switch (diagnostic.severity) {
        case vscode.DiagnosticSeverity.Error:
          summary.errors++;
          break;
        case vscode.DiagnosticSeverity.Warning:
          summary.warnings++;
          break;
        case vscode.DiagnosticSeverity.Information:
          summary.info++;
          break;
        case vscode.DiagnosticSeverity.Hint:
          summary.hints++;
          break;
        default:
          summary.info++;
      }
    }
  }
  return summary;
}

function isVitteFile(uri: vscode.Uri): boolean {
  if (uri.scheme !== "file") return false;
  const ext = path.extname(uri.fsPath).toLowerCase();
  return VITTE_FILE_EXTS.has(ext);
}

function formatCount(count: number, label: string): string {
  const plural = count > 1 ? "s" : "";
  return `${count} ${label}${plural}`;
}
