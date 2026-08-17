# Obsidian-Harness für das Plugin

Bevor wir am Plugin arbeiten: Du kannst am UI nichts beurteilen, solange Du nichts sehen kannst. Wir brauchen also eine Anbindung, die Dir das Plugin in einem echten Obsidian zeigt — nicht in einer nachgebauten CodeMirror-Instanz. Die Bugs, die mich stören, sitzen genau dort, wo Obsidian mehr macht als CodeMirror.

Obsidian ist Electron und damit über den Remote-Debugging-Port ansprechbar. Puppeteer soll sich per CDP anhängen, statt einen eigenen Browser zu starten.

Dazu gehört:

- **Das Plugin bauen.** `npm run build` (rollup) erzeugt `main.js`. Der letzte Commit drüben heißt `Remove main.js`, das Artefakt ist also nicht eingecheckt und muss vor jedem Lauf entstehen.
- **Ein eigener Test-Vault** mit Dateien, die jeden Tag mindestens einmal enthalten: File-Level-Directive in Zeile 1, Block-Directive, Time-Windows in allen drei Formen, Pseudo-Rollen, `##fragment`, `##side-by-side-*` mit zwei und mit drei Spalten. Der Vault gehört ins Plugin-Repo, nicht in den echten `md/`-Korpus hier — der wird von `npm test` geprüft und hat seine eigenen Regeln.
- **Installation in den Vault**: Plugin nach `.obsidian/plugins/safelearn-formatter/` (Symlink oder Kopie) und dort aktivieren.
- **Obsidian starten und anhängen**, Screenshots ablegen, damit Du sie ansehen kannst.
- **Alle drei Zustände erreichbar machen.** Live Preview, Source Mode und Reading View sind drei verschiedene Dinge, und die Fehler sitzen in unterschiedlichen. Eine Harness, die nur einen davon erreicht, verdeckt die Hälfte.

Offen, das klären wir wenn wir dran sind: Ist Obsidian auf dieser Maschine installiert und wie (Paket, AppImage, Flatpak)? Davon hängt ab, wie der Debugging-Port gesetzt wird. Und: läuft das headless oder braucht es Xvfb?

Das ist ein `plugin-setup-`-Item — es muss stehen, bevor die anderen Plugin-Proposals sinnvoll bearbeitet werden können.
