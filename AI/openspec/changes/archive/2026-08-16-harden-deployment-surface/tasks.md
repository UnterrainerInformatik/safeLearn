## 1. Narrow what is served

- [x] 1.1 In `app.js`, replace the single `express.static(path.join(__dirname, "/"))` (`app.js:332`) with one mount per location in design.md Context, each keeping `checkAuthenticated` and each under the URL prefix already being requested so no emitted reference changes: `/assets` → `assets/`, `/css` → `css/`, `/md` → `md/`, and `/obsidian-page.js` → the file at the application root.
- [x] 1.2 Add the two narrow dependency mounts from design Decision 2: `/node_modules/mermaid/dist` and `/node_modules/@mermaid-js/layout-elk/dist`, each pointing at that package's `dist` directory under `__dirname`. Mount the directories, not the two entry files — mermaid fetches chunks from `./chunks/mermaid.esm.min/` at runtime.
- [x] 1.3 Leave a comment at the mounts stating that this is an allowlist and why: a file added to the application directory must not become a URL, and `keycloak.json` sits in that directory in every deployment because `initKeycloak` reads it from there. Name what to do when a new browser-side reference is added — add a mount for it.
- [x] 1.4 Confirm the `.md` handler above (`app.js:291`) still answers every Markdown request before any static mount is reached, so whole-file permissions cannot be bypassed by the new `/md` mount. Re-read the handler rather than assuming the ordering survived the edit.
- [x] 1.5 Grep the repository for further absolute references a page might emit (`href="/`, `src="/`, `import "/`, `url(/`) across `app.js`, `obsidian.js`, `obsidian-page.js`, `index.html` and `css/`, and confirm the mount list covers every one of them. Record any reference that resolves to nothing today — `/obsidian-page.css` is known and belongs to another change; do not fix it here.
  - Found, and all covered: `/css/main.css` and `/css/reveal.css` (`obsidian.js:1847`, `:1891`, `:1935`), `/assets/favicon.ico` (`:1848`, `:1892`, `:1936`, and `index.html:5`), `/obsidian-page.js` (`:1866`, `:1902`), the two mermaid imports (`:1687`, `:1688`), and `getFontImports`' `url(/${f})` (`:1504`, `:1513`), whose `f` is `assets/main-fonts/…` or `assets/nav-fonts/…` from `scanFonts` — under `/assets`. `main.css` `@import`s eleven siblings relative to itself, so they resolve under `/css`. `obsidian.js:1476` emits `<a href="/md/…">` into the navigation tree, which the `.md` handler answers. `obsidian-page.js` fetches only `/userattributes`; `obsidian.js:1545` sends the browser to `/logout` from an `onclick`. Both are routes, not files.
  - Nothing dangles: `/obsidian-page.css` is no longer emitted (`docs-testing.md` records that), so the known-dangling list stays empty.
  - One reference the grep pattern could not find, because it is emitted by the corpus rather than by the code: `README.md:2` embeds `![](logo-128.png)`, resolved relative to the page, and `README.md` is the start page of this working tree and of the deployment. It fell through to the start page after the first pass. Proposal.md names "the logos" as part of the served set, so the four `logo-*.png` files got a mount of their own and `/logo-128.png` joined the asset assertions in 5.4. Verified against a running instance: all 28 same-origin references of `/README.md` resolve.
  - `/index.html` was raised as a question and settled by decision: mount it, and make it the fallback start page when the configuration names none. It is the one member of the served set that is there for a reason other than a page referencing it — `getStartPage` names it, and a start page without a mount is answered with the start page, which is itself. The code's previous fallback, `/test-md-file.md`, was a path the corpus does not hold (the file is at `/md/test-md-file.md`), so an unconfigured deployment looped before this change too; `docs-building.md` has named `/index.html` as the default all along.

## 2. Require a session secret

- [x] 2.1 In `middlewares/keycloak-middleware.js`, take the `session()` secret from `process.env.SESSION_SECRET` instead of the literal, and delete the literal.
- [x] 2.2 Before the `session()` call, fail when the variable is missing or empty: log a message naming `SESSION_SECRET` and the `.env` file a deployment sets it in, then exit. No generated fallback and no development default (design Decision 3) — the person who reads this message is deploying a container, not reading the source.
- [x] 2.3 Confirm `dotenv`'s `config()` (`app.js:85`) has run before `initKeycloak` reads the variable, so a value in `.env` is seen. If the order does not already hold, make it hold rather than reading the file a second time.
- [x] 2.4 Add `SESSION_SECRET` to the `.env` of both WYSIWYG variants and to any local `.env` template the repository ships, with a value that is obviously a placeholder to be replaced.

