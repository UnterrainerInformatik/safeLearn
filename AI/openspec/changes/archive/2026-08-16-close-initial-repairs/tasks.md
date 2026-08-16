## 1. The practice rule

- [x] 1.1 In `utils.js` `hasRoles`, replace the `#practice` case's `a.ve == 0` with the negation of the `#exam` case's condition, over the same `isAdmin`/`isTeacher` flags at the same point after the student-view downgrade. Leave the `#exam` case untouched.
- [x] 1.2 Add a comment at the pair stating that the two cases are one rule and its complement, so that a later edit to either one is made at both.
- [x] 1.3 Rewrite `test/checks/views.js:85-101`: the student with the exam preference set now keeps the practice variant. Delete the comment that recorded the defect as intended behavior.
- [x] 1.4 Add the teacher-in-student-view case to `test/checks/views.js` — exam preference on, teacher view off — asserting the practice variant present and the exam variant absent, and that the question matches what the student session is shown on the same page.
- [x] 1.5 Assert complementarity rather than each variant alone: for every role/preference combination the check reads, exactly one of the two variants is present. A combination showing neither must fail.
- [x] 1.6 Run `npm test`. The views checks must pass; nothing else may change.

## 2. The two error paths

- [x] 2.1 Guard the `JSON.parse` of `req.query.context` in the `/hot-reload` handler (`app.js:182`): a value that does not parse is treated as an absent context. Do not touch the endpoint's position relative to `checkAuthenticated` — it is reachable without a session by decision.
- [x] 2.2 Add the assertion to `test/checks/deployment-surface.js`: request `/hot-reload` with a `context` parameter that does not parse, read the response headers, confirm the stream was established and is not ended by the server, then abandon it. Do not open it from the browser page — the harness refuses that stream on purpose.
- [x] 2.3 Guard `obsidian.js:1353`: `filteredFiles[filteredFiles.length - 1]` is only read when the array holds something. An empty set produces an empty tree, not an error.
- [x] 2.4 Record the verification gap for 2.3 in `docs-testing.md` under "What the corpus demonstrates but a run cannot assert": reaching it needs a session that may see no file, `md/` is hardcoded, and restricting every corpus file against every test account would take the rest of the suite down. Name the realistic trigger — a WYSIWYG container pointed at an empty vault.
- [x] 2.5 Run `npm test`.

## 3. The duplicated basename

- [x] 3.1 Add two corpus files whose basename is identical, contains a digit, and exists in two folders — for example `md/test-chapter-10.md` and `md/presentations/test-chapter-10.md`, each naming which one it is in its content.
- [x] 3.2 Add a wiki-link to one of them from `md/test-md-file.md`, in the same form the existing duplicated basename uses.
- [x] 3.3 Run `npm test` before repairing anything: the new corpus files must not disturb the navigation-tree and folder checks, and the new link must fail on the current code. A failure anywhere else is a corpus problem to fix here, not a regression from the next task.
- [x] 3.4 Remove the truncation at `obsidian.js:949` — `f` is already the disambiguating path and is emitted whole, extension included, the way the single-candidate line above it emits one. `slice(0, -3)` was the repair this task originally named; it drops the `.md` the page handler in `app.js` decides on, so both duplicate links then fall through to the catch-all. Proven by a run before it was corrected.
- [x] 3.5 Extend `test/checks/navigation.js` with the digit case: the emitted link addresses that file, carries the digit as written and no character the name does not, and following it arrives at the intended file.
- [x] 3.6 Add the two corpus files to `test/checks/navigation.js`'s `corpus` list in `test/coverage-map.json`.
- [x] 3.7 Run `npm test`.

## 4. The document-view shortcut

- [x] 4.1 Fix `obsidian-page.js:28` so the shortcut matches both `d` and `D`, in the same form as the `p`/`P` case above it.
- [x] 4.2 Add the shortcut check to `test/checks/presentation.js`: press it with shift held and without it, and assert the document view is reached in both cases.
- [x] 4.3 Add `obsidian-page.js` to `test/checks/presentation.js`'s `guards` list in `test/coverage-map.json`.
- [x] 4.4 Run `npm test`.

