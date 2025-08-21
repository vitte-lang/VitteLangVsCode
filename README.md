# Vitte Language Support — VS Code Extension

> Coloration syntaxique, snippets, configuration de langage et (optionnel) Language Server pour le langage **Vitte**.  
> Objectif : une DX propre, rapide, et digne d’un vrai écosystème moderne.

---

## 📦 À propos

**Vitte Language Support** fournit :

- 🎨 **Coloration syntaxique** (TextMate) pour `*.vitte`
- 🧩 **Snippets** pratiques (fonctions, modules, tests, FFI, structures de données)
- ✂️ **Configuration d’édition** (commentaires, brackets, auto-close)
- 🧠 **(Optionnel)** : hooks prêts pour brancher un **Language Server (LSP)** (autocomplétion, diagnostics, hover)
- 🧪 **Tests de grammaire** (fixtures) pour éviter les régressions
- 🔧 **Script de build** et instructions de **publication Marketplace**

> Le dépôt du langage Vitte : *(remplir le lien quand public)*

---

## 🗂️ Arborescence recommandée

```
vscode-vitte/
├─ package.json
├─ README.md
├─ CHANGELOG.md
├─ LICENSE
├─ icon.png
├─ language-configuration.json
├─ syntaxes/
│  └─ vitte.tmLanguage.json
├─ snippets/
│  └─ vitte.json
├─ test/
│  ├─ colorize-fixtures/
│  │  ├─ basic.vitte
│  │  └─ advanced.vitte
│  └─ colorize.test.js
└─ scripts/
   └─ build.mjs
```

---

## 🚀 Installation

### A. Depuis le Marketplace (recommandé)
> *À faire une fois publié.* Rechercher **“Vitte Language Support”** dans VS Code.

### B. Depuis un fichier `.vsix`
1. Construire le paquet :
   ```bash
   npm i -g vsce
   vsce package
   ```
   Cela génère `vitte-lang-<version>.vsix`.
2. Installer :
   - Via UI : `Extensions` → menu `…` → **Install from VSIX…**
   - Via CLI :
     ```bash
     code --install-extension vitte-lang-0.1.0.vsix
     ```

### C. En mode dev (dossier)
1. Ouvrir ce dossier dans VS Code
2. `F5` → **Run Extension** (nouvelle fenêtre “Extension Development Host”)

---

## 🧰 Utilisation

- Ouvrez des fichiers avec l’extension **`.vitte`**
- Coloration et snippets s’activent automatiquement
- Pour les **snippets**, tapez un préfixe (ex: `fn`, `module`, `test`) puis `Tab`

---

## ✨ Fonctionnalités

- **Grammaire TextMate** : mots-clés (`fn`, `let`, `const`, `mut`, `struct`, `enum`, `trait`, `impl`, `module`, `use`, `match`, `return`, `break`, `continue`), chaînes, commentaires, identifiants de fonctions
- **Snippets** : fonctions publiques/privées, modules, tests, imports, FFI C/C++, structures de données (vec, map, set), patterns de boucles et `match`
- **Language Configuration** : commentaires `//` et `/* … */`, paires de brackets `() [] {}`, auto-closing quotes
- **Tests colorisation** : fixtures basiques et avancées pour stabiliser la grammaire

---

## 📑 Exemple de `package.json` minimal

```jsonc
{
  "name": "vitte-lang",
  "displayName": "Vitte Language Support",
  "description": "Extension VS Code pour le langage Vitte : coloration, snippets, grammaire.",
  "version": "0.1.0",
  "publisher": "vitte-lang",
  "engines": { "vscode": "^1.70.0" },
  "categories": ["Programming Languages"],
  "icon": "icon.png",
  "contributes": {
    "languages": [
      {
        "id": "vitte",
        "aliases": ["Vitte", "vitte"],
        "extensions": [".vitte"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "vitte",
        "scopeName": "source.vitte",
        "path": "./syntaxes/vitte.tmLanguage.json"
      }
    ],
    "snippets": [
      { "language": "vitte", "path": "./snippets/vitte.json" }
    ]
  }
}
```

