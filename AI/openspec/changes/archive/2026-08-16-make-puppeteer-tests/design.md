## Context

See `proposal.md` — Why. What shapes the approach here is what the codebase already fixes in place:

- **The harness exists and is deliberately framework-free.** `test/harness.js` exports plain async functions; `test/smoke.test.js` runs them on `node:test`. Everything below extends that boundary rather than replacing it.
- **Preferences are server-side and shared.** The application reads them from `accessTokenDecoded.config` — a Keycloak user attribute on a public demo account. `POST /userattributes` serializes the *whole request body* into that one attribute, so a partial write erases everything it omits. The known keys are `fs`, `t`, `nt`, `s`, `dm`, `sl`, `vt`, `va`, `ve`.
- **Roles are already resolved for us.** `GET /userattributes` returns `req.user` after a forced token refresh: `accessTokenDecoded.resource_access[<resource>].roles` (client roles), `rolesCalculated` (the LDAP OUs, already lowercased and already mapped `teachers`→`teacher`, `students`→`student`), and `name`. It also returns the access and refresh tokens, which is precisely why nothing may be carried out of the page wholesale.
- **`node --test` isolates by file.** Each `*.test.js` runs in its own process, so module state — and therefore any logged-in session — dies with the file. Filing checks by concern would otherwise multiply real logins against a public identity provider.
- **The page hides itself until it is ready.** SafeLearn renders `<body style="display:none">` and reveals it from `init()`. `innerText` comes back empty; `textContent` does not.
- **The presentation view is currently broken in two ways that are not ours to fix.** `wrapInReveal` loads Reveal 3.7.0, its themes and `headjs` from jsDelivr, and links `/obsidian-page.css`, which does not exist. Both are `initial-repairs` work. The deck's `<section>` structure is server-rendered into `#revealContent`, so it can be asserted without the CDN answering.

## Goals / Non-Goals

**Goals:**

- Every behavior the manual pre-commit pass looks for is asserted by something that runs unattended.
- A failure names the corpus file, the role and the behavior, so the reader knows what broke without opening a browser.
- The number of real logins follows from the roles the checks need, not from how many files the checks live in.
- The suite is green on the code as it stands today, so a red run means a regression and nothing else.

**Non-Goals:**

- Unit tests. There is still no seam below the HTTP surface, and creating one is an application change this proposal excludes.
- Visual or pixel comparison. Structure and text, not screenshots.
- Verifying that PlantUML, jsDelivr or the remote image host actually answer.
- Fixing anything the checks discover. Findings are recorded; `initial-repairs` repairs.

## Decisions

### The content suite runs in one process; the checks stay in separate files

`node --test` gives every `*.test.js` its own process, so five files by concern would mean five servers and ten logins. Filing is a readability decision and must not cost round-trips against a shared public Keycloak.

The five concerns therefore live in `test/checks/*.js` — modules, not test files — each registering its own `describe(...)` block at import time. A single `test/content.test.js` imports all five. `node --test "test/*.test.js"` picks up that one file plus the existing `test/smoke.test.js`, so one process runs the whole content suite.

Alternatives considered: `--experimental-test-isolation=none` (Node 22.8+; `.nvmrc` says 20, so it is not available everywhere this runs), and one large file (loses the by-concern split the manual pass is organized around).

### Sessions are shared by role, and `openSession` keeps its current meaning

The content checks need one `student` and one `teacher`, both reusable. `test/smoke.test.js` needs the opposite — genuinely independent sessions, opened in both orders, to prove they do not leak into each other.

So `openSession(role)` is left exactly as it is: a fresh login, owned and closed by the caller. A new `sharedSession(role)` returns a per-role singleton, created on first use and released by `shutdown()`. `smoke.test.js` is untouched. Two logins cover the whole content suite.

### Preferences are written as a full block and confirmed before anything is asserted

`setPreferences(session, values)` reads the current block from `GET /userattributes`, merges the requested keys over a documented baseline, `POST`s the complete object, reloads, and reads it back. A mismatch throws, naming the key, the value asked for and the value in effect — the alternative is a check that quietly asserts against a page rendered with someone else's settings.

The baseline is explicit rather than inherited: `{fs:18, t:2, nt:1, s:1.6, dm:0, sl:0, vt:1, va:0, ve:0}`. `sl:0` keeps `/` from resolving to the shared account's `lastVisitedUrl`; `vt:1` means a teacher session actually sees the teacher view, since `vt == 0` is what triggers the downgrade.

Nothing is restored afterwards. Two runs against the same account cannot take turns, so a restore would be a race with no upside — the contract is that every check writes what it depends on.

### Roles are derived in the harness from what the application already resolved

`roles(session)` reads `GET /userattributes` inside the page and returns a normalized `Set`: the client roles under `resource_access[<resource>]`, the LDAP groups from `rolesCalculated` (the application already normalized those), and the lowercased `name`. `<resource>` comes from `keycloak.json` in the working directory, the same file `utils.js` reads, falling back to the token's `azp` when that file is absent. Only the role set and the identity cross back out; the tokens in that response stay in the page.

