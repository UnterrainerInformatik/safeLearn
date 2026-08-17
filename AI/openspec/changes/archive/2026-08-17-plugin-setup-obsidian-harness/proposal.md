Source proposal: `AI/proposals/plugin-setup-obsidian-harness.md`

## Why

The companion repository `safeLearn-Obsidian-plugin` (reachable at `AI/plugin`) gives this project's tags a representation while a teacher writes. Its editor half is known to be broken: decorations shift while typing, and reading `main.ts` located at least five causes for it — a decoration range built from the wrong token length, a sort that does not satisfy `RangeSetBuilder`, a rebuild that ignores viewport and cursor, a `/g` regex used with `.test()`, and a view-mode check against a CSS class Obsidian does not set.

None of that can be judged from here, because nobody can see it. The plugin's behavior exists only inside a running Obsidian: a CodeMirror `ViewPlugin` decorating live text, and a Markdown post-processor rewriting rendered output. This repository's harness knows a browser and a server, and the plugin repository has no test setup at all — its `npm test` is the scaffold's `echo "Error: no test specified" && exit 1`.

A bug that only appears while typing cannot be fixed by reasoning about the source and declared repaired. It has to be watched. That is what this change builds, and it is why it comes before every other plugin proposal.

## What Changes

- **A second verification run, `npm run test:obsidian`**, separate from `npm test`. The existing run brings up the server and authenticates twice against a Keycloak realm shared with other people; it takes about 95 seconds and every plugin edit would pay for it. The Obsidian run needs no server, no login and no network.
- **The checks live under `test/obsidian/`, not in `test/`.** `npm test` globs `test/*.test.js`, so a file placed beside the existing suites would join the Keycloak run whether it belongs there or not. `test/coverage.test.js` reads the same two directories and would fail on an unrecorded file.
- **The plugin is built before a run.** `main.js` is the rollup output and is not checked in — the last commit in the plugin repository is `Remove main.js`. A run that tests a stale build tests nothing.
- **A disposable vault is assembled per run**, under the already-ignored `test/.runtime/`: the corpus files this repository ships, plus `.obsidian/plugins/safelearn-formatter` pointing at the build. This repository is itself a registered Obsidian vault with the plugin already linked into it, and a verification run must not write to the workspace state a person is using.
- **The corpus in `md/` is the fixture set.** It already carries every tag form the plugin has to handle: a file-level directive on line 1 both plain and with a time window, all the window forms, the three view pseudo-roles, fragments and side-by-side blocks. The source proposal assumed new fixtures had to be written; they do not.
- **Obsidian is driven over CDP.** The AppImage is started with a remote-debugging port and Puppeteer attaches to it, rather than launching a browser of its own. Puppeteer is already a dependency here.
- **All three view states are reachable** — Live Preview, Source Mode, Reading View — because the plugin behaves differently in each and the known defects are not all in the same one.
- **A run leaves a screenshot behind**, so what the harness saw can be looked at rather than inferred from an assertion message.
- **A visible window is accepted.** There is no Xvfb on this machine and installing one needs root; the session is Wayland with XWayland on `:0`, which Obsidian already uses. The run opens a window and closes it again.
- **Machine-specific paths are configurable**, in the form the existing harness already uses (`SAFELEARN_TEST_*` environment variables with defaults). The Obsidian AppImage lives at a path that is this machine's, and the plugin checkout is reached through a symlink that is set per installation.

Not in this change: repairing any of the defects listed above, and teaching the plugin any tag it does not know. Those are `plugin-fix-editor-decorations` and `plugin-edit-tag-support`, and both need this one first.

## Capabilities

### New Capabilities

- `plugin-verification`: how the companion Obsidian plugin is made observable and verified — that a run drives a real Obsidian against a disposable vault built from this repository's corpus, that it can reach each of the three view states and report what the plugin did to the document, and that it stays separate from the run which authenticates against the shared realm.

### Modified Capabilities

None. `browser-verification` and `content-verification` describe the run against the server and its rendered output; neither makes a claim this change contradicts.

## Impact

- `package.json` — one new script. The existing `test` and `test:headed` scripts are untouched.
- `test/obsidian/` — new: the harness, the vault assembly, and the checks.
- `test/.runtime/` — gains the assembled vault and the screenshots. Already ignored.
- `test/coverage-map.json` and `test/coverage.test.js` — whether the Obsidian checks enter the coverage record, and what a record entry means for a file in another repository, is a question this change has to answer rather than leave.
- `docs-testing.md` — the second run has to be documented where the first one is.
- The plugin repository — its build is invoked. No source file over there changes in this change.
- No dependency is added: Puppeteer is already declared here.