---

## 🎨 Grammaire TextMate (extrait)

```jsonc
{
  "scopeName": "source.vitte",
  "patterns": [
    { "name": "comment.line.double-slash.vitte", "match": "//.*$" },
    { "name": "comment.block.vitte", "begin": "/\\*", "end": "\\*/" },
    {
      "name": "keyword.control.vitte",
      "match": "\\b(if|else|while|for|match|return|break|continue)\\b"
    },
    {
      "name": "storage.type.vitte",
      "match": "\\b(fn|let|const|mut|struct|enum|trait|impl|module|use)\\b"
    },
    { "name": "constant.language.vitte", "match": "\\b(true|false|null)\\b" },
    {
      "name": "string.quoted.double.vitte",
      "begin": "\"", "end": "\"",
      "patterns": [{ "name": "constant.character.escape.vitte", "match": "\\\\." }]
    },
    {
      "name": "entity.name.function.vitte",
      "match": "\\b([A-Za-z_][A-Za-z0-9_]*)\\s*(?=\\()"
    }
  ],
  "fileTypes": ["vitte"],
  "name": "Vitte"
}
```

---

## ✂️ `language-configuration.json` (extrait)

```jsonc
{
  "comments": { "lineComment": "//", "blockComment": ["/*", "*/"] },
  "brackets": [["{", "}"], ["[", "]"], ["(", ")"]],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "\"", "close": "\"" },
    { "open": "'", "close": "'" }
  ]
}
```

---

## 🧩 Snippets (extraits)

```jsonc
{
  "Function": {
    "prefix": "fn",
    "body": [
      "pub fn ${1:name}(${2:params}) -> ${3:Type} {",
      "    $0",
      "}"
    ],
    "description": "Définir une fonction publique"
  },
  "Module": {
    "prefix": "module",
    "body": ["module ${1:name}", "use ${2:dep} as ${3:alias}"],
    "description": "Déclarer un module et un import"
  },
  "Test": {
    "prefix": "test",
    "body": [
      "@test",
      "fn ${1:it_should_do_x}() {",
      "    // Arrange",
      "    // Act",
      "    // Assert",
      "}"
    ],
    "description": "Gabarit de test"
  }
}
```

---

## 🧪 Tests de colorisation

- Placez des fichiers de test dans `test/colorize-fixtures/*.vitte`
- Utilisez un runner de colorisation (ex: `vscode-tmgrammar-test` ou script maison)  
- Exemple **`test/colorize.test.js`** (pseudo) :
```js
import { colorize } from "./util-colorize.js";

test("keywords highlighted", async () => {
  const result = await colorize("colorize-fixtures/basic.vitte");
  expect(result.tokens.some(t => t.scopes.includes("keyword.control.vitte"))).toBe(true);
});
```

---

## 🧭 Roadmap (indicative)

- [ ] Support **LSP** (autocomplétion, diagnostics, rename, hover, go-to-def)
- [ ] **Folding** & **semantic tokens** (si LSP dispo)
- [ ] **Code Actions** (quick fixes courants)
- [ ] **Formatting** (via `vitte-fmt`)
- [ ] **Hover docs** + **links vers la doc Vitte**
- [ ] **IntelliSense FFI** (C/C++)

---

## 🛠️ Développement

1. Installer dépendances :
   ```bash
   npm install
   ```
2. Lancer en mode dev :
   ```bash
   # Dans VS Code: F5 (Run Extension)
   ```
3. Packaging :
   ```bash
   vsce package
   ```

> Conseil : épinglez une **fenêtre Extension Development Host** et une fenêtre “utilisateur” pour tester.

---

## 🌐 Language Server (optionnel)

Si vous ajoutez un **serveur LSP** :

