# Testing
Here you can find information about verifying this project in a real browser.

[Back](README.md) to the main page.

## What the harness does
`npm test` is not a unit-test run. It starts SafeLearn from your working tree, opens a real browser, walks the complete Keycloak login for a role, and checks that what it renders is what the `md/` corpus demonstrates.

> **`npm test` authenticates against a live, external Keycloak.**
> Every run performs a real OIDC round-trip against `https://auth.unterrainer.info`. Without network access to that server the run fails, and there is no offline or mocked mode. That is deliberate: the login is the part most likely to break, so mocking it would verify nothing.

One run does the following:

* **Starts the application.** If nothing answers on the configured port, the harness spawns `node app.js` (not `npm start` — nodemon would restart the server mid-run) and waits until it answers requests. It stops that server again when the run ends, however the run ended.
* **Adopts a server you already started.** If the port is already serving SafeLearn, the harness uses that instance and leaves it running afterwards. So having `npm start` open in another terminal is fine; `npm test` is the same single command either way.
* **Logs in per role.** Every role gets its own incognito browser context, so a `student` and a `teacher` session in the same run share no cookies and the order they are opened in makes no difference.
* **Fails positively.** The OIDC flow fails by redirecting, not by throwing, so the harness asserts that it *arrived* somewhere authenticated. A failure names the role and the URL the flow stopped at, and leaves a screenshot in `test/.runtime/`.
* **Reads the corpus.** The content suite then walks the demonstration files under `md/` as both roles and asserts what they show — the `@@@` directives, the exam/practice/answer views, every render feature, the link and folder edge cases, and the presentation and document views.
* **Talks to nobody else.** Pages opened for content checks may reach the application and the identity provider, and nothing more. PlantUML, the remote image host and the CDN the presentation loads Reveal from are refused, and asserted as the addresses the application emitted instead. A run passes whether or not those hosts are reachable.

## What a run covers

