# VitteStudio

# Vitte Language Support (Vitte/Vitl) — VS Code

## 🛠️ Débogage

### 📦 Prérequis
- **VS Code ≥ 1.93**
- Toolchain installée et accessible :
  - `vitlc` (compilateur)
  - `vitlv` (VM / interpréteur)
- Variables d’environnement correctement configurées (`PATH` doit contenir les binaires)
- Projet contenant au moins un fichier `.vitte`, `.vit` ou `.vitl`

---

### 🚀 Démarrage rapide

1. Ouvrez un fichier source `.vitte`, `.vit` ou `.vitl` dans VS Code.
2. Placez un breakpoint (F9 ou clic dans la gouttière).
3. Appuyez sur **F5** pour exécuter la configuration par défaut *Vitl: Launch current file*.
4. Le débogueur démarre et vous accédez à :
   - Exécution pas à pas (Step In / Step Over / Step Out)
   - Variables locales et globales
   - Observateur (Watch expressions)
   - Pile d’appels (Call Stack)
   - Points d’arrêt conditionnels et logpoints

---

#### Configurations de lancement courantes

Créez ou ouvrez `.vscode/launch.json` (VS Code le propose à la première exécution) :

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "vitl",
      "request": "launch",
      "name": "Vitl: Launch current file",
      "program": "${file}",
      "cwd": "${workspaceFolder}",
      "stopOnEntry": true,
      "args": []
    },
    {
      "type": "vitl",
      "request": "launch",
      "name": "Vitl: Launch with args",
      "program": "${file}",
      "cwd": "${workspaceFolder}",
      "args": ["--flag", "value", "--verbose"],
      "stopOnEntry": false,
      "env": {
        "VITTE_LOG": "debug",
        "VITTE_FEATURES": "exp1,exp2"
      }
    },
    {
      "type": "vitl",
      "request": "attach",
      "name": "Vitl: Attach to running VM",
      "host": "127.0.0.1",
      "port": 6009,
      "timeout": 10000
    }
  ],
  "compounds": [
    {
      "name": "Run app + Attach tools",
      "configurations": ["Vitl: Launch current file", "Vitl: Attach to running VM"]
    }
  ]
}
```
---

### ⚙️ Commandes disponibles
- `vitte.debug.start` — démarre une session de débogage sur le fichier courant
- `vitte.debug.stop` — arrête la session active
- `vitte.debug.runFile` — exécute immédiatement le fichier ouvert sans configuration avancée
- `vitte.debug.attachServer` — se connecte à un processus Vitl/Vitte déjà en cours
- `vitte.debug.restart` — redémarre la session en cours

---

[![Marketplace](https://img.shields.io/badge/VS%20Code-%E2%86%92%20Marketplace-blue)](https://marketplace.visualstudio.com/manage)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![VS Code Engine](https://img.shields.io/badge/engine-%5E1.75.0-lightgrey)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Extension **Visual Studio Code** pour le langage **Vitte** et le dialecte **Vitl**.
Fonctionnalités incluses : coloration syntaxique, snippets, configuration de langage, **LSP** (auto-complétion, hover, navigation, symboles, diagnostics, semantic tokens) et **thème d’icônes**.

---

## Sommaire
- [VitteStudio](#vittestudio)
- [Vitte Language Support (Vitte/Vitl) — VS Code](#vitte-language-support-vittevitl--vs-code)
  - [🛠️ Débogage](#️-débogage)
    - [📦 Prérequis](#-prérequis)
    - [🚀 Démarrage rapide](#-démarrage-rapide)
      - [Configurations de lancement courantes](#configurations-de-lancement-courantes)
    - [⚙️ Commandes disponibles](#️-commandes-disponibles)
  - [Sommaire](#sommaire)
  - [Fonctionnalités](#fonctionnalités)
  - [Formats pris en charge](#formats-pris-en-charge)
  - [Installation rapide](#installation-rapide)
    - [Depuis un fichier `.vsix`](#depuis-un-fichier-vsix)
  - [Paramètres](#paramètres)
  - [Arborescence du projet](#arborescence-du-projet)
  - [Développement](#développement)
    - [Scripts utiles](#scripts-utiles)
  - [Build VSIX](#build-vsix)
    - [Unix](#unix)
    - [Windows (PowerShell)](#windows-powershell)
  - [Publication Marketplace](#publication-marketplace)
  - [Exemples](#exemples)
    - [`examples/hello.vitte`](#exampleshellovitte)
    - [`examples/hello.vitl`](#exampleshellovitl)
  - [Dépannage](#dépannage)
  - [Feuille de route](#feuille-de-route)
    - [🎯 Court terme (0.4.x → 0.5.x)](#-court-terme-04x--05x)
    - [🚀 Moyen terme (0.6.x → 0.7.x)](#-moyen-terme-06x--07x)
    - [Long terme (0.8.x → 1.0.0)](#long-terme-08x--100)
    - [💡 Idées futures](#-idées-futures)
  - [Contribuer](#contribuer)
  - [Licence](#licence)

---

## Fonctionnalités

- **Deux langages supportés** : `vitte` et `vitl`
- **Extensions reconnues** : `.vitte`, `.vit` et `.vitl`
- **Coloration syntaxique** via :
  - `syntaxes/vitte.tmLanguage.json`
  - `syntaxes/vitl.tmLanguage.json`
- **Snippets intégrés** :
  - `snippets/vitte.json`
  - `snippets/vitl.json`
- **Configuration de langage** :
  - `language-configuration.json` (Vitte)
  - `language-configuration-vitl.json` (Vitl)
- **LSP intégré (Node.js)** :
  - Auto-complétion, hover, go to definition, document symbols
  - **Semantic Tokens** : surlignage précis (keywords, fonctions, variables, constantes…)
  - **Diagnostics** : `TODO` / `FIXME`, séquence `???`, espaces en fin de ligne, lignes trop longues
  - Surveillance de fichiers de configuration :
    `**/.vitteconfig`, `**/vitte.toml`, `**/.vitlconfig`, `**/vitl.toml`
  - Sélecteurs de documents : `vitte`, `vitl`, fichiers et buffers non sauvegardés
  - **Options d’exécution** :
    - `VITTE_LSP_PATH` : pointer vers un serveur LSP externe
    - `VITTE_LSP_INSPECT` : activer le mode debug Node (ex. `6009`)
- **Thème d’icônes personnalisé**
- **Compatibilité** :
  - Visual Studio Code `^1.75.0`
  - Node.js `>=18` recommandé
- **Build & packaging** :
  - Scripts `npm run build`, `watch`, `clean`
  - Génération VSIX avec `npx vsce package`
  - Installation locale : `code --install-extension vitte-lang-*.vsix`

---

## Formats pris en charge

| Langage | Extensions | Scope TextMate | Snippets |
|---------|------------|----------------|----------|
| Vitte   | `.vitte`, `.vit` | `source.vitte` | `snippets/vitte.json` |
| Vitl    | `.vitl`          | `source.vitl`  | `snippets/vitl.json` |

---

## Installation rapide

### Depuis un fichier `.vsix`
```bash
npm ci
npx tsc -p ./client && npx tsc -p ./server
mkdir -p dist
npx @vscode/vsce package -o dist/vitte-lang-$(jq -r .version package.json).vsix

