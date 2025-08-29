# Changelog
Toutes les modifications notables de l’extension **Vitte Language Support** seront documentées ici.  
Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),  
et cette extension suit le versioning [SemVer](https://semver.org/lang/fr/).

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
