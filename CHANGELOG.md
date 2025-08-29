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

## [0.2.0] — En préparation