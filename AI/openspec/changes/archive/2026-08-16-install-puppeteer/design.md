## Context

See `proposal.md` — Why. What shapes the approach here is how SafeLearn boots and authenticates:

- `app.js` calls `app.listen(process.env.NEXT_PUBLIC_PORT, "0.0.0.0")` inside the `.then()` of the initial `scanFiles()`. The socket therefore opens only after the file and font scan has finished — a connection that succeeds is already a meaningful readiness signal. There is no health endpoint.
- `keycloak-middleware.js` builds its redirect URI as `serverUrl + "/auth/callback"`, where `serverUrl` is `NEXT_PUBLIC_SERVER_URL` or `http://localhost:8080`. The Keycloak client must accept exactly that URI, so the port the harness runs on is not a free choice.
- `keycloak.json` in the working directory already points at the demo realm (`auth.unterrainer.info`, resource `safeLearn`) and is gitignored. A developer who can run the app locally can already authenticate; the harness needs no new configuration file.
- Login is a full OIDC redirect: `/test` → Keycloak login form → `/auth/callback` → the originally requested URL. There is no direct-grant path through the application.
- The application persists per-user preferences (`config`, `lastVisitedUrl`) as **Keycloak user attributes**, not locally. A verification run therefore mutates server-side state belonging to the shared demo account.
- Sessions use `express-session`'s `MemoryStore`, so a server restart invalidates every session — harmless here, since each run owns its server.
- The project has no `devDependencies` section and no test script at all.

## Goals / Non-Goals

**Goals:**

- One import gives a test an authenticated page for a named role, with startup, login and teardown handled.
- A failed login fails loudly and specifically, rather than returning a page that happens to render the login form.
- The harness is usable both as the base for the coming smoke-test suite and ad hoc, for looking at a change.

**Non-Goals:**

- Running without network access. Authentication is a real OIDC round-trip against a real Keycloak; there is no mock issuer and no recorded session.
- Isolating the demo account. It is public and shared; the design works around that rather than trying to own it.
- Any assertion about SafeLearn's content beyond "we are authenticated". The content-level checks are `make-puppeteer-tests`.
- Running the harness in CI. Nothing prevents it later, but the pipeline is not touched.

## Decisions

### Node's built-in test runner over a framework

`node:test` with `node:assert` covers structure, assertions, per-check reporting and the exit code, and adds no dependency beyond Puppeteer itself. The project has no build step and no devDependencies today; Vitest or Jest would introduce a toolchain out of proportion to a handful of browser checks. Trade-off: no watch mode, no rich diffing. Both are replaceable later without touching the harness, since it exposes plain async functions rather than test-framework constructs.

### Verify the working tree, on the port the redirect URI already names

The harness targets a locally started server, because a deployed instance cannot show whether a local change works — the point of the source proposal. It uses the standard port (`8080` by default, overridable) rather than an ephemeral one: the redirect URI is derived from the server URL and must be registered on the Keycloak client, so a random port would fail the OIDC flow on every run.

**Reuse an already-running server rather than fighting it.** If the port answers, the harness treats that instance as the application under test and leaves it alone at the end; otherwise it starts one and stops it afterwards. This makes the common developer situation — `npm start` already running in another terminal — work instead of failing on a bound port, and keeps `npm test` a single command in both cases. The alternative, always starting a private server on a private port, was rejected because of the redirect-URI constraint above.

### Start the server as a child process, without nodemon

The harness spawns `node app.js` directly rather than `npm start`. Nodemon would restart the server on any file touched during a run and would leave a process tree that is awkward to kill reliably. Readiness is polled by issuing HTTP requests until one is answered — any response counts, including the redirect to `/test`, because the listener only exists after the initial scan completes. On timeout the child's captured stdout and stderr become part of the failure message, so a startup crash reads as a startup crash and not as a login failure.

### One incognito browser context per role

Each role gets its own browser context inside a single browser process. Contexts do not share cookies or storage, so `student` and `teacher` sessions in the same run cannot contaminate each other and their order does not matter. Alternative considered and rejected: one browser process per role, which multiplies startup cost for the same isolation; and sequential logins in a shared context, which requires a logout round-trip and still leaves Keycloak SSO cookies behind.

### Credentials from the environment, demo values as defaults

Endpoint, realm, account names and passwords are read from environment variables and default to the values already published in `README.md` and in the source proposal. Nothing new is committed. A different Keycloak is a matter of exporting variables, not editing files. The harness never reads `keycloak.json` for credentials — it drives a browser through a form, so it needs only the account, not the client secret.

### Failure is defined positively

After submitting the form, the harness waits for an authenticated application page and treats anything else as failure — still on the identity provider's host, an error page, a redirect back to the login form. The check is "we arrived somewhere authenticated", not "no exception was thrown", because the OIDC flow fails by redirecting, not by throwing. The failure message names the role and the final URL, which is the piece of information that actually distinguishes a wrong password from an unregistered redirect URI.

### Layout

A `test/` directory: the harness alongside the checks that use it. The `Dockerfile` enumerates the directories it copies, so a new top-level directory does not enter the image; `npm install --omit=dev` keeps Puppeteer out of it as well. Runtime output (browser profiles, screenshots) goes to an ignored subdirectory.

## Risks / Trade-offs

- **`http://localhost:8080/auth/callback` may not be a registered redirect URI on the `safeLearn` client** → This is the one thing that can make the whole change non-functional, and it cannot be verified from the repository. It is likely already registered, since local development against this Keycloak is the documented workflow. Mitigation: the implementation verifies the login manually before anything is built on it, and the failure message points at the redirect URI explicitly. If it is not registered, it is a one-line change in the Keycloak admin console — which the maintainer of `auth.unterrainer.info` can make.
- **The demo accounts are shared and their preferences live in Keycloak** → A run writes `lastVisitedUrl` and possibly `config` for a globally public user, and anyone else using the demo at the same time sees the effect and causes it. Mitigation: checks must set every preference they depend on instead of assuming a starting state, and must not assert on preference values they did not just write. This constraint is inherited by `make-puppeteer-tests` and is worth recording there.
- **Keycloak's login form is styled by the realm's theme** → Field selectors can break on a theme change. Mitigation: address the fields by their stable form semantics rather than by theme-specific ids, and fail with a message that says the login form was not recognized.
- **Every run depends on `auth.unterrainer.info` being up** → No offline verification, and an outage looks like a test failure. Accepted: the alternative is mocking the identity provider, which would stop verifying the part most likely to break.
- **Puppeteer downloads a Chromium build (~150 MB) on install** → Slower first `npm install` and more disk. Accepted for a devDependency; production images are unaffected.
- **`npm test` becomes a command that authenticates against a live external service** → Surprising for anyone expecting unit tests. Mitigation: document what the command actually does, in the same place the setup is described.

## Migration Plan

Purely additive: a devDependency, a `test/` directory, npm scripts, a `.gitignore` line and a documentation section. No application code changes, no deployment impact, nothing to migrate. Rollback is removing the directory and the devDependency.

## Open Questions

- Whether the redirect URI is already registered (see Risks). Answered by the first manual login attempt during implementation; it changes neither the specs nor the task breakdown, only whether a Keycloak-side edit is needed first.
- Whether the harness should also expose an unauthenticated page, for checking what a logged-out visitor sees. Not needed for this change; trivial to add when a check calls for it.
