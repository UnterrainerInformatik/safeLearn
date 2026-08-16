## Why

`app.js:332` serves `express.static(path.join(__dirname, "/"))` — the application directory itself. Every authenticated user can therefore fetch `/app.js`, `/utils.js`, `/obsidian.js`, `/package.json` and, above all, `/keycloak.json`, which holds the OIDC **client secret**. This is not hypothetical in a deployment: the release workflow writes `secrets.KEYCLOAK_FILE` to `site/keycloak.json` and the `Dockerfile` copies `site/` into `/app`, next to `app.js`; both WYSIWYG variants mount their `keycloak.json` to the same place. `initKeycloak` reads the file from the working directory, so it has to be there. The repository is clean — the root file is gitignored and the tracked container copies hold placeholders — but every running instance serves its own secret to anyone who can log in, which in a school is every pupil.

Alongside it, the session secret is a literal in `middlewares/keycloak-middleware.js`, so it is identical in every deployment built from this source — and this source is a public project meant to be forked. A per-deployment secret is the one thing that makes a session cookie's signature worth anything.

## What Changes

- **Static file serving becomes an allowlist.** Instead of exposing the application directory and relying on nothing sensitive being in it, the server serves the directories and files the browser actually asks for — `assets/`, `css/`, `md/`, `obsidian-page.js`, the logos — and nothing else. `/keycloak.json`, `/app.js`, `/utils.js`, `/obsidian.js`, `/package.json` and `/package-lock.json` stop being reachable.
- **The two browser-side mermaid modules keep working.** `obsidian.js` emits `import` statements for `/node_modules/mermaid/dist/mermaid.esm.min.mjs` and `/node_modules/@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs`, which today ride on the broad root. They get their own narrow mount rather than an open `/node_modules`, so the rest of the dependency tree — including anything a future dependency ships in its package — is not published along with them.
- **The session secret comes from the environment.** A new `SESSION_SECRET` joins the existing `.env` mechanism the application already uses (`dotenv` in `app.js`, `.env` written by the release workflow). Startup fails with a message naming the variable when it is missing, rather than falling back to a shared default that would keep every deployment on the same secret.
- **BREAKING for operators**: an existing deployment must set `SESSION_SECRET` before the new image starts, and every session is invalidated at that moment. Users log in again once. The release workflow, `deploy/docker-compose.yml` and both `wysiwyg-container-*` variants gain the variable; `docs-building.md`, `docs-wysiwyg.md` and `docs-debugging.md` describe it.
- **`MemoryStore` stays, and stops being an open question.** One container with an in-memory store is internally consistent, and this deployment is one container. The change records that as a decision with its price — sessions do not survive a restart or a deploy, and a second instance cannot be added without replacing the store first — so the next reader finds a conclusion instead of an observation.
- Not touched: `/hot-reload` reachable without authentication (intentional, confirmed), the session cookie's own flags (`secure`, `sameSite` — they interact with the reverse proxy and are their own change), and everything else in `AI/proposals/initial-repairs.md`.

## Capabilities

### New Capabilities

- `deployment-surface`: what a running instance publishes over HTTP beyond rendered content, and what it requires of its environment before it will start. Covers which files are reachable as static assets, that application sources and configuration are not among them, and that a deployment-specific session secret is mandatory rather than defaulted.

### Modified Capabilities

None. No existing capability describes static file serving or session configuration.

## Impact

- `app.js` — the `express.static` mount at line 332 becomes several narrow mounts. Note that `.md` requests never reach it (the handler above at line 291 answers those), and path traversal is already refused by `serve-static`; `.env` is already unreachable because dotfiles are ignored. Both were verified rather than assumed.
- `middlewares/keycloak-middleware.js` — the `session()` call: secret from `process.env`, the startup check, and a comment recording the `MemoryStore` decision.
- `.github/workflows/docs-local.yml` — a `SESSION_SECRET` line in the generated `site/.env`, from a new repository secret. Operators forking this project must add it.
- `deploy/docker-compose.yml`, `wysiwyg-container-linux/`, `wysiwyg-container-windows/` — the variable reaches all three, since each is a separate way of starting the same image.
- `docs-building.md` (the secret list), `docs-wysiwyg.md` (the `.env` fields), `docs-debugging.md` (running locally).
- `test/` — a check that the sensitive paths answer with a refusal while the asset paths still answer with content, and that a rendered page's own references all resolve. `test/coverage-map.json` records it.
- `AI/architecture.md` — three Observations entries resolve; the static-root note in the dependency table (`mermaid`) needs its wording updated.
- `AI/proposals/initial-repairs.md` — its bullets 2 and 3 are covered here. The Reveal.js, `/obsidian-page.css`, housekeeping and documentation bullets remain open for their own changes.
- No dependency is added or removed.
