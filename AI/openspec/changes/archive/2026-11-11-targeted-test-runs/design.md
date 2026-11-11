## Context

- `npm test` is `node --test --test-concurrency=1 "test/*.test.js"`. Every file runs in its own process, one after another.
- Four files use the server harness `test/harness.js`: `smoke`, `content`, `exam` and `anonymous`. They start the application and Puppeteer, and three of them log in against the Keycloak demo realm. Every other `test/*.test.js` imports application modules directly (`obsidian.js`, `exam/*.js`, `i18n/*.js`, …). A few of them start an in-process `express` app on port 0, or read the plugin checkout through `test/obsidian/harness.js` (`pluginFunction`/`pluginModule`, no Obsidian). None of these open a browser or log in.
- The 16 content modules under `test/checks/` are imported statically by `test/content.test.js` in a fixed order. `deployment-surface.js` is last on purpose. Shared sessions are opened lazily: `sharedSession(role)` logs in the first time a role is asked for. The closing assertion expects exactly `knownRoles.length + ownSessions.length` logins (`ownSessions = ["session-lifecycle.js"]`).
- `test/coverage-map.json` maps each check key (a `test/*.test.js` or a `test/checks/*.js`) to the files it `guards` and the `corpus` files it reads. The key `test/content.test.js` guards `test/harness.js` and every module file. `test/coverage.test.js` requires every `test/*.test.js` and `test/checks/*.js` to appear in the map, which is why the runner must not live in `test/`.
- `AI/claude/hooks/name-covering-checks.mjs` already reads the map and names the checks after an edit, with `runCommand = "npm test"`.

## Goals / Non-Goals

**Goals:**
- One tool, `tools/test-run.mjs`, behind the three new scripts, with its decisions (classification, planning) as pure, exported functions that a unit test can check.
- A selected content run keeps the login assertion's meaning instead of switching it off.

**Non-Goals:**
- Function-level coverage. The map stays per file. A change to `obsidian.js`, `app.js` or `test/harness.js` will select almost everything, and that is accepted.
- Parallelisation and any change to session isolation.
- The Obsidian run (`test/obsidian/*.test.js`, `npm run test:obsidian`). It is not in the map, and plugin changes happen in another repository (`AI/plugin` is a gitignored symlink, so `git diff` never sees them).

## Decisions

### Classification by import, not by list or folder
A test file belongs to the browser group if its source imports `./harness.js` (a static `from "./harness.js"`). Otherwise it is a unit file. The tool computes this when it runs.
- *Alternative: a hand-kept list in `package.json` or the map.* It would drift, and a forgotten new file would silently fall out of both groups. That is the failure the spec forbids.
- *Alternative: move unit tests to `test/unit/`.* It would rename paths throughout the map, the docs and the archived changes, and the `npm test` glob would have to change.
- The partition is asserted by `test/test-run.test.js`: unit ∪ browser equals the files `test/*.test.js` matches, and the two are disjoint. Importing the harness under another specifier (for example `"../test/harness.js"`) would misclassify a file, so the check also fails when a unit file starts Puppeteer. It does this by looking for a `puppeteer` import in the file. That is cheap, and it is enough for this repository.

### Content-module selection through an environment variable and dynamic import
`SAFELEARN_TEST_CHECKS` holds a comma-separated list of module basenames (`rendering,views`). `content.test.js` keeps its ordered list of modules as data. With the variable unset, it imports all of them, as today. When it is set, it imports only the named ones (`await import(...)` at top level), still in list order, so `deployment-surface.js` stays last. An unknown name fails the run immediately and names the known modules.
- *Alternative: `node --test --test-name-pattern` on the `describe` names.* All modules would still be imported, the selection would hang on `describe` strings that nobody treats as an interface, and the pattern would also filter out `content.test.js`'s own login assertion. The run would then prove less than it claims.

### The login assertion counts what the selection used
`test/harness.js` additionally exports `sharedRoles()`, the roles a shared session was actually opened for. The assertion becomes:
- **full run:** unchanged, `loginCount() === knownRoles.length + ownSessions.length`. The full run must still use every role.
- **selection:** `loginCount() === sharedRoles().length + ownSessions.filter(selected).length`, and `sharedRoles().length <= knownRoles.length`. A selected module that opens extra sessions still fails.

The output line with duration and login count stays and also names the selection.

### Planning rules
Input is a list of changed paths, relative to the repository and with forward slashes. For each check key `K` in the map, a path `P` selects `K` if `P === K`, `P ∈ K.guards` or `P ∈ K.corpus`. Then:
1. A selected key `test/checks/<m>.js` selects content module `<m>`.
2. The key `test/content.test.js` selects the **whole** content suite only if it was selected by a path that is not a `test/checks/*.js` module. A module file selects itself only (rule 1), even though it appears in `content.test.js`'s guards.
3. Any other selected key is a test file to run.
4. If content modules are selected and the whole suite is not, `test/content.test.js` is added with `SAFELEARN_TEST_CHECKS` set. If the whole suite is selected, the variable stays unset.
5. Paths that selected nothing are reported as unguarded.

The plan is `{ files, modules | "all", unguarded, reasons }`. `--dry-run` prints it. Otherwise the tool spawns `node --test --test-concurrency=1 <files…>`, with the environment inherited plus the variable, and exits with the child's exit code. An empty plan prints that nothing is guarded and exits 0.

### Change detection
- Explicit paths after `--` win.
- Otherwise: `git diff --name-only HEAD` (staged and unstaged, deletions included) plus `git ls-files --others --exclude-standard`.
- If that is empty: `git diff --name-only HEAD~1 HEAD`, the last commit. That fits the convention of committing and then running the full suite before the push. The tool prints which source it used.

### Group runs
`test:unit` and `test:browser` call the same tool (`--group unit|browser`). It computes the classification and spawns `node --test --test-concurrency=1` on the resulting file list. No glob in `package.json` has to stay in sync with the classification.

### Hook text
`runCommand` becomes `npm run test:changed`. The warning against starting it unasked stays, worded as "may take minutes and may authenticate against the shared realm", because a targeted run of unit checks does neither.

## Risks / Trade-offs

- [The map misses a dependency, so a targeted run passes while the full run would fail] → The full run before the push stays the convention (memory `test-runs-targeted-first`, `docs-testing.md`). The targeted run speeds up the work but does not replace that run.
- [Content modules turn out to depend on each other's preference state when run alone] → The spec already requires every check to write the preferences it reads before reading. A dependency like that is a defect in the check, and a selected run is exactly what reveals it. It gets fixed in the module, not hidden in the runner.
- [Changes to `obsidian.js`/`app.js`/`test/harness.js` run nearly everything] → Accepted (non-goal). The tool still prints the plan, so this is visible.
- [Classification by text search misreads a file] → The partition check in `test/test-run.test.js` and the Puppeteer cross-check catch the realistic cases.
- [A run on `HEAD~1` in a fresh clone with a single commit] → If `HEAD~1` does not exist, the tool reports that there is nothing to compare against and exits 0 without running anything.