## 3. Record the session store decision

- [x] 3.1 At the `MemoryStore` construction in `middlewares/keycloak-middleware.js`, replace the section banner comment with one stating the decision from design Decision 4: sessions are held in this process deliberately, they do not survive a restart, and a second instance requires replacing the store first.
- [x] 3.2 In `docs-building.md`, tell operators the same thing where they meet it — one container only, everyone re-authenticates on every deploy, and what has to change before a second instance can be added.

## 4. Carry the variable to every place that starts the app

- [x] 4.1 In `.github/workflows/docs-local.yml`, add `SESSION_SECRET` to the `.env` generation step from a new repository secret of the same name, beside the existing `NEXT_PUBLIC_*` lines.
- [x] 4.2 In `deploy/docker-compose.yml`, pass the variable through to the container in the `environment` block.
- [x] 4.3 In `wysiwyg-container-linux/docker-compose.yml` and `wysiwyg-container-windows/`, do the same — each is a separate way of starting the same image and each will otherwise refuse to start.
- [x] 4.4 In `docs-building.md`, add `SESSION_SECRET` to the secrets table with what it is for and the instruction to generate a long random value per deployment. State that a deployment that does not set it will not start, and that setting it logs every user out once.
- [x] 4.5 In `docs-wysiwyg.md`, add it to the `.env` field table. Do not correct the neighbouring `PUBLIC_START_URL`/`PUBLIC_START_PAGE` divergence — that belongs to the documentation change.
- [x] 4.6 In `docs-debugging.md`, say what a developer running locally needs in their own `.env` before `npm run start` will come up.

## 5. Verification

- [x] 5.1 Add `test/checks/deployment-surface.js` in the shape of the existing check modules (a module, not a test file — see the header of `test/content.test.js`), and import it from `test/content.test.js`.
- [x] 5.2 Assert the refusals with an authenticated session: `/keycloak.json`, `/app.js`, `/utils.js`, `/obsidian.js`, `/package.json` and `/package-lock.json` do not answer with their contents. Issue the requests so they carry the session, and assert on what came back rather than on a status code alone.
- [x] 5.3 For `/keycloak.json` specifically, assert the response contains neither the `credentials` field nor the configured client secret. Write it so that a working tree where the file is absent cannot make the check pass vacuously — say so in the check's comment (design Decision 5).
- [x] 5.4 Assert the assets still answer: `/css/main.css`, `/assets/favicon.ico`, `/obsidian-page.js`, and both mermaid entry modules, each with content rather than a redirect to the start page.
- [x] 5.5 Assert that every same-origin reference of a rendered page resolves, using the harness's `sameOriginReferences`, across the page, document and presentation views. `docs-testing.md` records that this list is empty today; it stops being empty here.
- [x] 5.6 Register the new check in `test/coverage-map.json` as guarding `app.js` and `middlewares/keycloak-middleware.js`, with the corpus entries it reads.
- [x] 5.7 Run `npm test` and record the result. Every content check authenticates against the live demo realm, so a failure naming the login rather than an assertion is an environment problem, not a regression. Set `SESSION_SECRET` in the local `.env` first — without it the harness cannot start the server, which is the new behavior working.
- [x] 5.8 Start the application and confirm in a browser that a page with a mermaid diagram renders one, and that the presentation view still loads. The mermaid chunks are fetched at runtime and no assertion on the emitted markup would catch a broken mount.

## 6. Documentation and closing out

- [x] 6.1 In `docs-testing.md`, add the new check to the table of what each file covers, and update the note that records the same-origin reference list as empty.
- [x] 6.2 In `docs-development.md`, record what to do when a new browser-side reference is added: it 404s until it gets its own mount in `app.js` (design Risks).
- [x] 6.3 In `AI/architecture.md`, resolve the three Observations entries this change settles — the `express.static` root, the hardcoded session secret, and `MemoryStore` (as decided, with its price, not as removed). Leave the `/hot-reload` and `req.query.context` entries untouched.
- [x] 6.4 In `AI/architecture.md`, correct the `mermaid` row of the dependency table and the pipeline section wherever they describe the broad static root.
- [x] 6.5 In `AI/proposals/initial-repairs.md`, mark the `express.static` and session-secret bullets as resolved by this change, in the manner the `student` bullet already is, so the remaining proposal does not re-open them.
- [x] 6.6 Write the deployment note: `SESSION_SECRET` must exist as a repository secret before the image that requires it is deployed, everyone is logged out once, and after deploying, `/keycloak.json` should no longer return the file while a mermaid diagram should still render (design Migration Plan).
- [x] 6.7 Run `openspec validate harden-deployment-surface --strict` and resolve anything it reports.
