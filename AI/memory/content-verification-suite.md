---
name: content-verification-suite
description: npm test asserts the md/ corpus itself — the checks that replace the manual pre-commit pass, and when they have to run
metadata:
  node_type: memory
  type: project
---

`npm test` prüft seit dem OpenSpec-Change `make-puppeteer-tests` (2026-08-16) nicht mehr nur den Login, sondern das, was SafeLearn rendert. Die Demonstrationsdateien unter `md/` sind die Spezifikation: `test/checks/permissions.js` (Block- und Datei-`@@@`-Direktiven in beide Richtungen, Navigationsbaum, Zeitfenster, Teacher→Student-Downgrade), `views.js` (`#exam`/`#practice`/`#answer` über `ve`/`va`), `rendering.js` (Callouts, Code, Fragmente, Side-by-Side, Bilder, PlantUML, Mermaid), `navigation.js` (Wiki-Links, Ordner-Edge-Cases, Inhaltsverzeichnis, Baum), `presentation.js` (Deck-Struktur, Referenzen, Dokumentansicht). Das sind Module, keine Testfiles — `test/content.test.js` importiert sie, damit der ganze Lauf in einem Prozess läuft und genau zweimal einloggt. Ein Lauf dauert rund 40 Sekunden plus Login.

**Why:** Vor jedem Commit wurde der Korpus per Hand Seite für Seite durchgelesen. Dieser Durchgang wurde unter Druck übersprungen, ließ sich auf einem Branch nicht nachvollziehen und hinterließ kein Protokoll. Die Checks ersetzen ihn und sind grün auf dem heutigen Stand — ein roter Lauf heißt also Regression und sonst nichts.

**How to apply:** Nach jeder Änderung an `obsidian.js`, `utils.js`, `app.js`, `obsidian-page.js`, den `css/`-Dateien oder am `md/`-Korpus laufen lassen — `test/coverage-map.json` sagt, welcher Check welche Datei bewacht, und ein `PostToolUse`-Hook nennt sie beim Editieren. Wer einen Check hinzufügt oder entfernt, pflegt die Map im selben Change; `test/coverage.test.js` erzwingt das. Neue Checks benutzen `sharedSession(role)`, schreiben mit `setPreferences` jede Preference, von der sie abhängen, und leiten die Erwartung aus `roles(session)` ab statt aus einer angenommenen Klassenzugehörigkeit — siehe [[browser-verification]] für die geteilten Accounts. Was der Korpus zeigt, aber nicht prüfbar ist (u.a. `@@@ admin` ist für alle sichtbar), steht in `docs-testing.md` unter "What the corpus demonstrates but a run cannot assert".

Siehe [[architecture-doc]] (§2 Tooling, §9 Observations). Code und Doku auf Englisch gemäß [[code-language-english]], Ablageort nach [[ai-folder-layout]].
