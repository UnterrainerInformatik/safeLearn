## Context

See proposal.md — Why. What shapes the approach is the small, closed set of things a rendered page actually asks the server for, and the fact that `keycloak.json` cannot simply be moved out of the way.

**What the browser requests, beyond rendered Markdown.** All of it is emitted by `obsidian.js` in the three page wrappers, and it is a short list:

| Reference | Emitted at | Backed by |
| --- | --- | --- |
| `/css/main.css`, `/css/reveal.css` | `obsidian.js:1847`, `:1935` | `css/` — `main.css` `@import`s eleven siblings, all in the same directory |
| `/assets/favicon.ico` | `obsidian.js:1848`, `:1892`, `:1936` | `assets/`, which also holds `main-fonts/` and `nav-fonts/` |
| `/obsidian-page.js` | `obsidian.js:1866` | one file at the application root |
| `/node_modules/mermaid/dist/mermaid.esm.min.mjs` | `obsidian.js:1687` | the dependency tree |
| `/node_modules/@mermaid-js/layout-elk/dist/…` | `obsidian.js:1688` | the dependency tree |
| images and other non-Markdown files inside `md/` | the corpus itself | `md/` |

Everything else the current mount publishes — `app.js`, `utils.js`, `obsidian.js`, `package.json`, `package-lock.json`, `keycloak.json`, `test/`, `AI/`, the rest of `node_modules` — is published because the mount is the whole directory, not because anything asks for it.

**Where `keycloak.json` has to live.** `initKeycloak` reads it with `fs.readFileSync("keycloak.json")` from the process working directory, which the `Dockerfile` sets to `/app` — the same directory `express.static` serves. The release workflow writes it there (`site/keycloak.json` → `COPY site/ /app`), and both WYSIWYG compose files bind-mount it to `/app/keycloak.json`. So the file is next to `app.js` in every deployment by construction, and the fix has to be on the serving side.

**What is already safe, verified rather than assumed.** `.md` requests never reach the static mount — the handler at `app.js:291` answers anything with that extension and only calls `next()` otherwise. `serve-static` refuses path traversal (`/../package.json` → 404). Dotfiles are ignored by default, so `/.env` is already a 404 even though the release workflow copies `site/.env` into `/app`. All three were checked against `express` 4.22.1 as installed here, not taken from documentation.

**Configuration mechanism.** `app.js:85` already calls `dotenv`'s `config()`, and the deployment reads `NEXT_PUBLIC_*` and `NEXT_AUTOSCAN` from the environment. A session secret has a place to live without inventing one.

## Goals / Non-Goals

**Goals:**

- A path is reachable because something references it, not because a file happens to sit in the application directory. Adding a file to the repository must not publish it.
- The mermaid modules keep loading, including the chunks they fetch at runtime, without opening the dependency tree.
- A deployment that has not been given a session secret does not start.
- The `MemoryStore` constraint is written down where an operator meets it.

**Non-Goals:**

- Serving `md/` images through a permission check. Non-Markdown files inside the corpus are reachable by anyone who is logged in today; that is existing behavior and its own question. This change must not silently alter it in either direction.
- Session cookie flags (`secure`, `sameSite`). They interact with the reverse proxy in front of the deployment and belong with that configuration.
- Moving `keycloak.json` out of the application directory, or reading it from the environment instead. That reaches the release workflow, both compose variants and the local development setup, and the serving-side fix removes the exposure on its own.

## Decisions

### Decision 1: An allowlist of mounts, not a filter on the existing one

Replace the single `express.static(path.join(__dirname, "/"))` with one mount per location the table above names, each under the URL prefix that is already being requested — so no emitted reference changes.

*Alternatives considered.* **A deny-list** (`setHeaders`/middleware refusing `keycloak.json`, `*.js` at the root, `package*.json`) keeps the broad root and is one line shorter today. It is wrong in the direction it fails: every file added to the repository from now on is published unless someone remembers to extend the list, and the list has to be right about a set that grows. The allowlist fails the other way — a forgotten asset 404s visibly in a test run and in the browser, rather than a forgotten secret being served silently. **Moving the servable files into a `public/` directory** and serving only that is the cleanest end state, but it moves `css/`, `assets/` and `md/` and rewrites the `Dockerfile`'s `COPY` lines and both compose mounts, for the same result this achieves without touching deployment layout.

### Decision 2: The mermaid mounts point at `dist`, not at the two files

`mermaid.esm.min.mjs` imports from `./chunks/mermaid.esm.min/` and pulls further chunks at runtime depending on the diagram type, so mounting the two entry files alone would break the first diagram that needs a chunk. Mount each package's `dist` directory instead, under the `/node_modules/<pkg>/dist` prefix the emitted `import` already names:

- `/node_modules/mermaid/dist` → `node_modules/mermaid/dist`
- `/node_modules/@mermaid-js/layout-elk/dist` → `node_modules/@mermaid-js/layout-elk/dist`

