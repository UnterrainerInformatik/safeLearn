---
name: browser-verification
description: npm test runs a Puppeteer harness that logs into the live demo Keycloak with the shared public demo accounts
metadata:
  node_type: memory
  type: project
---

`npm test` ist kein Unit-Test-Lauf. Die Harness in `test/harness.js` startet SafeLearn aus dem Working Tree (oder übernimmt eine Instanz, die schon auf dem Port lauscht), fährt im echten Browser den kompletten Keycloak-OIDC-Flow durch und liefert eine authentifizierte Page zurück. `test/smoke.test.js` prüft die Harness selbst. `npm run test:headed` läuft identisch, aber mit sichtbarem Fenster.

**Why:** Jeder Lauf authentifiziert sich **live gegen `https://auth.unterrainer.info`** mit den geteilten öffentlichen Demo-Accounts `student`/`student` und `teacher`/`teacher`. Ohne Netz schlägt der Lauf fehl, einen Offline- oder Mock-Modus gibt es nicht. SafeLearn legt Preferences (`config`, `lastVisitedUrl`) als Keycloak-User-Attribute ab — ein Testlauf verändert also serverseitigen Zustand eines Accounts, den andere gleichzeitig benutzen können.

**How to apply:** Checks adressieren Seiten immer per Pfad und setzen jede Preference, von der sie abhängen, selbst — nie auf einen Startzustand verlassen (`/` löst je nach `config.sl` auf `lastVisitedUrl` auf). Der Port ist nicht frei wählbar: die Redirect-URI `http://localhost:8080/auth/callback` ist am Keycloak-Client registriert, ein anderer Port braucht dort einen Eintrag. Puppeteer ist die einzige `devDependency` und bleibt via `npm install --omit=dev` aus dem Docker-Image. Details in `docs-testing.md`.

Eingeführt am 2026-08-15 über den OpenSpec-Change `install-puppeteer`. Siehe [[architecture-doc]] (§2 Tooling, §9 Observations, §10 Source Documents). Code und Doku auf Englisch gemäß [[code-language-english]], Ablageort nach [[ai-folder-layout]].
