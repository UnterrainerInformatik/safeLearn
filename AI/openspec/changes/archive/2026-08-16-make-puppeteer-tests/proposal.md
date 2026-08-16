Source proposal: AI/proposals/make-puppeteer-tests.md

## Why

The `md/test-*.md` corpus is the real specification of SafeLearn's behavior. Every feature the render pipeline and the permission model implement has a line in one of those files — the four callout variants, the fragment indices, the two- and three-column side-by-side layouts, the wiki-link that resolves a duplicated basename by path, the `@@@` block that must vanish for a student and appear for a teacher, the exam/practice/answer switch. Before each commit that corpus is read by a human, page by page, to see whether anything broke.

That pass is the only thing between a change and a silent regression, and it does not hold. It is long enough to be skipped under pressure, it cannot be run on a branch that nobody opened in a browser, and it produces no record. Meanwhile the queued `initial-repairs` change is aimed straight at the code the corpus exercises: replacing the CDN-loaded Reveal 3.7.0 with the bundled 5.2.1 rewrites the presentation view, narrowing `express.static` moves the ground under `/node_modules/mermaid/…` and every asset path, and the `/obsidian-page.css` repair touches the presentation wrapper. Each of those breaks in the browser while every file still parses.

`install-puppeteer` built the harness that makes this checkable — it starts the working tree, walks the Keycloak login and hands back an authenticated page — but the only thing asserted on that page today is that the login worked. The corpus is still read by hand.

## What Changes

- **Turn the corpus into assertions.** Five new test files under `test/`, each owning one concern of the manual pass, all built on the existing harness:
  - `permissions.test.js` — block-level `@@@` directives (`md/test-perms.md`), whole-file directives and their effect on the navigation tree (`md/test-fileperms-teachers.md`, `md/test-fileperms-4bhif-5bhif-2ahif.md`), time-bounded windows, and the teacher→student downgrade via preference `vt`.
  - `views.test.js` — the `#exam` / `#practice` / `#answer` pseudo-roles in `md/test-exam-practice-question.md`, driven through preferences `ve` and `va`, including that a student never reaches the exam variant.
  - `rendering.test.js` — the render features in `md/test-md-file.md`: every callout type and the collapsible variants, Shiki-highlighted code, Obsidian image embeds and the `|WxH` resize form, lists, fragment indices and their reset at headings, side-by-side with two and three columns, and the emitted PlantUML and Mermaid markup.
  - `navigation.test.js` — wiki-link resolution including the duplicated basename (`md/test-presentation.md` → `md/presentations/test-presentation.md`) and the name with spaces, the folder-name edge cases under `md/folder-tests/`, and the generated table of contents.
  - `presentation.test.js` — the Reveal deck built from `md/presentations/test-presentation.md`: horizontal sections cut at `h2`, vertical ones at `h3`, fragments as `.fragment`, plus the `?document=true` print view.
- **Assert on emitted markup, not on external services.** PlantUML is checked as the encoded server URL the page emits, the remote image as its `src`, Mermaid as the `<pre class="mermaid">` element and its script import. `auth.unterrainer.info` stays the only host a run depends on.
- **Extend the harness** with what content checks need and the login check did not: reading the session's effective role set, writing the preference block deterministically before a check that depends on it, and fetching a rendered page by path and view.
- **Record the coverage.** A map in `docs-testing.md` stating which test file guards which source file, plus a hook in `AI/claude/hooks/` that names the affected test files when the code they guard is edited, so the connection survives without anyone remembering it.
- Out of scope: the repairs themselves. `initial-repairs` is a separate proposal; this change asserts current behavior so that change has something to break against.

## Capabilities

### New Capabilities

- `content-verification`: What a verification run asserts about SafeLearn's own rendered output — that the `md/` corpus is the source of the checks, what each area of behavior must prove, how a check stays honest on shared accounts, and how a change to guarded code is connected to the checks that cover it.

### Modified Capabilities

- `browser-verification`: The harness gains obligations it does not have today — handing a caller the session's effective role set, putting the account's preferences into a known state before a check reads them, and fetching a rendered page addressed by path and view. Its existing requirements are unchanged.

## Impact

**Files**
- `test/` — five new `*.test.js` files; `test/harness.js` gains exported helpers. `test/smoke.test.js` is unchanged.
- `docs-testing.md` — a coverage map and a section on writing content checks against shared accounts.
- `AI/claude/hooks/` — a new hook plus its registration in `AI/claude/settings.json`.
- `md/` — the corpus is read, not rewritten. Any file it turns out a check needs (a fixture that does not exist yet) is added, never edited in a way that changes what the manual pass shows.

**Application code**
- None. `app.js`, `obsidian.js`, `obsidian-page.js`, `utils.js` and the middlewares are not touched. A check that cannot be written without changing the application is recorded as a finding, not implemented by changing the application.

**Dependencies**
- None. `puppeteer` and `node:test` are already in place; no test framework is added.

**External systems**
- Unchanged from `install-puppeteer`: a run needs `auth.unterrainer.info` and the demo accounts. Nothing new is contacted — PlantUML, the remote image host and the CDN are asserted as URLs, never fetched.

**Runtime**
- The suite grows from one file to six, each opening one or two browser sessions. `node --test --test-concurrency=1` keeps them serial, because they share the one port the OIDC redirect URI names.

**Assumptions recorded**
- The demo accounts' class memberships (`4bhif`, `5bhif`, `4ahif`, …) are not documented and not ours to rely on. Checks therefore derive the expectation from the role set the session actually carries, instead of hardcoding which class the demo student is in.
- Preferences live in a shared Keycloak attribute. A check writes every preference it depends on and asserts only against what it just wrote; it never restores a previous value, because two runs against the same account have no way to take turns.