Two published `dist` directories hold library code and its type declarations — public artifacts either way. What matters is that the rest of the tree stops being published, so a future dependency shipping a fixture, a script or a `.env.example` in its package does not become a URL.

*Alternative considered.* Copying the browser-side modules into `assets/` at build time would let `/node_modules` disappear entirely, but it adds a build step to a project that has none, and the copy has to be redone on every dependency bump — an easy thing to forget and a confusing thing to debug when the served copy is stale.

### Decision 3: The secret is required, not defaulted

Read `process.env.SESSION_SECRET` in `initKeycloak` and exit with a message when it is missing or empty. No generated fallback and no development default.

A generated-per-start secret would be the friendlier alternative, and it is what a "convenient" version of this does: sessions simply do not survive a restart, which is already true of the `MemoryStore`. It is rejected because it removes the signal. An operator who forgets the variable gets a deployment that works and quietly logs everyone out on every deploy, and the misconfiguration is discovered by users, not by the start-up. The one-line failure is worth more than the convenience — and the developer running locally pays for it once, in a `.env` file they already have.

The message has to name the variable and the file to put it in, because the person who sees it is an operator deploying a container, not someone with the source in front of them.

### Decision 4: `MemoryStore` is kept and recorded

The store stays as it is. What changes is that the constraint is stated in three places rather than implied by a variable name: a comment at the `session()` call, an entry in the operator documentation, and — since `AI/architecture.md` currently lists it as an open observation — a resolution there saying it was decided rather than overlooked.

*Alternative considered.* `connect-redis` plus a Redis service. It buys sessions that survive a deploy and the option of a second instance; it costs a service to run, back up and monitor, and reaches the release workflow, three compose files and the verification harness. For one container serving one school, the cost is real and the benefit is not yet needed. The documentation names the trigger for revisiting it: a second instance.

### Decision 5: Verification asserts both directions

A new `test/checks/deployment-surface.js` in the existing content-suite shape asserts, with an authenticated session:

- the sensitive paths (`/keycloak.json`, `/app.js`, `/utils.js`, `/obsidian.js`, `/package.json`, `/package-lock.json`) do not answer with their contents, and `/keycloak.json` in particular does not answer with anything containing the client secret;
- the asset paths (`/css/main.css`, `/assets/favicon.ico`, `/obsidian-page.js`, the two mermaid entry modules) do answer;
- a rendered page's own same-origin references all resolve — the harness already exposes the references of a rendered page, which is what makes the allowlist safe to tighten.

The negative half is what stops a later "just add the root back" from going unnoticed; the positive half is what stops this change from breaking a page nobody looked at. The reference check is the one that would catch an asset nobody thought of.

Requesting `/keycloak.json` needs no fixture: the file is present in a working tree that can run the suite at all, since the application reads it at start-up. Where it is absent the check cannot distinguish "refused" from "not there", so it must assert on the response not containing the secret, and be written so that a missing file does not make it pass vacuously.

## Risks / Trade-offs

- **An asset nobody enumerated 404s after the change** → The reference check in Decision 5 walks what a rendered page actually asks for, across the page, document and presentation wrappers, rather than trusting the table in Context. `docs-testing.md` already records that the same-origin reference list is empty today because `/obsidian-page.css` does not exist — that entry becomes non-empty here and is the thing to watch.
- **A future dependency emits a browser-side import from a third package** → It will 404 immediately and visibly, and the fix is one more narrow mount. This is the allowlist behaving as intended, but it is a step someone has to know about: it goes into `docs-development.md`.
- **An operator upgrades without setting `SESSION_SECRET` and the container restart-loops** → Deliberate, and the reason it is a hard failure. It is called out in the deployment note and in `docs-building.md`, and the message names the variable. The failure is loud, immediate and reversible, unlike the silent alternative.
- **Everyone is logged out at the moment the new secret takes effect** → Once, at deploy time. Worth naming in the deployment note; a re-login is the entire cost.
- **The mermaid mount hard-codes a package's internal layout** → `dist/` is the published entry point of both packages and the path is already hard-coded in the emitted `import`, so this adds no coupling that is not there today. A major bump that moves it breaks the import first, in the browser, where it is obvious.

## Migration Plan

1. Add `SESSION_SECRET` as a repository secret and to the `.env` generation step in `.github/workflows/docs-local.yml` **before** the image that requires it is deployed. A long random value; it is only ever compared to itself.
2. Deploy. Sessions from the previous image stop being accepted — users log in again once. Nothing is stored that needs migrating.
3. Local development and both WYSIWYG variants: add the variable to the `.env` each of them already uses. `docs-wysiwyg.md` and `docs-debugging.md` say so.
4. After deploying, confirm from a logged-in browser that `/keycloak.json` no longer returns the file and that a page with a mermaid diagram still renders one.

**Rollback.** Revert the commit and redeploy; the deployment keeps working with `SESSION_SECRET` set, since the old code ignores it. Everyone is logged out once more on the way back. Nothing persisted changes shape in either direction.
