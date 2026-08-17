## Context

See proposal.md — Why. What shapes this design is what was found on this machine and in this repository, rather than what a harness for an Electron application looks like in general.

**What is already in place.** Obsidian is installed as an AppImage at `/home/psilo/scripts/obsidian/Obsidian-1.11.4.appimage`, launched by `~/scripts/obsidian/start.sh`, which resolves `Obsidian-*.appimage`, sorts by version and executes the highest. AppArmor is disabled at boot and the profile that exists for Obsidian is `flags=(unconfined)`, so nothing there constrains a debugging port. The session is Wayland with XWayland on `:0`; there is no Xvfb and installing one needs root. Puppeteer is already a dependency of this repository (`^25.7.0`) on Node 24.

**The repository is a vault.** `/mnt/data/source/HTL/safeLearn` is registered in `~/.config/obsidian/obsidian.json` as one of fifteen vaults, and `.obsidian/plugins/safelearn-formatter` in it is already a symlink to the plugin checkout. So the plugin is developed live against this repository. That is convenient for a person and disqualifying for a run: a verification pass that opens that vault writes `workspace.json` and hands back a different pane layout than the one that was left.

**The corpus is a complete fixture set.** Checked rather than assumed: `md/` holds a file-level directive on line 1 both plain (`test-fileperms-teachers.md`) and with a closed window (`test-fileperms-window-closed.md`), the `from`, `to` and `from to` window forms together on one line (`test-md-file.md:26`), the three view pseudo-roles (`test-exam-practice-question.md`), and fragments and side-by-side blocks. Nothing has to be written to have every tag form under test.

**Two globs decide where files may go.** `npm test` runs `node --test "test/*.test.js"`, and `test/coverage.test.js` builds its expectation from `readdirSync` over `test/` filtered to `*.test.js` plus every `*.js` under `test/checks/`. A file placed in either location is picked up by both, whether that was intended or not.

## Goals / Non-Goals

**Goals:**

- A person can run one command and watch the plugin behave, or read afterwards what it did.
- The defects listed in `plugin-fix-editor-decorations` can each be expressed as a failing check before they are repaired, and as a passing one after.
- The run costs nothing that the server suite costs: no login, no server, no network.
- A run on another installation needs a path, not an edit.

**Non-Goals:**

- Repairing anything. This change builds the instrument; `plugin-fix-editor-decorations` is the first thing measured with it.
- Verifying the plugin against Obsidian versions other than the one installed. The version drives the run and is recorded; a matrix is a different problem.
- Running in CI. There is no CI for the plugin today, and designing for an environment nobody has produces a headless path that is never exercised.
- Asserting on Obsidian's own DOM structure beyond what is needed. See Risks.

## Decisions

### Decision 1: A second run under `test/obsidian/`, not a second suite in `test/`

The Obsidian checks get their own npm script and their own directory. Both halves matter and for different reasons.

*Its own script*, because the existing run authenticates twice against a Keycloak realm shared with other people and takes about 95 seconds. Plugin work is iterative — decorate, look, adjust — and paying two logins per iteration against somebody else's identity provider is both slow and rude. The Obsidian run needs no server and no network at all.

*Its own directory*, because `test/` and `test/checks/` are not free locations. `npm test` would collect a `test/obsidian.test.js` into the Keycloak run, and `coverage.test.js` would fail the whole suite on it until it was recorded. `test/obsidian/` is outside both `readdirSync` calls, so the two runs stay independent by construction rather than by remembering to keep them apart.

Alternative considered and rejected: putting the harness in the plugin repository, next to the code it tests. It would need Puppeteer and a runner set up from nothing there, and the fixtures it depends on — the corpus — live here. The plugin repository stays a plugin; this repository keeps the verification, as it already does for everything else.

### Decision 2: Attach to Obsidian over CDP rather than launch a browser

Obsidian is Electron, so it speaks the Chrome DevTools Protocol when started with a remote debugging port. Puppeteer connects to that endpoint instead of starting a browser of its own. The plugin runs in the real renderer, with the real Obsidian API, real CodeMirror and Obsidian's own Live Preview — which is exactly the part a substitute cannot reproduce, and where the interesting defects are.