# installation locale
code --install-extension dist/*.vsix

### Depuis le Marketplace
1) Créer un **Personal Access Token** (Azure DevOps → User settings → *Personal access tokens* → scope `Marketplace > Manage`).
2) Se connecter : `npx vsce login VitteStudio` (coller le PAT).
3) Publier : `npx vsce publish` ou `npx vsce publish 0.3.0`.

---

## Utilisation

- Ouvrir un fichier `*.vitte`, `*.vit` ou `*.vitl`.
- Activer le LSP si désactivé par défaut : `F1 → Preferences: Open Settings (JSON)` puis :

```json
{
  "vitte.enableLSP": true,
  "vitte.trace.server": "off"
}
```

> Le serveur propage aussi une section `vitl` si vous l’ajoutez dans vos settings, ex.:
```json
{ "vitl": { "enableSemanticTokens": true } }
```
-	L’option "vitte.trace.server" peut être définie sur "off", "messages" ou "verbose" afin d’ajuster la quantité de journaux échangés entre le client VS Code et le serveur de langage. "messages" est utile pour observer les requêtes LSP entrantes/sortantes, tandis que "verbose" fournit un traçage complet incluant le contenu.

---

## Paramètres

Paramètres déclarés dans `package.json` (section `contributes.configuration`):

- `vitte.enableLSP` (`boolean`, défaut `false`) : active le serveur de langage.
- `vitte.trace.server` (`"off" | "messages" | "verbose"`, défaut `off`) : niveau de trace LSP.

Paramètres dynamiques vus côté serveur (non déclarés dans `contributes`) :
- `vitl.enableSemanticTokens` (`boolean`, défaut `true` si non défini).

Variables d’environnement utiles :
- `VITTE_LSP_PATH` : chemin d’un serveur LSP externe (binaire).
- `VITTE_LSP_INSPECT` : port d’inspection Node pour le LSP, ex. `6009`.

---

## Arborescence du projet

```
VitteLangVsCode/
├── .vscode/
│   ├── launch.json
│   ├── tasks.json
│   └── extensions.json
├── package.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── icon.png
│
├── client/
│   ├── src/extension.ts     # Client LSP (vitte + vitl)
│   └── out/
│
├── server/
│   ├── src/server.ts        # Serveur LSP (vitte + vitl)
│   └── out/
│
├── syntaxes/
│   ├── vitte.tmLanguage.json
│   └── vitl.tmLanguage.json
│
├── snippets/
│   ├── vitte.json
│   └── vitl.json
│
├── icons/
│   └── vitte-icon-theme.json
│
├── language-configuration.json
├── language-configuration-vitl.json
│
└── scripts/
    ├── build.sh
    └── release.sh
```

---

## Développement

Prérequis : Node 18+, npm, VS Code ≥ 1.75.

```bash
# installer
npm ci

# builder (TS → JS)
npx tsc -p ./client && npx tsc -p ./server

# lancer en mode extension (F5) avec .vscode/launch.json
# option debug serveur
export VITTE_LSP_INSPECT=6009
```

### Scripts utiles
- `npm run compile` : compile `client` et `server` via `tsc`.
- `npm run watch` : compilation incrémentale en watch.
- `npm run build:vsix` : compile + check + package en `.vsix`.
- `npm run publish` : compile + publication Marketplace.

---

## Build VSIX

### Unix
```bash
npm ci
npx tsc -p ./client && npx tsc -p ./server
mkdir -p dist
VSIX="dist/vitte-lang-$(jq -r .version package.json).vsix"
npx @vscode/vsce package -o "$VSIX"
unzip -p "$VSIX" extension/package.json | jq -r '.name, .publisher, .version'
code --install-extension "$VSIX"
```

### Windows (PowerShell)
```powershell
npm ci
npx tsc -p ./client; npx tsc -p ./server
if (!(Test-Path dist)) { New-Item -ItemType Directory dist | Out-Null }
$ver = (Get-Content package.json | ConvertFrom-Json).version
$vsix = "dist/vitte-lang-$ver.vsix"
npx @vscode/vsce package -o $vsix
code --install-extension $vsix
```

---

## Publication Marketplace

```bash
# connexion (1ère fois)
npx vsce login VitteStudio

# publier version exacte
npx vsce publish 0.3.0

# ou bump auto
npx vsce publish patch     # ex. 0.3.1
npx vsce publish minor     # ex. 0.4.0
```

Erreurs fréquentes et correction :
- `The version 0.2.0 already exists and cannot be modified` → **incrémenter** la version (`npm version patch --no-git-tag-version`), re-packager, republier.
- `ENOENT .vsix` lors de l’installation → vérifier le **répertoire** d’exécution et l’option `-o` de `vsce package`.
- `tsc not found` → `npm i -D typescript` et utiliser `npx tsc` (éviter le paquet `tsc` qui n’est pas TypeScript).

---

## Exemples

### `examples/hello.vitte`
```vitte
module demo

pub fn main() {
  let msg: string = "Hello Vitte"
  print(msg)
}
```

### `examples/hello.vitl`
```vitl
module demo

fn main(): void {
  let msg: string = "Hello Vitl"
  println(msg)
}
```

---

## Dépannage

- **LSP ne démarre pas**
  - Vérifiez la console des extensions (`Ctrl+Shift+U`) et le canal **Vitte/Vitl LSP**.
  - Assurez la présence du fichier `server/out/server.js` (recompiler avec `npm run compile`).
  - Si vous utilisez un serveur externe, définissez la variable d’environnement `VITTE_LSP_PATH` vers le binaire compilé.
  - Si vous avez activé le mode inspection (`VITTE_LSP_INSPECT`), vérifiez que le port choisi (ex. `6009`) est libre et non bloqué par un pare-feu.

- **Coloration syntaxique manquante**
  - Contrôlez que les fichiers `syntaxes/vitte.tmLanguage.json` et `syntaxes/vitl.tmLanguage.json` existent et soient valides.
  - Vérifiez l’association des extensions (`.vitte`, `.vit`, `.vitl`) dans `package.json` → `contributes.languages`.
  - Rechargez la fenêtre VS Code (`F1 → Reload Window`) pour forcer la relecture des fichiers de grammaire.

- **Snippets absents**
  - Confirmez que les fichiers `snippets/vitte.json` et `snippets/vitl.json` sont bien référencés dans `package.json` → `contributes.snippets`.
  - Assurez-vous que la structure interne du JSON respecte le format attendu (`prefix`, `body`, `description`).
  - Si un snippet ne s’affiche pas, testez avec `F1 → Insert Snippet` et vérifiez qu’il est bien listé.

- **Publisher invalide**
  - Le champ `publisher` de `package.json` doit correspondre exactement au **publisher Marketplace** (`VitteStudio`).
  - En cas de mismatch, mettez à jour `package.json` puis regénérez le `.vsix`.
  - Vérifiez avec `npx vsce ls-publishers` pour lister vos publishers enregistrés.

- **Erreur `The version X already exists and cannot be modified`**
  - Il faut incrémenter la version dans `package.json` (`npm version patch --no-git-tag-version`) puis relancer `npx vsce package` et `npx vsce publish`.
  - Exemple : `0.3.0` déjà publiée → passez en `0.3.1`.

- **Erreur `ENOENT .vsix` lors de l’installation locale**
  - Vérifiez que le fichier `.vsix` a bien été généré dans `dist/`.
  - Commande correcte : `code --install-extension dist/vitte-lang-x.y.z.vsix`.
  - Attention : le `-o` de `vsce package` doit pointer vers un dossier existant.

- **Erreur `tsc not found` ou compilation impossible**
  - Installez TypeScript en local :
    ```bash
    npm i -D typescript
    ```
  - Compilez avec `npx tsc -p ./client && npx tsc -p ./server`.
  - Évitez d’utiliser le paquet `tsc` global qui n’est pas le compilateur officiel.

- **Debug adapter non reconnu**
  - Vérifiez que `client/src/extension.ts` importe et enregistre correctement `VitlDebugAdapterFactory`.
  - Assurez-vous que la section `contributes.debuggers` est bien définie dans `package.json`.
  - Testez la configuration par défaut dans `.vscode/launch.json` (`type: "vitl"`).

- **Icônes non appliquées**
  - Vérifiez que `icons/vitte-icon-theme.json` est bien référencé dans `package.json` → `contributes.iconThemes`.
  - Rechargez VS Code et activez le thème d’icônes via `F1 → File Icon Theme → Vitte`.

- **Performances dégradées**
  - Si le LSP consomme trop de ressources, réduisez la verbosité du trace :
    ```json
    { "vitte.trace.server": "off" }
    ```
  - Désactivez temporairement les `semanticTokens` si vous avez un projet massif :
    ```json
    { "vitl": { "enableSemanticTokens": false } }
    ```

- **Tests ou compilation VSIX échouent sur CI/CD**
  - Assurez-vous que la CI installe Node.js ≥ 18 et `vsce`.
  - Ajoutez un cache npm (`npm ci` plutôt que `npm install`).
  - Vérifiez que `scripts/build.sh` ou `release.sh` ont les droits d’exécution (`chmod +x`).

---
---

## Feuille de route

La feuille de route suivante décrit les fonctionnalités planifiées et les améliorations envisagées pour les prochaines versions de l’extension **VitteStudio** (support Vitte/Vitl dans VS Code).
Les jalons sont indicatifs et sujets à ajustements selon les retours utilisateurs et la progression du langage.

---

### 🎯 Court terme (0.4.x → 0.5.x)
- **Formateur intégré** (`DocumentRangeFormatting` et `OnTypeFormatting`)
  - Normalisation indentation (espaces vs tabulations)
  - Gestion automatique des espaces autour des opérateurs, virgules et `:`
  - Trim des espaces en fin de ligne et insertion newline final
  - Options configurables via `settings.json`

- **Renommage de symboles** (`RenameProvider`)
  - Renommage cohérent dans tout le document et projet
  - Support des variables locales, globales et fonctions

- **Diagnostics enrichis**
  - Détection des variables inutilisées
  - Avertissement sur les imports non utilisés
  - Détection des blocs vides

---

### 🚀 Moyen terme (0.6.x → 0.7.x)
- **Inlay hints**
  - Affichage des types implicites (ex: paramètres, retours de fonction)
  - Indices pour les valeurs par défaut des arguments

- **Code lenses**
  - Actions rapides au-dessus des fonctions (`Run`, `Debug`, `Test`)
  - Informations de référence : nombre d’appels à une fonction

- **Amélioration du debug**
  - Watch expressions évoluées
  - Support des breakpoints conditionnels
  - Console interactive (REPL connecté au runtime Vitl/Vitte)

- **Indexation avancée**
  - Recherche de symboles multi-fichiers plus rapide
  - Navigation croisée : *Go to Implementation* et *Find References*

---

###  Long terme (0.8.x → 1.0.0)
- **Tests end-to-end** via `@vscode/test-electron`
  - Jeux de tests complets pour valider LSP, snippets, debug, formatteur
  - CI automatisée sur Linux, macOS et Windows

- **Refactorings avancés**
  - Extraction de fonction/méthode
  - Organisation automatique des imports
  - Conversion automatique `let ↔ const` selon usage

- **Télémétrie opt-in**
  - Statistiques anonymes (activation manuelle par l’utilisateur)
  - Aide à prioriser les fonctionnalités les plus utilisées

- **Écosystème & packaging**
  - Intégration avec GitHub Codespaces / VS Code Web
  - Publication automatisée sur Marketplace + GitHub Releases
  - Documentation intégrée interactive (tutoriels dans VS Code)

---

### 💡 Idées futures
- Support partiel de **Vitl FFI** (interop avec C/Rust directement dans VS Code).
- Mode **Playground** pour exécuter des snippets `.vitl` sans projet.
- **Visualisation graphique** (ex. graphe d’appel, diagrammes d’imports).
- Support d’autres éditeurs via LSP (Neovim, JetBrains, etc.).
- Intégration avec des outils d’analyse statique tiers (Clippy-like).

---

---

## Contribuer

Issues et PRs bienvenues : <https://github.com/vitte-lang/vscode-vitte>.
Style : TypeScript strict, commits clairs, CI verte.

---

## Licence

MIT. Voir `LICENSE`.
