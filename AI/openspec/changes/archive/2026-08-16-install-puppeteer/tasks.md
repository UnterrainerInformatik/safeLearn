## 1. Preflight — settle the redirect URI before building on it

- [x] 1.1 Confirm `keycloak.json` exists in the working directory and names the demo realm (`auth.unterrainer.info`, resource `safeLearn`); without it the application cannot start the OIDC flow at all
- [x] 1.2 Start the application locally (`npm start`) and request `/test` without following redirects; capture the `Location` header and confirm it carries `redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fauth%2Fcallback`
- [x] 1.3 Follow that authorization URL and confirm Keycloak answers with the login form, **not** `Invalid parameter: redirect_uri` — this is the risk called out in design.md and decides whether anything else here can work
- [x] 1.4 If the URI is rejected, stop and report to the maintainer of `auth.unterrainer.info` that `http://localhost:8080/auth/callback` needs to be added to the `safeLearn` client's valid redirect URIs; resume only once it is accepted
- [x] 1.5 Log in manually as `student` once and note the URL the flow ends on — that observation defines what "authenticated application content" means for the check in 4.4

**Preflight findings:**
- The redirect URI is registered. Keycloak answers the authorization URL with its login form (HTTP 200); 1.4 was therefore not needed.
- The login form addresses its fields as `input[name="username"]` / `input[name="password"]` with `autocomplete="username"` / `autocomplete="current-password"` — stable form semantics, no theme-specific id required.
- The flow ends on `http://localhost:8080/README.md`, i.e. `NEXT_PUBLIC_START_PAGE`. That URL is **not** a reliable success marker: `/` resolves to `lastVisitedUrl` when the shared account's `config.sl == 1`. "Authenticated application content" is therefore defined as: same origin as the application, path is not `/test`, and the page shell rendered by `wrapInPage` is present (`#sidebar`, `#topdown-menu`).
- `md/test-perms.md` discriminates the two roles in both directions: a teacher sees `Only visible to teachers.` and not `Only visible to Stu Dent`, a student the reverse. This is the basis for check 5.4.

## 2. Dependency and layout

