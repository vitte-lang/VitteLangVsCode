/* -------------------------------------------------------------------------- */
/* commands.ts — gestion centralisée des commandes LSP                        */
/* Inspiré des extensions pro (C/C++, Rust-analyzer, TypeScript)              */
/* -------------------------------------------------------------------------- */

import {
  Connection,
  ExecuteCommandParams,
  WorkspaceEdit,
  TextEdit,
  Range,
  Position
} from "vscode-languageserver/node";

/* Liste officielle des commandes */
export const VITTE_COMMANDS = {
  SHOW_SERVER_LOG: "vitte.showServerLog",
  RESTART_SERVER: "vitte.restartServer",
  RUN_ACTION: "vitte.runAction",
  RUN_ACTION_ARGS: "vitte.runActionWithArgs",
  DEBUG_RUN_FILE: "vitte.debug.runFile",
  DEBUG_ATTACH: "vitte.debug.attachServer",
  FORMAT_DOC: "vitte.formatDocument",
  ORGANIZE_IMPORTS: "vitte.organizeImports",
  FIX_ALL: "vitte.fixAll",
  RENAME_SYMBOL: "vitte.renameSymbol"
} as const;

type CommandId = typeof VITTE_COMMANDS[keyof typeof VITTE_COMMANDS];

/* -------------------------------------------------------------------------- */
/* Enregistrement                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Enregistre toutes les commandes côté serveur.
 * Retourne la liste des ID à déclarer dans `package.json`.
 */
export function registerCommands(connection: Connection): CommandId[] {
  connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
    try {
      await handleCommand(connection, params);
    } catch (err: any) {
      connection.console.error(`Erreur commande ${params.command}: ${err?.message ?? err}`);
    }
  });

  return Object.values(VITTE_COMMANDS);
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

async function handleCommand(connection: Connection, params: ExecuteCommandParams): Promise<void> {
  const { command, arguments: args } = params;

  switch (command) {
    case VITTE_COMMANDS.SHOW_SERVER_LOG:
      connection.console.info("📜 Vitte: ouverture du journal LSP (stub).");
      break;

    case VITTE_COMMANDS.RESTART_SERVER:
      connection.console.warn("🔄 Vitte: demande de redémarrage du serveur (stub).");
      // Ici: éventuellement notifier le client pour redémarrer
      break;

    case VITTE_COMMANDS.RUN_ACTION:
      connection.console.log("⚡ Vitte: exécution d’une action rapide générique.");
      break;

    case VITTE_COMMANDS.RUN_ACTION_ARGS:
      connection.console.log(`⚡ Vitte: exécution d’une action avec args: ${JSON.stringify(args)}`);
      break;

    case VITTE_COMMANDS.DEBUG_RUN_FILE:
      debugRunFile(connection, args?.[0]);
      break;

    case VITTE_COMMANDS.DEBUG_ATTACH:
      connection.console.log("🐞 Vitte: attach au serveur debug sur port 6009.");
      break;

    case VITTE_COMMANDS.FORMAT_DOC:
      await formatDocument(connection, args?.[0]);
      break;

    case VITTE_COMMANDS.ORGANIZE_IMPORTS:
      await organizeImports(connection, args?.[0]);
      break;

    case VITTE_COMMANDS.FIX_ALL:
      await fixAllProblems(connection, args?.[0]);
      break;

    case VITTE_COMMANDS.RENAME_SYMBOL:
      await renameSymbol(connection, args?.[0], args?.[1]);
      break;

    default:
      connection.console.warn(`Commande non reconnue: ${command}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Implémentations concrètes (stubs / exemples)                               */
/* -------------------------------------------------------------------------- */

function debugRunFile(connection: Connection, uri?: string) {
  if (!uri) {
    connection.console.error("Debug run file: aucun fichier fourni.");
    return;
  }
  connection.console.log(`🐞 Lancement debug sur fichier: ${uri}`);
  // TODO: connecter avec un vrai runtime Vitte/Vitl
}

async function formatDocument(connection: Connection, uri?: string) {
  if (!uri) return;
  connection.console.log(`✨ Formatage demandé sur ${uri}`);

  // Exemple: renvoyer un WorkspaceEdit (ici, pas d’implémentation réelle)
  const edit: WorkspaceEdit = {
    changes: {
      [uri]: [TextEdit.replace(Range.create(Position.create(0, 0), Position.create(0, 0)), "// formatted\n")]
    }
  };

  connection.workspace.applyEdit(edit);
}

async function organizeImports(connection: Connection, uri?: string) {
  if (!uri) return;
  connection.console.log(`📦 Organisation des imports sur ${uri}`);
  // TODO: parser + regrouper + trier imports
}

async function fixAllProblems(connection: Connection, uri?: string) {
  if (!uri) return;
  connection.console.log(`🛠 Correction automatique (fixAll) sur ${uri}`);
  // TODO: récupérer diagnostics → proposer corrections
}

async function renameSymbol(connection: Connection, uri?: string, newName?: string) {
  if (!uri || !newName) return;
  connection.console.log(`✏️ Renommage de symbole dans ${uri} → ${newName}`);
  // TODO: indexer et renommer occurrences
}
