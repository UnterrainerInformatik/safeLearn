Source proposal: `AI/proposals/initial-repairs.md`

The four earlier changes out of this file deliberately carried no such line, because each covered only part of it and retiring the file would have dropped the rest. This one closes it, so archiving this change retires it.

## Why

`AI/proposals/initial-repairs.md` has produced four changes so far — `fix-role-check-self-grant`, `harden-role-set-assembly`, `harden-deployment-surface` and `bundle-reveal-locally`. What is left is its last bullet: the findings too small to have earned a change of their own, and one that turned out not to be small at all. They have been carried in `AI/architecture.md`'s Observations across every change since the document was written, re-read each time and each time deferred. This change closes the proposal.

Three of them are defects a reader would call bugs rather than divergences. The `#practice` directive is resolved by `a.ve == 0` alone, with no role in the rule, so a teacher who switches the exam view on and then looks at the page as a student sees neither the exam variant nor the practice one — the question disappears. `test/checks/views.js:92-100` asserts exactly that, as the behavior that exists, while `content-verification` already specifies the opposite ("the practice variant is what the student sees"). The suite and the spec have been contradicting each other since both were written, and the suite won by being the thing that runs.

The rest is documentation that describes a system nobody can find: a claim name that needs a Keycloak mapper the setup guide says is unnecessary, an `.env` field under a name the code does not read, a Windows script that does not exist, and a GitHub Pages pipeline announced on the start page of every deployment that was never built. Each one costs whoever follows it an afternoon.

## What Changes

- **`#practice` becomes the counterpart of `#exam`**, granted whenever the exam variant is not: the exam view is a teacher's privilege, and a session that has been downgraded to the student view has given that privilege up along with `teacher` and `admin`. Exactly one of the two variants is visible to every session, in every combination of preferences. `test/checks/views.js` stops asserting the hole and starts asserting the rule.
- **`/hot-reload` stops throwing on malformed input.** `req.query.context` is `JSON.parse`d without a guard on the one endpoint that is reachable without authentication — deliberately so, and that stays. A parse failure is treated as an absent context, which is what an unparseable one is. The endpoint's authentication is out of scope: it is intentional and the proposal's author struck it from the list.
- **`getDirectoryListing` stops indexing an empty array.** `obsidian.js:1353` reads `filteredFiles[filteredFiles.length - 1]` to decide whether to close two `div`s; a session that may see no file at all reaches it with nothing to index and gets an error page instead of an empty tree.
- **`preReplaceObsidianFileLinks` stops truncating the path it emits.** `obsidian.js:949` calls `f.split(0, -3)` in the duplicate-basename branch — `String.prototype.split` with `0` as the separator. For most names it returns a single-element array that stringifies back with the `.md` still attached; for a name containing the digit `0` it splits there and emits a link with a comma in it. The branch is only reached when two `.md` files share a basename, which is why it survived. The extension it was reaching for is the one the page handler decides on, so the call goes away rather than becoming `slice`; see `design.md`.
- **`CTRL+ALT+D` matches the shifted key too.** `obsidian-page.js:28` tests `event.key === "d" || event.key === "d"`, so the uppercase variant does nothing — unlike the `p`/`P` case three lines above it.
- **Dependency housekeeping**: `cors` is removed from `package.json` (declared, never imported — the application serves its own pages and has no cross-origin caller); the self-referencing `"safe-learn": "file:"` entry is removed; `.nvmrc` and the `Dockerfile` are brought to Node 24, the line that is under long-term maintenance, and `package.json` gains the `engines` field that states it once for both.
- **Dead exports are removed**: `uiConfig` and `hasAllRoles` (`utils.js`), `mdFilesDirOnHdd` (`obsidian.js` — declared, cleared on every scan, never populated or read), and the `export` keyword on `jwtDecode`, `issuerUrl` and `keycloakIssuer`, which are used only inside their own module.
- **Documentation is brought back to what the code does**: the LDAP claim name and the mapper it requires (`docs-keycloak.md`), `PUBLIC_START_PAGE` (`docs-wysiwyg.md`), the Windows container's actual name and script (`docs-wysiwyg.md`), `httpyac.config.cjs` (`docs-debugging.md`), the directories the `Dockerfile` really copies (`docs-debugging.md`), `##fragment` (`docs-obsidian.md`), and the `Reveal.sj` typo (`README.md`).
- **The ASCIIDoc / GitHub Pages announcement is retired.** `index.html` stops promising to be replaced by gh-pages output and `docs-debugging.md` stops referring to the pipeline. `asciidocs/` stays on disk as the material it is; it is simply no longer described as feeding a build that does not exist.
- **The `/obsidian-page.css` observation is closed.** `bundle-reveal-locally` removed the link as it rewrote `wrapInReveal`, but `AI/architecture.md:339` still describes the defect as present and the bullet in the source proposal is still open. Both are corrected. The known-dangling fixture in `test/checks/presentation.js` stays — it is a self-test of the list mechanism, not an entry for this reference.
- `AI/proposals/initial-repairs.md` is fully struck through by this change and retires with it.

## Capabilities

### New Capabilities

<!-- None. Every behavior this change touches belongs to a capability that already exists. -->

### Modified Capabilities

- `role-resolution`: gains the rule governing `#practice`. Today the capability specifies the exam view's gate and says nothing about its counterpart, which is how the two came to be specified in one document and contradicted in another. The new requirement states the relation between them, so that the pair cannot drift apart again.
- `deployment-surface`: gains the guarantee that an endpoint reachable without authentication answers malformed input rather than raising on it. The capability already governs what a deployment publishes and what it demands of its environment; how its one unauthenticated endpoint reacts to a hostile query string belongs there.
- `content-verification`: the navigation and link requirements gain the two edge cases this change repairs — a session that may see no file at all, and a duplicated basename carrying a digit — so that both are proven rather than assumed.

## Impact

- **Code**: `utils.js` (the `#practice` rule, dead exports), `app.js` (the `/hot-reload` parse guard), `obsidian.js` (`getDirectoryListing`, `preReplaceObsidianFileLinks`, `mdFilesDirOnHdd`), `obsidian-page.js` (the shortcut), `middlewares/keycloak-middleware.js` (export keywords).
- **Tests**: `test/checks/views.js` reverses its practice assertion; `test/checks/navigation.js` gains the empty-tree and duplicate-basename cases; `test/coverage-map.json` records the checks covering each touched file.
- **Dependencies**: `cors` and the self-reference leave `package.json`. Nothing is added. `npm install` produces a smaller tree; no code changes behavior as a result, since neither was ever loaded.
- **Runtime**: Node moves from 25.6.0 to 24 in the image and from 20 to 24 in `.nvmrc`. Both are within the range the current code and dependency tree already support; the image rebuild is the only deployment step.
- **Behavior**: a teacher in the student view sees the practice variant where they previously saw nothing. Everything else in this change either repairs an error path or is invisible at runtime.
- **Corpus**: `md/` needs a file whose basename is duplicated and contains a digit, and a way to reach a listing with no visible file, for the two new checks to have something to read.
- **Documentation**: `docs-keycloak.md`, `docs-wysiwyg.md`, `docs-debugging.md`, `docs-obsidian.md`, `README.md`, `index.html`, `AI/architecture.md` (the Observations this change settles), `AI/proposals/initial-repairs.md`.