- [x] 2.1 Add `puppeteer` to `package.json` as the project's first `devDependencies` entry, and run `npm install`
- [x] 2.2 Confirm `package-lock.json` marks it `"dev": true`, so `npm install --omit=dev` in the `Dockerfile` keeps it out of the image
- [x] 2.3 Create the `test/` directory with the harness module and the smoke test alongside it (design — Layout)
- [x] 2.4 Add `test` and a headed variant to `package.json` scripts, both running `node --test` over `test/` (design — Node's built-in test runner)
- [x] 2.5 Add the harness's runtime output directory (browser profiles, screenshots) to `.gitignore`

## 3. Application lifecycle (spec: "The application under test is the local working tree")

- [x] 3.1 Probe the configured port before doing anything else; if it answers, adopt that instance and record that this run must not stop it (design — Reuse an already-running server)
- [x] 3.2 Otherwise spawn `node app.js` as a child process — not `npm start`, so nodemon cannot restart the server mid-run — with `NEXT_PUBLIC_PORT` and `NEXT_PUBLIC_SERVER_URL` set consistently, capturing stdout and stderr
- [x] 3.3 Poll the port with HTTP requests until any response arrives; treat a redirect as ready, since `app.listen` only runs after the initial `scanFiles` resolves (design — Context)
- [x] 3.4 On startup timeout, fail with the child's captured output included and open no browser (spec scenario "The application never becomes reachable")
- [x] 3.5 Stop a self-started server on run end, on failure, and on `SIGINT`/`SIGTERM`; leave an adopted server running (spec scenarios "No server is running", "A server is already running", "A run is interrupted")

## 4. Authenticated sessions (spec: "A verification run yields an authenticated browser page")

- [x] 4.1 Read identity provider, realm, account names and passwords from environment variables, defaulting to the demo values published in `README.md`; commit no new credential (spec: "Authentication uses only public demo credentials")
- [x] 4.2 Launch one browser, headless unless the documented headed switch is set, and give each requested role its own incognito browser context (design — One incognito browser context per role)
- [x] 4.3 Navigate to `/test`, recognize the Keycloak login form by its form semantics rather than theme-specific ids, fill in the account and submit; fail with "login form not recognized" if the fields are absent (design — Risks)
- [x] 4.4 Assert positively that the flow ended on authenticated application content — not on the identity provider's host, not on an error page, not back on the login form — and on failure raise an error naming the role and the final URL (design — Failure is defined positively)
- [x] 4.5 Expose the harness as plain async functions (obtain a session, release it) that carry no test-framework types, so the runner can be swapped later
- [x] 4.6 Close contexts and the browser on teardown, including when a check throws

## 5. Smoke test proving the harness

- [x] 5.1 Check: a `student` session reaches authenticated content
- [x] 5.2 Check: a `teacher` session reaches authenticated content
- [x] 5.3 Check: both sessions in one run are independent — the second login does not inherit the first one's cookies, and swapping the order changes nothing (spec scenario "Two roles in one run")
- [x] 5.4 Check: the two sessions are actually distinguishable, by asserting on something only one role may see, so a broken login cannot pass by returning the wrong user's page
- [x] 5.5 Set explicitly every preference a check depends on rather than assuming a starting state — the demo accounts are shared and their preferences live in Keycloak (design — Risks); record this constraint where `make-puppeteer-tests` will find it
- [x] 5.6 Check: a deliberately wrong password fails the run with the message from 4.4 rather than passing (spec scenario "Login does not complete") — run this once by hand, do not leave it in the suite

## 6. Documentation and project record

- [x] 6.1 Write `docs-testing.md` following the existing `docs-*.md` pattern: what the harness does, `npm install` and the test command, the headed switch, the demo accounts it uses, the environment variables for pointing it elsewhere, and the plain statement that the command authenticates against a live external Keycloak
- [x] 6.2 Link it from `README.md` and from `docs-debugging.md`, and add it to the Source Documents table in `AI/architecture.md`
- [x] 6.3 Correct the now-outdated "No tests and no type checking" observation in `AI/architecture.md` §9 and add Puppeteer to the Tooling section
- [x] 6.4 Write `AI/memory/browser-verification.md` (type `project`) recording that the harness exists, how it is invoked, and that it authenticates against the shared public demo account; link `[[architecture-doc]]`, and append its pointer line to `AI/memory/MEMORY.md`

## 7. Verification

- [x] 7.1 `npm test` passes from a clean checkout with no server running, and the run leaves no orphaned `node` or Chromium process
- [x] 7.2 `npm test` passes with `npm start` already running on 8080, and that server is still running afterwards
- [x] 7.3 Two consecutive runs report the same result (spec scenario "Consecutive runs")
- [x] 7.4 The headed switch runs the identical checks with a visible window (spec scenario "Watching a failure")
- [x] 7.5 Interrupt a run with `Ctrl-C` and confirm no browser and no self-started server survives
- [x] 7.6 `git grep` for the demo password and the client secret confirms no new tracked file carries a credential beyond what `README.md` already publishes
- [x] 7.7 `git status` confirms no application file (`app.js`, `obsidian.js`, `utils.js`, `middlewares/`, `css/`, `md/`) was modified
- [x] 7.8 `openspec validate install-puppeteer --strict` passes

**Verification results:**
- 7.1 Two runs with nothing listening on 8080: 5/5 checks pass, ~24 s each. Afterwards no listener on 8080, no `app.js` and no Chromium process from the run.
- 7.2 With `npm start` already running: 5/5 pass in ~16 s, and nodemon plus its server are still alive afterwards.
- 7.3 Both consecutive runs report `tests 5 / pass 5 / fail 0`, exit code 0.
- 7.4 `npm run test:headed` runs the same 5 checks and launches the full Chrome binary without `--headless` — a visible window.
- 7.5 SIGINT to the run's process group, sent once the harness had started the server and 13 browser processes were alive: the runner reports `Interrupted while running`, and no listener, no browser and no application process survives.
- 7.6 The new files carry only the demo account names and passwords `README.md` already publishes. **Pre-existing, outside this change, since resolved:** `AI/proposals/install-puppeteer.md` quoted `keycloak.json` verbatim including the live client secret, committed in `f2d47b2`. Nothing here added it and nothing here reads it — the harness drives a browser through a form and never needs the secret. The client secret has since been rotated, and the value in the proposal has been replaced with a placeholder. The superseded value is still readable in commit `f2d47b2`; it no longer authenticates anything.
- 7.7 `git status` shows no change to `app.js`, `obsidian.js`, `obsidian-page.js`, `utils.js`, `middlewares/`, `css/` or `md/`.
- 7.8 `openspec validate install-puppeteer --strict` → "Change 'install-puppeteer' is valid".

**Deviations from the plan, and why:**
- 2.4 The scripts pass an explicit glob (`node --test "test/*.test.js"`) rather than the directory `test/`. Node 24 treats a directory argument as a module path and fails; the glob also keeps `node --test` from picking up `test/harness.js`, which its default patterns would otherwise run as a test file. `--test-concurrency=1` is set because every test file shares the one port the redirect URI names.
- The headed switch is an `--env-file` (`test/headed.env`) rather than a shell prefix, so it behaves the same on every platform without adding `cross-env` as a second devDependency.
- `npm install` bumped the hoisted transitive `ws` from 8.19.0 to 8.21.3, since Puppeteer depends on it too. Semver-compatible and no declared dependency changed.