## 5. Dependency and runtime housekeeping

- [x] 5.1 Remove `cors` and the self-referencing `"safe-learn": "file:"` from `package.json`'s `dependencies`. Run `npm install` and commit the resulting `package-lock.json`.
- [x] 5.2 Confirm the removal is safe by searching the repository — including `wysiwyg-container-linux/`, `wysiwyg-container-windows/` and `http/` — for any import of `cors` or of the package by its own name.
- [x] 5.3 Set `.nvmrc` to `24` and the `Dockerfile` base image to `node:24-alpine`.
- [x] 5.4 Add `"engines": { "node": ">=24 <25" }` to `package.json`.
- [x] 5.5 Run `npm install` and `npm test` on Node 24. If the suite fails on 24 for a reason inside the dependency tree, stop and report it — this group is separable from every other group in this change.
- [x] 5.6 Record the Node line in `docs-building.md` where the build is described, so the two files and the image agree with the documentation.

## 6. Dead exports

- [x] 6.1 Remove `uiConfig` and `hasAllRoles` from `utils.js`, after searching the whole repository for either name.
- [x] 6.2 Remove `mdFilesDirOnHdd` from `obsidian.js` — the declaration at line 138 and the clearing loop at line 565.
- [x] 6.3 Drop the `export` keyword from `jwtDecode`, `issuerUrl` and `keycloakIssuer` in `middlewares/keycloak-middleware.js`, keeping the functions themselves.
- [x] 6.4 Run `npm test`.

## 7. Documentation

- [x] 7.1 `docs-keycloak.md`: state that the LDAP claim must be named `ldap` and requires a mapper, replacing the claim that `LDAP_ENTRY_DN` is present automatically and needs no setup.
- [x] 7.2 `docs-wysiwyg.md`: rename `PUBLIC_START_URL` to `PUBLIC_START_PAGE`, and correct the Windows section to `wysiwyg-container-windows/` and `up.sh`.
- [x] 7.3 `docs-debugging.md`: correct `httpyac.config.js` to `httpyac.config.cjs`, and correct the claim that all other files are ignored by the build pipeline — the `Dockerfile` also copies `md/`, `assets/`, `middlewares/` and `css/`.
- [x] 7.4 `docs-obsidian.md`: correct the prose describing fragments as `#fragment` to `##fragment`, matching every example and the implementation.
- [x] 7.5 `README.md`: correct "Presentations with Reveal.sj".
- [x] 7.6 Withdraw the ASCIIDoc / GitHub Pages announcement: remove the promise from `index.html` and the reference from `docs-debugging.md`. Leave `asciidocs/` on disk and do not describe it as feeding a pipeline.
- [x] 7.7 Run `npm test` — `index.html` is served through the deployment allowlist and is asserted by `test/checks/deployment-surface.js`.

## 8. Close the proposal

- [x] 8.1 Mark each Observation this change settled in `AI/architecture.md` section 9 in the established form — strike the bullet through and name the change that settled it: the `cors` declaration, the self-reference, the Node divergence, the `/obsidian-page.css` stylesheet, the dead exports, the `split`/`slice` call, the `getDirectoryListing` index, the `CTRL+ALT+D` shortcut, the `#practice` grant, the `JSON.parse` guard, and the eight documentation divergences.
- [x] 8.2 Update the dependency table in `AI/architecture.md` section 2 for the removed `cors` and self-reference rows, and the tooling entry for the Node line.
- [x] 8.3 Strike through the two remaining bullets in `AI/proposals/initial-repairs.md` and name this change, in the form the four earlier changes used. The `/hot-reload` bullet the author struck stays struck, with its reason.
- [x] 8.4 Confirm the known-dangling list in `test/checks/presentation.js` is untouched — its `/obsidian-page.css` entry is a fixture of the list mechanism's own self-test, not an exception for a live reference.
- [x] 8.5 Run `npm test` one final time, with every group applied.