| FILE | WHAT IT CHECKS |
| --- | --- |
| `test/smoke.test.js` | The harness itself: both roles reach authenticated content, two sessions in one run stay independent in either order, and the two really are different users. |
| `test/content.test.js` | The content suite. It imports the modules below so all of them run in one process — see [Why the checks are modules](#why-the-checks-are-modules). It also asserts that a run logs in exactly once per role. |
| `test/checks/permissions.js` | Block-level and whole-file `@@@` directives in both directions, including the `admin` directive and both plural aliases (`teachers`, `students`), their effect on the navigation tree, time-bounded windows, and the teacher-to-student downgrade. |
| `test/checks/views.js` | The `#exam`, `#practice` and `#answer` pseudo-roles, driven through the `ve` and `va` preferences. |
| `test/checks/rendering.js` | Every callout type and the collapsible forms, highlighted code, fragment indices and their reset at headings, the two- and three-column layouts, the four image forms, and the emitted PlantUML and Mermaid markup. |
| `test/checks/navigation.js` | Wiki-link resolution including the duplicated basename — with a digit in the name and without one — and the name with spaces, the folder-name edge cases, the table of contents and the navigation tree. |
| `test/checks/presentation.js` | The deck built from the source's heading structure, fragments in a deck, the deck's own references, the document view, and the documented shortcut into it with the shift key held and without. |
| `test/checks/deployment-surface.js` | What a running instance publishes over HTTP: that `keycloak.json`, the application's own sources and the dependency manifests are not served and that a refusal looks like a path with no file behind it, that the assets a page addresses still answer, that every same-origin reference of a rendered page resolves in all three views, and that `/hot-reload` — the one endpoint that answers before authentication — survives a parameter it cannot interpret. |
| `test/directive-grammar.test.js` | What a permission directive means, entry by entry: a table of edge-case directive lines read by `parseFirstLineForPermissions`, and the companion plugin's own reading of the same lines held against it. No browser, no login, no server — but it does need the plugin checkout, for the reason below. |
| `test/coverage.test.js` | The coverage record. No browser, no login. |

`test/directive-grammar.test.js` is the one check in this run that reaches outside the repository. The plugin has to reach the same conclusion about a directive as the server does — that is the whole of what it is for — and its mirror of `parsePermissionEntry`, `parsePermissionWindow` and `parseLocalDateTime` is checked against those functions rather than against a reading of them. It transpiles the plugin's `main.ts` and runs its grammar over the same table. So `npm test` needs the plugin checkout the same way `npm run test:obsidian` does: the symlink `AI/plugin`, or `SAFELEARN_TEST_PLUGIN_DIR`. It does not need Obsidian, and it builds nothing.

## Running it
```bash
npm install
npm test
```
`npm install` also downloads a Chromium build (~150 MB) into your npm cache. Puppeteer is a `devDependency`, so `npm install --omit=dev` in the `Dockerfile` keeps it out of the production image.

Each check reports on its own, and the process exits non-zero if any of them failed.

### Watching it run
```bash
npm run test:headed
```
Identical checks, visible browser window. The switch is the environment variable `SAFELEARN_TEST_HEADED=1`; the script sets it through `test/headed.env` so it works the same way on every platform.

### The second run: the Obsidian plugin
```bash
npm run test:obsidian
```
A separate run for the companion Obsidian plugin, which gives this project's tags a representation while a teacher writes them. It starts no server, authenticates against nothing, and touches none of the accounts below. It does open a real Obsidian window — there is no headless mode for an Electron application without a virtual display, and requiring one to run a check would be worse than a window that appears for ten seconds.

It needs two things that the other run does not: Obsidian installed, and the plugin checkout reachable. On this repository that checkout is the symlink `AI/plugin`, which is ignored and set per installation. Both locations are environment variables with defaults, and a run that cannot find one says which:

| Variable | Default | What it is |
| --- | --- | --- |
| `SAFELEARN_OBSIDIAN_APP` | the installed application of this platform | The application itself, which is what an installed `.exe` or `.app` is: `%LOCALAPPDATA%\Programs\obsidian\Obsidian.exe` on Windows, `/Applications/Obsidian.app/Contents/MacOS/Obsidian` on macOS, and nothing on Linux, where the installation is a directory of AppImages instead. It is consulted first, so neither platform has to pretend to be the other. |
| `SAFELEARN_TEST_OBSIDIAN_DIR` | `~/scripts/obsidian` | The directory holding the Obsidian AppImage, used when the setting above names nothing that exists. The highest version in it is the one that runs, which is how the user's own launcher picks it. |
| `SAFELEARN_TEST_PLUGIN_DIR` | `AI/plugin` | The plugin checkout. Its `npm run build` is invoked before every run — `main.js` is not committed, and a run against a stale build tests nothing. |
| `SAFELEARN_TEST_OBSIDIAN_PORT` | `19222` | The debugging port, bound to loopback. |
| `SAFELEARN_TEST_OBSIDIAN_KEEP_OPEN` | unset | Leaves the window standing after the run, to look at what a failure left behind. |

The run assembles its own vault under `test/.runtime/obsidian/vault/` from the corpus in `md/` — as copies, so a check that types cannot edit what `npm test` asserts against — and points Obsidian at it through an application-data directory of its own. That isolation is the point: this repository is itself a registered Obsidian vault with the plugin linked into it, and a run must not hand back a different pane layout than the one you left. Neither `~/.config/obsidian/` nor this repository's `.obsidian/` is written.

Two things about that vault are worth knowing. Its application-data directory is *not* rebuilt per run, because a fresh one makes Obsidian download its current release before it will start. And restricted mode cannot be switched off by writing a file: `community-plugins.json` lists what would be enabled and Obsidian still loads none of it, so the harness turns it off through the application after the workspace is up.

#### What a check can ask of the editor

Beyond opening a document and reading what the plugin marked, the harness offers four things that exist for a specific reason. Each is there because a check written without it would pass for the wrong reason.

**Errors the editor raised** — `raised()`, `forgetRaised()`. Some defects surface as a throw rather than as something wrong on screen, and the visible effect is that nothing is marked at all: a decoration set whose ranges are out of order is rejected whole, so the document carries no markings, which reads exactly like a document with nothing to mark. Both channels are watched, because they are not interchangeable — an uncaught throw arrives as a page error, and a throw Obsidian caught arrives on the console, which is where that one turns up. `raised()` throws rather than returning `[]` when nothing is collecting, so that a check asserting *no* error can establish it instead of inferring it from silence. Call `forgetRaised()` before the actions you mean to ask about; Obsidian logs its own errors while starting up.

**Actions that change no text** — `moveCursorInto(needle)`, `scrollTo(needle)`, and `placeCursorAfter(needle)`. Marking has to respond to a cursor move and to a scroll, and typing cannot stand in for either: it also changes the document, so a check built on it is satisfied by an implementation that only reacts to text. Each returns `{ before, after, changed }` so the check can establish that the document is where it was. `scrollTo` deliberately leaves the cursor alone, unlike `reveal`, which moves it to the line first — with `reveal`, a plugin that only reacted to the cursor would pass a check meant for scrolling. Its wait asks the editor's viewport rather than the rendered text: in Live Preview a line holding `[[a-note]]` is on screen as something that does not contain those characters at all. In the other direction, `type()` now *fails* if the document did not change, because keystrokes go wherever the focus is and a modal in front of the editor takes them silently.

**Documents a check constructs** — `writeDocument(name, text)`, `vaultPath()`, `corpusPath()`. Some behavior only appears in a combination of tag forms no corpus file happens to carry — a file-level directive with tags below it, or a tag at the start of a line inside a block. Those are written into the run's own disposable vault, never into `md/`: the corpus is what the server suite asserts against, and a file added there changes the surface of an unrelated run. The path is resolved and checked against the vault before anything is written, so a typo in a check is refused rather than quietly rewriting the corpus. Use this only for a *combination*; a tag form the corpus does not use at all belongs in the corpus.

**Where a marking sits** — `markers()` reports `from`, `to`, `line` and `column` beside the text. "The marking is still on its own tag after an edit" is not decidable from text alone: a document holding `##fragment` eleven times reports eleven identical entries, and one that moved to the wrong occurrence reads like one that stayed. The offset comes from CodeMirror's own `posAtDOM` rather than from counting characters. The reading view has no such mapping, so there the positions are null rather than guessed.

One more, for a question that has no other answer: `plantInRenderedView(text)` and `plantedText()` put raw text into a rendered reading view from outside the plugin. The requirement that the editor does not write into rendered output cannot be checked by watching for changes, because the rewrite it forbids is idempotent — a view it has already been through carries no tags left to remove. Text planted afterwards is text the rewrite has not seen, so it disappears if the mechanism is there and stands if it is not.

### The third run: the screenshots in the documentation
```bash
npm run docs:screenshots
```
Not a check. It drives Obsidian the same way the run above does and takes the pictures that [docs-obsidian.md](docs-obsidian.md) and the plugin's own README show, straight from the current sources — nine of them here in `md/assets/plugin-*.png`, ten in the plugin checkout's `assets/`. A picture of a marking that has since changed documents a behaviour the plugin no longer has, and nobody notices; regenerating them is one command so that a change to what a tag looks like ends with the pictures agreeing with it.

It is `tools/obsidian-screenshots.mjs` rather than a second harness in `test/obsidian/`, because a check and a picture want different things out of the application: the vault holds only the five short documents the tool writes and none of `md/`, the theme and font size are fixed so two runs a year apart look alike, the sidebars and the inline title are out of the frame, and the context menu is left standing instead of being read and dismissed. What it does share is where things are — `SAFELEARN_TEST_PLUGIN_DIR`, `SAFELEARN_TEST_OBSIDIAN_DIR` and `SAFELEARN_OBSIDIAN_APP` mean exactly what they mean above, so one installation is described once. One setting is its own: `SAFELEARN_SCREENSHOT_PORT` (19333) is not the harness's port, so a screenshot run and a check run cannot attach to each other.

It refuses to photograph a document the plugin did not mark. A plugin that failed to load leaves every tag standing as ordinary text, which makes a perfectly good-looking screenshot of the wrong thing — so each shot names the class that has to be on the page before it is taken, and the menu is read back and insisted on rather than merely opened.

## The accounts it uses
By default the harness authenticates as the public demo accounts of the demo realm, the same ones `README.md` publishes:

| ROLE    | USER    | PASSWORD |
| ------- | ------- | -------- |
| student | student | student  |
| teacher | teacher | teacher  |

No other account is used unless you configure one, and no credential of this deployment or of any real user is stored in this repository.

The realm holds further accounts the harness does not use — an `admin`, and pupils with a class role. What each of them carries, and what a realm needs to look like for the suite to run against it at all, is in [development](docs-development.md).

### These accounts are shared — write your checks accordingly
The demo accounts are public, and SafeLearn keeps per-user preferences (`config`, `lastVisitedUrl`) as **Keycloak user attributes**, not locally. So a run changes server-side state that belongs to an account anyone else may be using at the same moment.

Two rules follow, and they apply to every check built on this harness:

* **Address content by path.** Never rely on where the login flow lands on its own — `/` resolves to the account's `lastVisitedUrl` when its `config.sl` says so. Navigate to the page you mean.
* **Set every preference your check depends on, and assert only on values you just wrote.** Dark mode, start-page behavior and font settings all come out of that shared attribute. Never assume a starting state.

## Pointing it somewhere else
Every value has a default; set only what you need to change. No file in the repository has to be edited.

| VARIABLE                              | DEFAULT                            | MEANING                                                        |
| ------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `SAFELEARN_TEST_PORT`                 | `NEXT_PUBLIC_PORT`, else `8080`    | Port the application under test listens on.                    |
| `SAFELEARN_TEST_SERVER_URL`           | `http://localhost:<port>`          | Base URL of the application under test.                        |
| `SAFELEARN_TEST_IDP_URL`              | `https://auth.unterrainer.info/`   | Identity provider the flow is expected to pass through.        |
| `SAFELEARN_TEST_REALM`                | `safeLearn`                        | Realm the login form must belong to.                           |
| `SAFELEARN_TEST_STUDENT_USER`         | `student`                          | Account used for the `student` role.                           |
| `SAFELEARN_TEST_STUDENT_PASSWORD`     | `student`                          | Its password.                                                  |
| `SAFELEARN_TEST_TEACHER_USER`         | `teacher`                          | Account used for the `teacher` role.                           |
| `SAFELEARN_TEST_TEACHER_PASSWORD`     | `teacher`                          | Its password.                                                  |
| `SAFELEARN_TEST_ENTRY_PATH`           | `/test`                            | Protected path a session is opened on, which starts the flow.  |
| `SAFELEARN_TEST_CONTENT_PATH`         | `/md/test-md-file.md`              | Page a fresh session is put on once the flow has completed.    |
| `SAFELEARN_TEST_HEADED`               | unset                              | `1` runs with a visible browser window.                        |
| `SAFELEARN_TEST_STARTUP_TIMEOUT_MS`   | `120000`                           | How long to wait for the application to answer.                |
| `SAFELEARN_TEST_NAVIGATION_TIMEOUT_MS`| `45000`                            | How long any single navigation may take.                       |

Note that the port is not a free choice: SafeLearn derives its OIDC redirect URI from the server URL, and that URI must be registered on the Keycloak client. `http://localhost:8080/auth/callback` is registered on the demo client; another port needs a matching entry in the Keycloak admin console.

## Writing your own checks
The harness is in `test/harness.js` and exposes plain async functions — no test-framework types — so the runner above it can be replaced without touching it:

```js
import { openSession, shutdown, applicationUrl } from "./harness.js";

const session = await openSession("teacher");   // starts the app if needed, logs in
await session.page.goto(`${applicationUrl}/md/test-perms.md`);
// ... assert on session.page ...
await session.close();                          // releases this session
await shutdown();                               // ends the run: browser, and the server if we started it
```

A check about SafeLearn's own content is written differently: it shares the run's session for its role, writes the preferences it depends on, and asks the session what it is allowed to see. Put it in a module under `test/checks/` and import it from `test/content.test.js`.

```js
import { render, roles, setPreferences, sharedSession } from "../harness.js";

const session = await sharedSession("teacher");     // logs in once per run, released by shutdown()
const carried = await roles(session);               // e.g. Set { "teacher", "4ahif", … }
await setPreferences(session, { ve: 1 });           // full block written and confirmed

const { text } = await render(session, "/md/test-exam-practice-question.md");
assert.equal(text.includes("Exam-question"), carried.has("teacher") || carried.has("admin"));
```

`session.page` is a Puppeteer page. Note that SafeLearn renders `<body style="display: none;">` and reveals it afterwards, so read text with `textContent`, not `innerText`. Two scripts reveal it and they disagree on how: `init()` in `obsidian-page.js` sets `display: block` once it has read the preferences, while the hot-reload script clears the property on `DOMContentLoaded`. Wait for `display !== "none"` rather than for a particular value, and only when you are about to measure geometry.

Test files live in `test/` and are named `*.test.js`; `node --test` runs them one file at a time, because they all share the one port the redirect URI names.

### What the harness gives you

| FUNCTION | WHAT IT DOES |
| --- | --- |
| `openSession(role)` | A fresh login in its own browser context. The caller owns it and closes it. Use this when a check needs a session nobody else has touched. |
| `sharedSession(role)` | The one session this run uses for that role, logging in on first use and released by `shutdown()`. **Use this in content checks.** Its pages only reach the application and the identity provider. |
| `roles(session)` | The roles the session actually carries, as a `Set`: the client roles, the LDAP groups the application resolved, and the account's own name, all lowercased. No token leaves the browser. |
| `setPreferences(session, values)` | Writes the full preference block with `values` merged over the baseline, then confirms the application is rendering with it. Throws naming the preference, the value asked for and the value in effect. |
| `render(session, path, { view })` | Navigates to `path` as `page`, `presentation` or `document` and returns `{ page, text, url }` once the content is there. Throws — naming the path, the view and where the request ended up — if the application redirected instead. |
| `sameOriginReferences(page)` | Every `href`/`src` of the rendered document that points at this application, requested with the session's cookies, with the status, content type and where it was finally served from. |
| `hostsContactedWhile(session, load)` | The hosts the browser actually requested something from while `load` ran, each with the addresses that caused it and its `kind` (`hostKinds.application`, `hostKinds.identityProvider`, `hostKinds.external`). Read off the requests, not off the markup, so a host an `@import` or a `url()` inside a stylesheet pulls in is seen — `sameOriginReferences` cannot see that one. A request is recorded when it is issued, so a refused host is reported too. |
| `loginCount()` | How many complete OIDC flows this run has walked. |

### Two rules that are not optional

**Write every preference your check depends on, and assert only on what you wrote.** The accounts are public and the preferences live server-side, so there is no starting state to assume. `setPreferences` writes the whole block — `{ fs: 18, t: 2, nt: 1, s: 1.6, dm: 0, sl: 0, vt: 1, va: 0, ve: 0 }` with your keys merged over it — because `POST /userattributes` serializes the request body into one Keycloak attribute and a partial write erases what it omits. Nothing is restored afterwards: two runs against the same account cannot take turns, so a restore would be a race with no upside.

**Derive the expectation from the session, not from an account you do not own.** Which classes the demo accounts belong to is undocumented and can change without notice. Ask `roles(session)` what the session carries and compute what it should see from that. A check that hardcodes "the student is in 5BHIF" is a check that will lie one day.

### Why the checks are modules

`node --test` gives every `*.test.js` its own process, so five check files by concern would mean five servers and ten logins against a shared public identity provider. The concerns therefore live in `test/checks/*.js` as modules that register their own `describe(...)` at import time, and `test/content.test.js` imports all of them. One process, one server, two logins — and `test/content.test.js` asserts that count, so a suite that quietly starts logging in per concern fails.

### The coverage record

`test/coverage-map.json` is the single source for which check guards which file. It is not restated here, because a second copy would drift.

* `test/coverage.test.js` keeps it honest: every path it names must exist, every check in `test/` must appear in it, and an entry naming a check that is gone is a failure.
* `AI/claude/hooks/name-covering-checks.mjs` reads it on every `Edit`/`Write` in an assisted session and names the checks covering the edited file. It never runs the suite — a run takes minutes and authenticates against a shared public realm, which is not something to trigger as a side effect of an edit.

A change that adds or removes a check updates the map in the same change.

**The record describes the server suite only.** The Obsidian checks under `test/obsidian/` are deliberately not in it, and there is no linter to find that surprising later. What they guard — `main.ts` and `styles.css` — lives in another repository, reached through a symlink that is absent on a checkout which has not set it up, and `coverage.test.js` asserts unconditionally that every path the record names exists. Recording them would make `npm test` fail for anyone without the plugin, and relaxing that assertion would take away the record's one guarantee. So the cost is stated rather than paid: editing the plugin's sources will not tell you which checks cover them. When the plugin repository has a record of its own, that is where the connection belongs.

### The known-dangling list

`test/checks/presentation.js` requests every reference the presentation view makes to this application and fails when one does not resolve or is not served as what it claims. A reference that is dangling today and whose repair belongs to a different change can be listed in `knownDangling`, with the reason and the owning change:

```js
const knownDangling = [
  { reference: "/some-file.css", reason: "There is no such file.", change: "some-change" },
];
```

A listed entry is **reported** and does not fail the run. An unlisted dangling reference **fails**. And an entry that no longer dangles — because the reference was repaired or removed — **fails too**, so the exception cannot outlive its repair: the change that fixes the reference deletes the line in the same commit. Those three rules are asserted directly, without a browser, so they hold whether or not the list is currently empty.

The list is empty today. It was written for `wrapInReveal`'s `<link rel="stylesheet" href="/obsidian-page.css">`, which addressed a file that does not exist; the working tree no longer emits that link.

It stayed empty when static file serving became an allowlist — every reference the application emits has a mount. That is the reason the reference walk matters more than it used to: `test/checks/deployment-surface.js` runs the same walk over the page, document and presentation views of `md/test-md-file.md`, and it carries no exception list at all. A reference that has no mount is not a 404 — the catch-all in `app.js` answers 200 with the start page — so both walks treat a redirect as a failure. A forgotten mount shows up there first.

## What the corpus demonstrates but a run cannot assert

Recorded rather than fixed: making these assertable would mean changing the application, which the change that added this suite explicitly excluded.

Four of them are gaps in which accounts the suite reaches, not in the corpus — the `admin` block, the `5bhif` block, the `student` alias and the 2099 window. For three of them the realm already holds a suitable account; they stay open only because `accounts` in `test/harness.js` lists two logins. See [development](docs-development.md). Each entry expires with the account that closes it.

* **`md/test-md-file.md` — the `@@@ admin` block is only provable from the denied side.** The realm has an `admin` account holding the role, but `accounts` in `test/harness.js` lists only `student` and `teacher`, so no session the suite opens carries it: the check asserts absence for both and the permitted side is not exercised. Unlike the gaps below this one is closable in code alone — see [development](docs-development.md). The expectation is derived from `roles(session)` via `carried.has("admin")`, so the day a session holds the role the same check starts proving the other direction without an edit. The two other things only an admin session could show follow from the same absence: that `admin` short-circuits a directive naming other roles, and that dropping the teacher view takes that short-circuit away.
* **The reserved-name guard is not exercised by a run, though the realm can now show it.** A display name equal to `admin`, `teacher`, `teachers`, `student` or `students` is refused entry into the role set (`utils.js`, `namesReservedForRoles`). The realm holds a `collision` account named exactly `Admin` and holding no role, and against a live login it is refused the `@@@ admin` block, the teacher block, the `@@@ 5bhif` block and `md/test-fileperms-teachers.md`, while the `admin` account is granted all four. Taking that account into the suite needs more than a line in `accounts`: `roles(session)` adds the display name unconditionally, so it would report `admin` for this session and every check would assert the opposite of the truth. The harness has to learn the same reserved-name rule first — see [development](docs-development.md#the-reserved-name-account).
* **`resolveFileVisibility` treats a missing directive as `null` or `undefined`, and only `null` occurs.** `getPermissionsFor` starts at `null` and resolves it when the stream closes, so a zero-byte file — the corpus has three, `Untitled.md` in each `md/folder-tests/` directory — yields `null` rather than `undefined`, and the metadata build always writes the key. No caller in this repository can produce the `undefined` half, so it is handled and unexercised. It stays because the function is exported and a fork may call it with a value it parsed itself; a missing directive should mean "everyone may see it", not a crash. The `null` half is exercised on every run: those three files are listed for every session.
* **The `catch` in `hasRoles` cannot be reached from a browser.** It returns `false` so that a failed role resolution refuses rather than leaves the decision open, but reaching it needs fault injection the harness has no seam for. Recorded rather than mocked.
* **An empty navigation tree cannot be produced from a run.** `getDirectoryListing` reads the last of the files the session may see, to decide whether two `div`s are still open; with an empty set there is no entry to read. The guard for it is in place, and unproven: reaching it needs a session that may see no file at all, and the corpus root `md/` is hardcoded — `scanFiles` walks it directly and no environment variable redirects it — so producing that state from a check would mean restricting every corpus file against every test account, which would take the rest of the suite down with it. The realistic trigger is not permissions at all: the WYSIWYG containers bind-mount the author's own vault, so a teacher pointing the container at a fresh, empty folder hits it on the first page load.
* **No corpus block names a role alongside `#exam`.** A view directive is only reached when the roles in the same directive already granted the block, so `@@@ admin, #exam` cannot let a student through whatever their `ve` preference says. The corpus demonstrates `@@@ #exam` on its own, which is what `test/checks/views.js` asserts; the combined form was verified once, against `hasRoles` directly, when the self-granting defect was repaired.
* **`md/test-perms-student-alias.md` — the `student`/`students` alias is only provable from the denied side, and in production always will be.** No demo account carries `student` — not even the one called `student`, which holds no role at all — so the check asserts absence of all three blocks for both sessions. That mirrors reality rather than falling short of it: a school directory does not put pupils into a unit that would produce the role, so a student is simply a session that is neither `admin` nor `teacher` (see [permissions](docs-permissions.md#addressing-students)). The role exists in the code and another directory could produce it, which is what the check is for — and the realm has a `pluralstudent` account carrying `students`, which the canonicalization turns into both spellings. It is not in the harness yet. The check prints which side each session put it through (`the student alias, exercised against: …`), so once such a session joins a run it says so and starts proving the other direction without an edit.
* **`md/test-perms.md` — the `5bhif` block is only provable from the denied side.** Neither session the suite opens carries a class role that any `@@@ 5bhif` directive names, so the check asserts absence for both. A rule that granted everyone would still fail it, but the permitted side is not exercised. The realm has a `student5b` account for exactly this; it is not in the harness yet.
* **`md/test-md-file.md` — a time window that has not opened yet cannot be isolated.** The 2099 windows sit in the same directive as `4ahif` and `examParticipant`, which carry no window, and the only session holding `teacher` also holds `4ahif`. So the block is visible either way, and what is proven is the other half: a window that has *closed* hides the block from a role that holds it (`teacher[2025-11-30T15:03:00 to 2025-11-30T15:04:00]`), while the same role sees the neighbouring block whose window opened. The realm has a `student4b` account — `4bhif` and nothing else — which would isolate the unopened window; it is not in the harness yet.
* **`md/presentations/test-presentation.md` demonstrates no fragments.** The deck fragment check therefore reads the corpus's fragment demonstration, `md/test-md-file.md`, as a presentation.
* **`md/test-md-file.md` — `[[test-presentation]]` resolves to the copy at the root of the corpus**, not to `md/presentations/test-presentation.md`. The link that arrives at the copy in the folder is the one on `md/test-presentation.md`, which names it by path. Both are asserted, as they are.
* **A whole-file directive refuses by rendering a message, not by redirecting.** `sanitizeAndParseMarkdown` catches its own error and returns it as the page body, so a denied request answers 200 with the refusal in `#markdown-content`. There are two, chosen by the cause `resolveFileVisibility` reports: "You do not have the required permissions to view this content." for a directive naming roles the session lacks, and "This content is not visible right now." for one whose windows have all closed. The checks assert both, and assert that neither appears for the other's cause.

## Troubleshooting
| SYMPTOM | LIKELY CAUSE |
| --- | --- |
| `login form not recognized` | The realm's login theme changed, or the identity provider answered with something other than its login page. Run `npm run test:headed` and watch. |
| `the flow never left the identity provider` | The credentials were rejected. Check the account and password variables above. |
| `the flow did not return to the application` | `http://localhost:<port>/auth/callback` is not a registered redirect URI on the Keycloak client. |
| `SafeLearn did not answer …` | The application failed to start; its own stdout and stderr are part of the message. |
| `… did not render …: the application sent it to …` | The path does not exist, or the session may not read it, and the application fell through to its catch-all redirect. |
| `Preference "…" was set to X, but the application renders with Y` | The write did not reach the token — usually somebody else changed the shared account mid-run. Run it again; if it persists, check the `config` attribute in the Keycloak account console. |
| `… should be served as JavaScript, but is served as text/html` | A file the page references is not there, so `express.static` fell through to the catch-all redirect. Run `npm install` — a declared dependency that is not installed shows up exactly like this. |
| `these references are on the known-dangling list but no longer dangle` | The reference was repaired. Delete its entry in `test/checks/presentation.js`. |
