# Memory Index — safeLearn

Ein File = ein Fakt. Diese Datei enthält nur Zeiger, niemals Inhalte.
Echter Ablageort: `/mnt/data/source/HTL/safeLearn/AI/memory/`

- [Trigger-Phrasen für Memory](memory-trigger-phrases.md) — "merke Dir das bitte" / "commit to memory" → neues md-File anlegen und hier verlinken
- [Sprache: Deutsch](language-german.md) — Gerald schreibt auf Deutsch, Antworten ebenfalls auf Deutsch
- [AI-Ordner-Layout](ai-folder-layout.md) — alles AI-Bezogene liegt unter `AI/`; `.claude`, `openspec` und der Memory-Pfad sind Symlinks dorthin
- [OpenSpec-Setup](openspec-setup.md) — via Volta installiert, CLI heißt `openspec`, Slash-Commands `/opsx:*`
- [Archivieren aus AI/ heraus](openspec-archive-from-ai-dir.md) — `openspec archive` bricht vom Repo-Root am Symlink ab; aus `AI/` läuft es durch
- [Code-Sprache: Englisch](code-language-english.md) — Code, Bezeichner, Kommentare und Docs immer Englisch; Konversation bleibt Deutsch
- [Architektur-Referenz](architecture-doc.md) — `AI/architecture.md` hält Tech-Stack, Features, Component-Map, Pipeline, Permissions und Observations
- [Proposals-Intake](proposals-autostart.md) — `AI/proposals/` wird beim Session-Start gelistet, Change heißt wie das File, beim Archivieren wandert es ins Change-Archiv
- [Browser-Verifikation](browser-verification.md) — `npm test` fährt eine Puppeteer-Harness, die sich live gegen die geteilten Demo-Accounts der Keycloak-Demo-Realm einloggt
- [Content-Verifikations-Suite](content-verification-suite.md) — `npm test` prüft den `md/`-Korpus selbst; nach Änderungen an Renderer, Permissions oder Korpus laufen lassen
- [Plugin-Repo-Link](plugin-repo-link.md) — das Obsidian-Plugin liegt in einem eigenen Repo, erreichbar über den gitignorierten Symlink `AI/plugin`
- [Plugin-Release-Prozedur](plugin-release-process.md) — "mach ein neues Release": Version an drei Stellen, Push, Tag, dann GitHub-Release mit `main.js`, `manifest.json`, `styles.css`
- [Tag eines Releases umhängen](github-release-tag-move.md) — Tag löschen setzt das GitHub-Release auf Draft; danach `gh release edit --draft=false --latest`
- [Zwei Update-Wege ins Obsidian](plugin-update-paths.md) — safeLearn-Vault sieht das Plugin sofort per Symlink, andere Vaults erst wenn Obsidians Index nachzieht (~1 Tag)
