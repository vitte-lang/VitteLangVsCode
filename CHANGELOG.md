# Changelog
Toutes les modifications notables de l’extension **Vitte Language Support** seront documentées ici.
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et cette extension suit le versioning [SemVer](https://semver.org/lang/fr/).

---

## [1.7.0] — 2025-11-02
### Ajouté
- ⚙️ **Commandes LSP complètes** (`vitte.formatDocument`, `vitte.organizeImports`, `vitte.fixAll`) intégrées côté client et serveur, avec application automatique des `TextEdit`.
- 🧠 **Linter étendu** avec nouvelles règles (`mixedIndent`, `blankLines`, `nonAscii`, `finalNewline`) et génération automatique de *Quick Fixes* LSP.
- 🪶 **Formatteur amélioré** : support du formatage de plage (`rangeFormatting`), calcul d’*edits minimaux* et normalisation d’indentation avant exécution.
- 🔍 **Indexeur LSP** : reconnaissance des blocs `impl`, gestion robuste des commentaires et chaînes imbriquées, et ajout d’une API `reindexWorkspace()`.

### Modifié
- 🧰 `languageFacts.ts` refondu : classification complète des mots-clés, types, opérateurs et littéraux pour la complétion et les semantic tokens.
- 💡 `commands.ts` désormais branché directement au serveur via requêtes `vitte/*` (plus de stubs manuels).
- 🚀 Meilleure cohérence entre les diagnostics, la complétion et le formatteur (tous fondés sur le même ensemble de règles).

### Corrigé
- 🐞 Correction des erreurs TypeScript (`Thenable.catch`, `TextDocumentSyncKind` dupliqué, import manquant `languageService`).
- 🔧 Réécriture des handlers LSP (`onCodeAction`, `onDocumentFormatting`, `onDocumentRangeFormatting`) pour éviter les remplacements globaux inutiles et améliorer les performances.


---

## [1.6.0] — 2025-10-21
### Ajouté
- 🐞 Vue **Diagnostics Vitte** dédiée (à la Rust Analyzer) listant les erreurs/avertissements par fichier, avec navigation directe et commande *Vitte: Rafraîchir les diagnostics*.
- 🧭 Commandes utilitaires pour Ouvrir/rafraîchir les diagnostics et panneau latéral « Vitte » dans la barre d’activité.

### Modifié
- 🧰 Activation automatique de la vue diagnostics pour aider débutants/avancés à parcourir erreurs LSP, lint et debug.

---

## [1.5.0] — 2025-10-21
### Ajouté
- ✅ Prise en charge complète des mots-clés Vitte 1.5 (`async/await`, `switch/case/default`, `try/catch/finally/throw`, `defer`, `unsafe`, `with`, etc.) dans la grammaire, les semantic tokens, la complétion et le lint.
- ✍️ Nouvelles complétions/snippets (`async fn`, `switch`, `try/catch`, `defer`, `unsafe`, `with`) et reconnaissance des fonctions `pub async`, structs/enums publiques pour les suggestions et l’outline.
- 👀 Surveillance automatique des fichiers de configuration (`vitte.toml`, `.vitteconfig`, `vitl.toml`, `.vitlconfig`) en plus des sources.

### Modifié
- 🔄 Le client LSP couvre désormais les documents `untitled` et les cellules de notebooks, tout en réutilisant les watchers entre redémarrages.
- 🧠 Les indexeurs, la navigation (outline/go to symbol) et la complétion gèrent les modificateurs (`pub`, `async`, `unsafe`, `extern`) placés avant les déclarations.

---

## [0.1.0] — 2025-08-21
### Ajouté
- 🎨 Coloration syntaxique basique (TextMate) pour le langage **Vitte** :
  - mots-clés (`fn`, `let`, `const`, `mut`, `struct`, `enum`, `trait`, `impl`, `module`, `use`, `match`, `return`, `break`, `continue`)
  - chaînes de caractères, commentaires, identifiants de fonctions
- ✂️ Snippets :
  - fonctions publiques et privées
  - modules + imports
  - structures (`struct`), énumérations (`enum`), implémentations (`impl`), traits
  - boucles (`for`, `while`)
  - expression `match`
  - gabarits de tests
  - FFI (`C`, `Rust`)
  - structures de données (`Vec`, `Map`, `Option`, `Result`)
- ⚙️ Configuration langage :
  - auto-closing brackets `() [] {}`
  - auto-closing quotes `"" ''`
  - commentaires `//` et `/* */`
- 🖼️ Icône dédiée (`icon.png`) pour Marketplace
- 📦 Packaging et scripts `vsce` (build, publish)
- 📑 README.md initial ultra complet
- 🧩 Support de configuration utilisateur :
  - `vitte.enableLSP` (bool)
  - `vitte.trace.server` (logs LSP)

---

## [0.2.0] - 2025-08-29
### ✨ Added
- Icône `.vitte` intégrée via `vitte-icon-theme.json` (thème agnostique, logo unique).
- Support syntaxique enrichi :
  - Nouvelles règles TextMate pour attributs `#[...]`, macros `name!`, raw strings `r#"..."#`.
  - Nombres hex/bin/oct/float avec underscores.
  - Keywords élargis (mut, async/await, package, typedef, mov/jmp, etc.).
  - Reconnaissance d’opérateurs complexes (`::`, `->`, `=>`, `==`, `<=`, `&&`, `||`, `<<`, `>>`, etc.).
- LSP amélioré :
  - Diagnostics TODO/FIXME/??? et trailing spaces plus clairs.
  - Détection heuristique des types (PascalCase).
  - Hover docs étendues pour de nombreux mots-clés.
  - Semantic tokens enrichis (keywords, types, numbers, strings, comments).
- Snippets revus : `fn`, `struct`, `enum`, `trait`, `impl`, `match`, `for/while`, `main`.
- Expérience développeur VSCode améliorée :
  - Scripts `npm run compile`, `npm run watch`, `npm run build:vsix`.
  - Configuration debug (Run Extension + Attach LSP).
  - Publisher aligné : `VitteStudio`.

### 🔧 Changed
- Messages diagnostics plus explicites.
- Consolidation des chemins d’icônes et du `package.json`.

### 🚫 Breaking
- Pas de rupture majeure. Vérifier les thèmes de couleurs custom trop stricts (scopes plus précis).