This duplicates a little of `utils.js`. Importing `hasSomeRoles` instead would drag `getUserAttributes` and a live Keycloak call into the test process for a value already present in the response. The duplication is bounded to normalization, and it is cross-checked: one check asserts that the derived set agrees with observed behavior — `teacher` in the set exactly when the teacher-only block on `md/test-perms.md` is visible. A drift between harness and application fails that check.

This is what lets a permission check say "content addressed to a role I hold" instead of assuming the demo student is in `5bhif`.

### Rendering is asserted structurally, not by matching prose

`render(session, path, {view})` navigates to `path`, adding `?reveal=true` or `?document=true`, waits for the view's root (`#markdown-content`, or `#revealContent` for a deck), fails if the application redirected to the start page instead, and hands back the page plus its `textContent`.

Checks then query elements — `page.$$(".callout")`, the fragment indices, the column count, `#revealContent > section` and its nested `section`s — and use text only where the text *is* the assertion, as in a permission block. Prose in the corpus is documentation and will be reworded; a check that breaks on rewording trains people to ignore it.

### Permission checks assert both directions on the same content

Each permission case reads the same corpus file as two roles and asserts presence for one and absence for the other. A directive that accidentally grants everyone passes a one-sided check, which is the failure mode most worth catching here.

Absence is asserted against the whole rendered text, not against a selector: `removeForbiddenContent` strips the block before Markdown conversion, so a leak would show up as text, wherever it landed.

### External renderers are asserted as the address that was emitted

PlantUML: the emitted `src` is decoded — base64-variant, then inflate — and compared against the source in the corpus file, which proves the encoder, not the server. Mermaid: `<pre class="mermaid">` carries the source, and the module script importing it is present. Remote image: the `src` is what the corpus names. Nothing external is fetched, and requests to any host other than the application and the identity provider are blocked at the page level so a check cannot start depending on one by accident.

### Same-origin references are followed; a named exception list keeps the suite honest

For the presentation and page views, every same-origin `href`/`src` is requested with the session's cookies and must come back as its declared type. `/obsidian-page.css` fails that today — it is a real defect, owned by `initial-repairs`.

Rather than leave the suite red or leave the check unwritten, the check carries a list of known-dangling references, each with the reason and the change that owns it. A listed entry is reported and does not fail the run; an unlisted one fails; **and an entry that no longer dangles fails too**, so the list cannot outlive the repair — `initial-repairs` will have to delete the line to get green.

### The coverage map is one machine-readable file, and a check enforces it

`test/coverage-map.json` maps each check file to the source files and corpus files it guards. It is the single source: `docs-testing.md` explains it and points at it instead of restating it in a table that would drift.

`test/coverage.test.js` — no browser, no login — asserts that every path named in the map exists, that every `test/*.test.js` appears in it, and that no entry names a file that is gone. That is what makes "a record naming a check file that no longer exists is treated as a defect" an actual failure instead of a good intention.

### The hook names checks; it never runs them

A `PostToolUse` hook in `AI/claude/hooks/` matches `Edit`/`Write` on the guarded paths, looks the file up in the map and prints the checks that cover it. It does not run `npm test`: a run takes minutes and authenticates against a shared public realm, which is not something to trigger as a side effect of an edit. Same shape as the existing `list-open-proposals.sh` — read something, print it, let the session decide.

## Risks / Trade-offs

- **The suite's honesty depends on the demo realm.** Every run authenticates against `auth.unterrainer.info`. If it is down, nothing can be verified. → Unchanged from `install-puppeteer` and accepted there; the failure is loud and names the identity provider.
- **A shared account can be changed underneath a run.** Another user flipping a preference mid-run can turn a check red. → Every check writes what it depends on immediately before reading, and confirms the write landed, which narrows the window to a few hundred milliseconds. It does not close it.
- **Role derivation duplicates normalization from `utils.js`.** → Bounded to lowercasing, trimming and the two OU renames, and cross-checked against observed behavior by a dedicated check.
- **Structural selectors couple checks to markup.** A class rename in `obsidian.js` breaks checks without breaking behavior. → Accepted: that coupling is what makes the check specific enough to be worth having, and the coverage map makes the connection findable.
- **Time-window checks need dates that stay in the future.** The corpus already uses 2099, which outlives this repository. Windows that are meant to be *closed* use dates in the past. → No check computes a date from the current clock; both bounds are fixed in the corpus.
- **Six check files, two logins, one server — but still minutes per run.** → It replaces a manual pass that takes longer and gets skipped. The run's duration is reported so a regression in cost is visible.
- **The exception list is a lever that could be abused.** Anything can be silenced by adding a line. → Entries carry a reason and an owning change, the "no longer dangling" rule forces removal, and the list is short enough to be read in a review.

## Migration Plan

Not applicable. Nothing ships to a server and no application code changes; `npm test` gains checks. Rollback is deleting the new files and the hook registration.

## Open Questions

- Which class roles the demo accounts actually carry is unknown and stays unknown — the design derives expectations from the session instead. If it turns out neither demo account holds any class role, the two `md/test-fileperms-*.md` files can only be proven from the *denied* side. That is still a real assertion, and it is recorded as a finding rather than fixed by inventing an account.
