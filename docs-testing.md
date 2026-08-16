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
| `test/checks/permissions.js` | Block-level and whole-file `@@@` directives in both directions, including the `admin` directive and the plural `teachers` alias, their effect on the navigation tree, time-bounded windows, and the teacher-to-student downgrade. |
| `test/checks/views.js` | The `#exam`, `#practice` and `#answer` pseudo-roles, driven through the `ve` and `va` preferences. |
| `test/checks/rendering.js` | Every callout type and the collapsible forms, highlighted code, fragment indices and their reset at headings, the two- and three-column layouts, the four image forms, and the emitted PlantUML and Mermaid markup. |
| `test/checks/navigation.js` | Wiki-link resolution including the duplicated basename and the name with spaces, the folder-name edge cases, the table of contents and the navigation tree. |
| `test/checks/presentation.js` | The deck built from the source's heading structure, fragments in a deck, the deck's own references, and the document view. |
| `test/coverage.test.js` | The coverage record. No browser, no login. |

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

## The accounts it uses
By default the harness authenticates as the public demo accounts of the demo realm, the same ones `README.md` publishes:

| ROLE    | USER    | PASSWORD |
| ------- | ------- | -------- |
| student | student | student  |
| teacher | teacher | teacher  |

No other account is used unless you configure one, and no credential of this deployment or of any real user is stored in this repository.

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

### The known-dangling list

`test/checks/presentation.js` requests every reference the presentation view makes to this application and fails when one does not resolve or is not served as what it claims. A reference that is dangling today and whose repair belongs to a different change can be listed in `knownDangling`, with the reason and the owning change:

```js
const knownDangling = [
  { reference: "/some-file.css", reason: "There is no such file.", change: "some-change" },
];
```

A listed entry is **reported** and does not fail the run. An unlisted dangling reference **fails**. And an entry that no longer dangles — because the reference was repaired or removed — **fails too**, so the exception cannot outlive its repair: the change that fixes the reference deletes the line in the same commit. Those three rules are asserted directly, without a browser, so they hold whether or not the list is currently empty.

The list is empty today. It was written for `wrapInReveal`'s `<link rel="stylesheet" href="/obsidian-page.css">`, which addressed a file that does not exist; the working tree no longer emits that link.

## What the corpus demonstrates but a run cannot assert

Recorded rather than fixed: making these assertable would mean changing the application, which the change that added this suite explicitly excluded.

* **`md/test-md-file.md` — the `@@@ admin` block is only provable from the denied side.** No demo account holds `admin`, so the check asserts absence for both sessions and the permitted side is not exercised — the same gap as the `5bhif` block below. The expectation is derived from `roles(session)` via `carried.has("admin")`, so the day an account gains the role the same check starts proving the other direction without an edit. The two other things only an admin session could show follow from the same absence: that `admin` short-circuits a directive naming other roles, and that dropping the teacher view takes that short-circuit away.
* **No corpus block names a role alongside `#exam`.** A view directive is only reached when the roles in the same directive already granted the block, so `@@@ admin, #exam` cannot let a student through whatever their `ve` preference says. The corpus demonstrates `@@@ #exam` on its own, which is what `test/checks/views.js` asserts; the combined form was verified once, against `hasRoles` directly, when the self-granting defect was repaired.
* **`md/test-perms.md` — the `5bhif` block is only provable from the denied side.** Neither demo account carries a class role that any `@@@ 5bhif` directive names, so the check asserts absence for both sessions. A rule that granted everyone would still fail it, but the permitted side is not exercised.
* **`md/test-md-file.md` — a time window that has not opened yet cannot be isolated.** The 2099 windows sit in the same directive as `4ahif` and `examParticipant`, which carry no window, and the only session holding `teacher` also holds `4ahif`. So the block is visible either way, and what is proven is the other half: a window that has *closed* hides the block from a role that holds it (`teacher[2025-11-30T15:03:00 to 2025-11-30T15:04:00]`), while the same role sees the neighbouring block whose window opened.
* **`md/test-exam-practice-question.md` — a student with the exam view on is left with neither variant.** `#practice` is granted by `ve == 0` alone, with no role in the rule, so turning the exam preference on takes the practice question away from a student without giving them the exam one. Asserted as it is.
* **`md/presentations/test-presentation.md` demonstrates no fragments.** The deck fragment check therefore reads the corpus's fragment demonstration, `md/test-md-file.md`, as a presentation.
* **`md/test-md-file.md` — `[[test-presentation]]` resolves to the copy at the root of the corpus**, not to `md/presentations/test-presentation.md`. The link that arrives at the copy in the folder is the one on `md/test-presentation.md`, which names it by path. Both are asserted, as they are.
* **A whole-file directive refuses by rendering a message, not by redirecting.** `sanitizeAndParseMarkdown` catches its own error and returns it as the page body, so a denied request answers 200 with "You do not have the required permissions to view this content." in `#markdown-content`. The checks assert that message.

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
