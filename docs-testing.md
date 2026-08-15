# Testing
Here you can find information about verifying this project in a real browser.

[Back](README.md) to the main page.

## What the harness does
`npm test` is not a unit-test run. It starts SafeLearn from your working tree, opens a real browser, walks the complete Keycloak login for a role, and checks that it arrives on authenticated application content.

> **`npm test` authenticates against a live, external Keycloak.**
> Every run performs a real OIDC round-trip against `https://auth.unterrainer.info`. Without network access to that server the run fails, and there is no offline or mocked mode. That is deliberate: the login is the part most likely to break, so mocking it would verify nothing.

One run does the following:

* **Starts the application.** If nothing answers on the configured port, the harness spawns `node app.js` (not `npm start` — nodemon would restart the server mid-run) and waits until it answers requests. It stops that server again when the run ends, however the run ended.
* **Adopts a server you already started.** If the port is already serving SafeLearn, the harness uses that instance and leaves it running afterwards. So having `npm start` open in another terminal is fine; `npm test` is the same single command either way.
* **Logs in per role.** Every role gets its own incognito browser context, so a `student` and a `teacher` session in the same run share no cookies and the order they are opened in makes no difference.
* **Fails positively.** The OIDC flow fails by redirecting, not by throwing, so the harness asserts that it *arrived* somewhere authenticated. A failure names the role and the URL the flow stopped at, and leaves a screenshot in `test/.runtime/`.

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

`session.page` is a Puppeteer page. Note that SafeLearn renders `<body style="display: none;">` and reveals it from its own `init()`, so read text with `textContent`, not `innerText`.

Test files live in `test/` and are named `*.test.js`; `node --test` runs them one file at a time, because they all share the one port the redirect URI names.

`test/smoke.test.js` verifies the harness itself: both roles reach authenticated content, two sessions in one run stay independent in either order, and the two sessions really are different users — a `teacher` sees the teacher-only paragraph in `md/test-perms.md` and a `student` sees the one addressed to them by name.

## Troubleshooting
| SYMPTOM | LIKELY CAUSE |
| --- | --- |
| `login form not recognized` | The realm's login theme changed, or the identity provider answered with something other than its login page. Run `npm run test:headed` and watch. |
| `the flow never left the identity provider` | The credentials were rejected. Check the account and password variables above. |
| `the flow did not return to the application` | `http://localhost:<port>/auth/callback` is not a registered redirect URI on the Keycloak client. |
| `SafeLearn did not answer …` | The application failed to start; its own stdout and stderr are part of the message. |
