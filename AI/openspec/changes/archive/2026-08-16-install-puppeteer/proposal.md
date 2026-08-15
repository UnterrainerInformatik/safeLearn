Source proposal: AI/proposals/install-puppeteer.md

## Why

SafeLearn has no automated verification of any kind — `AI/architecture.md` records it plainly: no test script, no test directory, no type checking, the source is the only specification of behavior. Every change to the render pipeline, the permission model or the presentation view is therefore checked by a human opening a browser, logging in and looking at the page.

That is a problem right now, not in the abstract: the queued `initial-repairs` change touches exactly the paths that cannot be judged from the source alone — migrating the presentation view from the CDN-loaded Reveal 3.7.0 to the bundled 5.2.1, narrowing `express.static` away from the application directory, and moving the session secret out of the code. Each of those can break silently in the browser while every file still parses. An assistant working on this repository currently cannot see what it is doing.

A Puppeteer harness that starts the local server, completes the Keycloak login and hands back an authenticated browser page closes that gap, and gives the follow-up change (`make-puppeteer-tests`) something to build its smoke tests on.

## What Changes

- Add `puppeteer` as the project's first `devDependency`, together with Node's built-in `node:test` runner — no additional test framework.
- Add a reusable verification harness that:
  - starts the SafeLearn server locally on a test port and waits until it accepts requests,
  - launches a browser, walks the Keycloak OIDC flow (`/test` → `auth.unterrainer.info` login form → `/auth/callback`), and returns a logged-in page,
  - can log in as either of the demo users, and tears down browser and server afterwards.
- Point the harness at the public demo realm (`auth.unterrainer.info`, realm `safeLearn`) with the documented demo accounts `student`/`student` and `teacher`/`teacher`, so no private data is ever read or transmitted.
- Take credentials and endpoints from environment variables with the demo values as defaults, so a different Keycloak can be used without editing code, and **no new secret is added to the repository**.
- Add one smoke test that exercises the harness end to end: log in as `student`, log in as `teacher`, confirm each reaches an authenticated page rather than the login form.
- Add `npm test` (and a headed variant for debugging) to `package.json`.
- Document the setup in the existing docs so a human can run it the same way.

Out of scope: converting the `md/test-*.md` files into a smoke-test suite. That is the separate `make-puppeteer-tests` proposal, which depends on this one.

## Capabilities

### New Capabilities

- `browser-verification`: How a change to SafeLearn is verified in a real browser — starting the application under test, authenticating against the demo Keycloak as a chosen role, and the guarantees the harness gives its callers (isolation, teardown, no secrets in the repository).

### Modified Capabilities

None. The application's own behavior is unchanged by this change; nothing in `AI/openspec/specs/proposal-intake/` is affected.

## Impact

**Dependencies**
- `puppeteer` enters `package.json` as a `devDependency` — the first entry in that section. It downloads a Chromium build (~150 MB) into `node_modules` on install.
- No production dependency changes. The `Dockerfile` runs `npm install --omit=dev`, so the image is unaffected in size and content.

**Files**
- `package.json` — new `devDependencies` section, new `test` scripts.
- A new test directory holding the harness and the smoke test (not copied by the `Dockerfile`, which enumerates the directories it takes).
- `.gitignore` — ignore whatever the harness writes at runtime (screenshots, user-data dirs).
- Documentation — a short section on running the verification harness.

**Application code**
- None. `app.js`, `obsidian.js`, `utils.js` and the middlewares are not touched.

**External systems**
- The harness depends on `auth.unterrainer.info` being reachable and on the demo accounts remaining valid. It authenticates a real user session against that Keycloak on every run.
- It requires `http://localhost:<port>/auth/callback` to be an accepted redirect URI on the `safeLearn` client. Whether that is already configured is unverified and is the main risk this change carries; see `design.md`.

**Assumptions recorded**
- The server under test runs locally, so that local changes are what gets verified — the stated purpose of the source proposal. The public demo at `safelearn.unterrainer.info` supplies the credentials, not the target.
- `node:test` is the runner, keeping the project free of a test framework and its dependency tree.
