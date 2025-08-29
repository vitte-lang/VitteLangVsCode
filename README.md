# Vitte Language Support

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/VitteStudio.vitte-lang?label=VS%20Code%20Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=VitteStudio.vitte-lang)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/VitteStudio.vitte-lang?label=Installs&color=brightgreen)](https://marketplace.visualstudio.com/items?itemName=VitteStudio.vitte-lang)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/VitteStudio.vitte-lang?label=Rating)](https://marketplace.visualstudio.com/items?itemName=VitteStudio.vitte-lang) 
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/vitte-lang/vscode-vitte/ci.yml?label=build&logo=github)](https://github.com/vitte-lang/vscode-vitte/actions)

Extension **Visual Studio Code** pour le langage **Vitte** :  
coloration syntaxique, snippets, Language Server Protocol (LSP), et icônes personnalisées pour vos fichiers `.vitte`.

---

##  Fonctionnalités

-  **Coloration syntaxique avancée** pour mots-clés, types, fonctions, opérateurs et macros  
-  **Snippets prêts à l’emploi** pour écrire du code plus vite  
-  **Diagnostics LSP** :  
  - Détection de `TODO`, `FIXME`, `???`  
  - Espaces superflus en fin de ligne  
  - Lignes trop longues  
-  **Complétion intelligente** : mots-clés + symboles définis dans le document  
-  **Hover tooltips** : affichage rapide de la documentation des mots-clés  
-  **Navigation** : définitions, symboles de document  
-  **Icône personnalisée** pour les fichiers `.vitte`  

---

##  Installation

### Depuis le Marketplace
1. Ouvrir **Visual Studio Code**  
2. Aller dans l’onglet **Extensions**  
3. Chercher : **Vitte Language Support**  
4. Cliquer sur **Installer**  

👉 Lien direct : [Vitte Language Support — Marketplace](https://marketplace.visualstudio.com/items?itemName=VitteStudio.vitte-lang)

### Depuis un `.vsix`
Si vous avez construit le package localement :  
```bash
code --install-extension vitte-lang-0.2.0.vsix

