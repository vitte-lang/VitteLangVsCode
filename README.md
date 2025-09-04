# Vitte Language Support (Vitte/Vitl) — VS Code Extension

[![Marketplace](https://img.shields.io/badge/VS%20Code-%E2%86%92%20Marketplace-blue)](https://marketplace.visualstudio.com/manage)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![VS Code Engine](https://img.shields.io/badge/engine-%5E1.75.0-lightgrey)
![Status](https://img.shields.io/badge/status-active-brightgreen)

Extension Visual Studio Code pour le langage **Vitte** et le dialecte **Vitl**. Coloration syntaxique, snippets, configuration de langage, **LSP** (auto-complétion, hover, go to definition, symboles, diagnostics, semantic tokens) et **thème d’icônes**.

---

## Sommaire
- [Fonctionnalités](#fonctionnalités)
- [Formats pris en charge](#formats-pris-en-charge)
- [Installation rapide](#installation-rapide)
- [Utilisation](#utilisation)
- [Paramètres](#paramètres)
- [Arborescence du projet](#arborescence-du-projet)
- [Développement](#développement)
- [Build VSIX](#build-vsix)
- [Publication Marketplace](#publication-marketplace)
- [Exemples](#exemples)
- [Dépannage](#dépannage)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## Fonctionnalités

- **Deux langages** : `vitte` et `vitl`.
- **Extensions de fichiers** : `.vitte`, `.vit` et `.vitl`.
- **Coloration** : `syntaxes/vitte.tmLanguage.json` et `syntaxes/vitl.tmLanguage.json`.
- **Snippets** : `snippets/vitte.json` et `snippets/vitl.json`.
- **Configuration de langage** : `language-configuration.json` et `language-configuration-vitl.json` (optionnel).
- **LSP intégré** (node):
  - Complétion, Hover, Go to Definition, Document Symbols
  - **Semantic Tokens**
  - Diagnostics : `TODO/FIXME`, `???`, espaces en fin de ligne, longueur de ligne
  - **Watchers**: `**/.vitteconfig`, `**/vitte.toml`, `**/.vitlconfig`, `**/vitl.toml`
  - **Sélecteurs** de documents : `vitte` et `vitl` (file + untitled)
  - **Options d’exécution** :
    - `VITTE_LSP_PATH` pour pointer vers un binaire serveur externe
    - `VITTE_LSP_INSPECT` pour activer l’inspection Node (ex. `6009`)
- **Thème d’icônes** : `icons/vitte-icon-theme.json`.
- **Compatibilité** : VS Code `^1.75.0`, Node 18+ recommandé.

---

## Formats pris en charge

| Langage | Extensions | Scope TextMate | Snippets |
|---|---|---|---|
| Vitte | `.vitte`, `.vit` | `source.vitte` | `snippets/vitte.json` |
| Vitl  | `.vitl`          | `source.vitl`  | `snippets/vitl.json` |

---

## Installation rapide

### Depuis un fichier `.vsix`
```bash
# racine du dépôt
npm ci
npx tsc -p ./client && npx tsc -p ./server
mkdir -p dist
npx @vscode/vsce package -o dist/vitte-lang-$(jq -r .version package.json).vsix

# installation locale
code --install-extension dist/*.vsix
```

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
│   ├── src/extension.ts     # LSP client (vitte + vitl)
│   └── out/
│
├── server/
│   ├── src/server.ts        # LSP server (vitte + vitl)
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

- **LSP ne démarre pas** : vérifier la console des extensions et le canal “Vitte/Vitl LSP”.  
  - Assurer la présence de `server/out/server.js` (`npm run compile`).  
  - Pour un serveur externe : définir `VITTE_LSP_PATH` vers le binaire.
- **Coloration manquante** : contrôler `syntaxes/*.tmLanguage.json` et l’association d’extensions dans `package.json`.
- **Snippets absents** : vérifier les fichiers `snippets/*.json` et les chemins `contributes.snippets`.
- **Publisher invalide** : `publisher` de `package.json` doit correspondre au **publisher Marketplace** (`VitteStudio`).

---

## Feuille de route

- Formatteur (`DocumentRangeFormatting`)
- Renommage symboles
- Inlay hints et code lenses
- Tests end-to-end via `@vscode/test-electron`
- Télémétrie opt-in

---

## Contribuer

Issues et PRs bienvenues : <https://github.com/vitte-lang/vscode-vitte>.  
Style : TypeScript strict, commits clairs, CI verte.

---

## Licence

MIT. Voir `LICENSE`.