- Créez un dossier `server/` (Node ou Rust)
- Côté `client` (extension), ajoutez un `activationEvent` du type :
  ```jsonc
  "activationEvents": ["onLanguage:vitte"]
  ```
- Déclarez le client LSP dans `extension.ts` (ex: `vscode-languageclient`)
- Exposez capacités : completion, hover, diagnostics, rename, go-to-definition, references, documentSymbols…

> Le LSP est **fortement recommandé** pour une expérience premium.

---

## 🧩 Publication sur le Marketplace

1. Créez un **publisher** :
   ```bash
   vsce create-publisher vitte-lang
   ```
2. Générez un **Personal Access Token** Azure DevOps et connectez `vsce login vitte-lang`
3. Publiez :
   ```bash
   vsce publish
   # ou vsce publish patch|minor|major
   ```

**Bonnes pratiques de listing :**
- Icône propre (`icon.png` 128×128)
- Screenshots GIF / PNG
- README concis + sections claires
- CHANGELOG propre
- Mots-clés pertinents

---

## 🐛 Dépannage

- **La coloration ne s’active pas** : vérifiez l’extension `.vitte` et l’ID de langage `vitte`
- **Aucun snippet** : tapez le préfixe, puis `Tab`; vérifiez `contributes.snippets`
- **Le `.vsix` ne s’installe pas** : version VS Code trop ancienne ? Vérifiez `engines.vscode`
- **Conflits de thèmes** : essayez un autre thème ou inspectez les scopes (Cmd/Ctrl+Shift+P → “Developer: Inspect Editor Tokens and Scopes”)
- **Couleurs manquantes** : le thème actif peut ne pas styler certains scopes; ouvrez une issue avec captures d’écran

---

## 🤝 Contribuer

1. **Fork** & branche nommée `feat/...` ou `fix/...`
2. **Tests** : ajoutez/maintiens des fixtures de colorisation
3. **Conventions de commits** (recommandé) :
   - `feat(grammar): add match keyword`
   - `fix(snippets): correct fn return snippet`
   - `docs(readme): clarify install`
4. **PR** avec description claire, screenshots si UI

> Code of Conduct : respect, bienveillance, rigueur.

---

## 📝 Versioning & CHANGELOG

- Versioning **SemVer** : `MAJOR.MINOR.PATCH`
- CHANGELOG tenu à jour (section par version, bullet points, liens PR/Issues)

Exemple :
```
## 0.1.0 — 2025-08-21
- Première release : grammaire, snippets, config langage, tests initiaux
```

---

## 🔐 Sécurité & Télémetrie

- Aucune télémétrie activée dans cette extension
- Pas d’exécution de code externe
- Rapporter une faille : ouvrir une issue avec le tag **security**

---

## 📸 Captures (placeholders)

| Aperçu | Description |
|-------:|:------------|
| ![Syntax Highlight](docs/screenshot-syntax.png) | Coloration des mots-clés, strings, commentaires |
| ![Snippets](docs/screenshot-snippets.gif) | Démo d’insertion de snippets |
| ![Fixtures](docs/screenshot-tests.png) | Tests de colorisation |

---

## 📚 FAQ

**Q. Le fichier `.vitte` n’est pas reconnu.**  
R. Vérifiez que l’extension “Vitte Language Support” est activée et que `*.vitte` est bien enregistré dans `package.json` → `contributes.languages[].extensions`.

**Q. Puis-je surcharger les couleurs ?**  
R. Oui via votre thème / `editor.tokenColorCustomizations`.

**Q. Support LSP ?**  
R. Hooks prêts, serveur en cours de conception (voir Roadmap).

---

## 🧾 Licence

Dual-licence possible, ex. **MIT OR Apache-2.0** (choisir selon votre politique).

---

## 🗣️ Contact

- Mainteneur : **Vitte Team**
- Issues : GitHub *(ajoutez l’URL quand prête)*

---

> “Un langage n’existe vraiment que quand on peut le **lire** et l’**écrire** sans friction.” — esprit Vitte
