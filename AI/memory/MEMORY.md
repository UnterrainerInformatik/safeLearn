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
- [Proposals-Intake](proposals-autostart.md) — `AI/open-proposals.md` (eine Datei, Backlog) wird beim Session-Start **und bei jeder Frage nach neuer Arbeit** gelistet; Change verlinkt per `Source:`-Zeile, Eintrag wird beim Archivieren gelöscht
- [Browser-Verifikation](browser-verification.md) — `npm test` fährt eine Puppeteer-Harness, die sich live gegen die geteilten Demo-Accounts der Keycloak-Demo-Realm einloggt
- [Content-Verifikations-Suite](content-verification-suite.md) — `npm test` prüft den `md/`-Korpus selbst; nach Änderungen an Renderer, Permissions oder Korpus laufen lassen
- [Plugin-Repo-Link](plugin-repo-link.md) — das Obsidian-Plugin liegt in einem eigenen Repo, erreichbar über den gitignorierten Symlink `AI/plugin`
- [Plugin-Release-Prozedur](plugin-release-process.md) — "mach ein neues Release": Version an drei Stellen, Push, Tag, dann GitHub-Release mit `main.js`, `manifest.json`, `styles.css`
- [Tag eines Releases umhängen](github-release-tag-move.md) — Tag löschen setzt das GitHub-Release auf Draft; danach `gh release edit --draft=false --latest`
- [Zwei Update-Wege ins Obsidian](plugin-update-paths.md) — safeLearn-Vault sieht das Plugin sofort per Symlink, andere Vaults erst wenn Obsidians Index nachzieht (~1 Tag)
- [Vault-Link unter Windows](plugin-vault-link-windows.md) — der Link auf das Plugin darf nicht eingecheckt werden; auf Windows wird er zur 53-Byte-Datei und jede Store-Installation hängt ewig
- [secureLectures ist Downstream](securelectures-downstream-role.md) — dort nur Tests entfernen, `md/`-Inhalt und deployment-Config; jede App-Entscheidung (Code!) gehört upstream nach safeLearn
- [Sync-Reihenfolge safeLearn → secureLectures](securelectures-sync-order.md) — erst safeLearn pushen, dann public/master in secureLectures mergen+pushen; nicht auf den Build warten
- [Kontext vor Entscheidungsfragen](decision-questions-need-context.md) — erst den Mechanismus belegen, dann erst Optionen anbieten
- [Directory-Service-Credentials ungültig](directory-service-credentials-invalid.md) — lokales `.env` gibt `invalid_client` gegen die echte Keycloak-Realm; `/api/admin/directory/search` antwortet immer mit 502
- [git mv durch den openspec-Symlink](git-mv-through-openspec-symlink.md) — Ziel muss `AI/openspec/...` heißen, nicht `openspec/...`, sonst korrumpiert `git mv` den Index
- [Realm-Cleanup-Investigation Stand](realm-directory-cleanup-investigation.md) — pausiert nach Section 1+2: keine Duplikate, Ursache ist fehlender periodischer LDAP-Sync (fullSyncPeriod=-1)
- [babylon5-Server](babylon5-server.md) — Geralds eigener Server für detached Langläufer, SSH-Alias `babylon5`
- [PII-Handling bei echten Realm-Daten](pii-handling-real-data.md) — nie Einzeldatensätze ausgeben, nur Aggregate; Classifier blockt sonst
- [docker logs puffert Zeilen ohne \n](docker-logs-newline-buffering.md) — Progress-Writes ohne `\n` bleiben unsichtbar, bis ein Newline kommt oder der Container stirbt; sah aus wie ein Hänger, war keiner (babylon5/secureLectures)
- [Realm-Update-Kadenz](directory-realm-update-cadence.md) — Directory-Daten ändern sich nur händisch durch Gerald, ~3-4x/Jahr; er könnte eine Cache-Invalidierung dabei vergessen
- [Admin Events aktiviert](directory-admin-events-enabled.md) — seit 2026-09-11 an der unterrainer-Realm an (30 Tage), directory-service-Client hat jetzt zusätzlich `view-events`