The application is located the way `start.sh` locates it: resolve the AppImage glob, sort by version, take the highest. The harness resolves it the same way rather than hardcoding `1.11.4`, and records which version it drove, so a failure caused by an Obsidian update is visible as one. The port binds to loopback only.

### Decision 3: The vault is assembled per run under `test/.runtime/`

`test/.runtime/` is already the ignored directory the existing harness writes browser profiles and failure screenshots into, so the vault joins artifacts of the same kind in the same place.

The corpus enters the vault as files the run puts there rather than as a link to `md/`, so a check that types into a document cannot modify the repository's own corpus — the corpus is what `npm test` asserts against, and a plugin run must not be able to break the server run. The plugin enters as a link to its build output, because that is the thing under test and it changes between runs.

Obsidian asks about community plugins the first time it opens an unknown vault. The assembled vault carries the `.obsidian` state that answers those questions in advance — the plugin listed as enabled, and whatever else a first open would otherwise stop on — so a run does not hang on a dialog nobody is there to click.

### Decision 4: The Obsidian checks stay out of the coverage record

`test/coverage-map.json` exists to connect a change to a guarded file with the checks that cover it: a hook reads it and names them when such a file is edited, and `coverage.test.js` fails when a named path does not exist. The files the Obsidian checks guard are `main.ts` and `styles.css` in another repository, reachable only through `AI/plugin`, which is ignored and absent on an installation that has not set it up.

Recording them would make `npm test` fail on a checkout without the plugin — the existence assertion is unconditional. Extending that assertion to tolerate absent paths would take the record's one guarantee away from it. So the record keeps describing the server suite, `docs-testing.md` says that it does and why, and the connection between a plugin file and its checks is made in the plugin's own documentation instead.

This is a real gap and it is named rather than papered over: editing `main.ts` will not tell anyone which checks cover it. When the plugin repository has a record of its own, that is where this belongs.

### Decision 5: A visible window, and the run says so

There is no Xvfb and installing one is a root operation on the user's machine, which a verification harness has no business requiring. The run opens Obsidian on `:0` and closes it afterwards. While building a UI harness this is closer to an advantage than a cost — the thing being built is the ability to see. It is documented, because a command that unexpectedly opens a window is worse than one that says it will.

If Xvfb is installed later, the display becomes another configuration value and nothing else changes.

### Decision 6: Assertions target the plugin's own markers, not Obsidian's structure

What a check reads is the text as shown and the classes the plugin itself applies — `fragment-highlight`, `permission-block`, `side-by-side-start`, `side-by-side-separator`, `side-by-side-end`, `safelearn-hidden`. Those names are the plugin's, so they are stable by our own decision rather than by Obsidian's.

Where a check must address Obsidian's own structure — finding the editor, switching view state — it goes through as few anchors as possible, in one place in the harness, so an Obsidian update breaks one file rather than every check.

## Risks / Trade-offs

- **Obsidian's internals are not a public API.** An update can rename a class or restructure the editor DOM and break the harness without the plugin changing. Decision 6 concentrates the exposure; it does not remove it. The recorded version makes the cause identifiable when it happens.
- **The AppImage is resolved by version sort**, so dropping a newer AppImage into that directory silently changes what is tested. That is the same behavior `start.sh` has, so the harness at least drives what the person drives. The recorded version is how a surprise becomes visible.
- **A visible window can take focus** while a run is in progress. Accepted (Decision 5).
- **Typing through CDP is not typing.** `Input.insertText` and dispatched key events reach CodeMirror differently than a keyboard does, and a decoration bug that only appears under real input could pass. Where a check exercises editing, it should use the lowest-level input the protocol offers rather than setting document state directly, and a defect that cannot be reproduced through it is worth recording as such rather than declaring absent.
- **The first run on a fresh vault is the fragile one** — dialogs, plugin trust, layout. Decision 3 answers what can be answered in advance, but this is the part most likely to need a second pass once it is actually run.
