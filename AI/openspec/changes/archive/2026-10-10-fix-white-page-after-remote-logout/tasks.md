## 1. Confirm the mechanism

- [x] 1.1 Reproduce locally against the demo realm. Log in, end the session at Keycloak in the same browser,
      wait until the 60-second refresh window is reached, then click a link. Confirm the white page and the
      `TypeError` on `accessTokenDecoded.exp` in the server log, and that the process exits
- [x] 1.2 With the session ended at Keycloak, check whether the account endpoint answers `401` for the still-unexpired
      access token. That decides whether design.md Decision 4 stays in

## 2. Ending a dead session

- [x] 2.1 `refreshAccessToken`: on `invalid_grant`, log the user out and regenerate the session instead of nulling the
      tokens, then throw a `SessionEndedError`. Remove `needsReauth`. Other failures are logged and leave the session
      alone (design.md — Decisions 1, 2 and 6)
- [x] 2.2 Refresh middleware: read the expiry null-safe. Treat a session without a decodable token as ended.
      A `SessionEndedError` continues to `checkAuthenticated`; forward every other error to `next(e)`
      (design.md — Decisions 5 and 6)
- [x] 2.3 `fetchAccount`: a `401` from the account endpoint triggers one forced `refreshAccessToken`. The permission
      context lets a `SessionEndedError` through instead of settling on defaults (design.md — Decision 4)
- [x] 2.4 `sanitizeAndParseMarkdown` rethrows a `SessionEndedError` instead of returning it as an error string
      (design.md — Decision 6)
- [x] 2.5 The handler chains for `.md`, `/convert` (GET and POST), `/search`, `/` and `/userattributes` forward
      rejections with `.catch(next)` (design.md — Decision 6)

## 3. Answering the unauthenticated request

- [x] 3.1 `checkAuthenticated`: redirect navigations (`Sec-Fetch-Mode: navigate`, fallback `Accept: text/html`) to
      `/test` as before. Answer everything else with an empty `401`. The answer is one exported helper, so the error
      handler can reuse it (design.md — Decision 3)
- [x] 3.2 Confirm the login round-trip still returns to the originally requested page (`originalUrl` → callback)
- [x] 3.3 Add a final error handler in `app.js`: a `SessionEndedError` gets the unauthenticated answer of 3.1, any
      other error is logged and answered with `500` (design.md — Decision 6)

## 4. Verification

- [x] 4.1 New check `test/checks/session-lifecycle.js`, imported from `test/content.test.js`. Use its own
      `openSession`, end the session at Keycloak in that context, then click a link without waiting for the
      refresh window. Assert that the browser
      arrives at the login form, that a script request with the dead cookie gets `401` and no redirect, and
      that the spawned server process is still alive and a shared session still renders a page
- [x] 4.2 State in the check that it costs exactly one extra login, and why
- [x] 4.3 Add the check to `test/coverage-map.json`
- [x] 4.4 Run `npm test`. The new check passes, and no previously passing check fails (the directory-search
      failures caused by the local credentials stay as they are)

## 5. Documentation and intake

- [x] 5.1 Describe the behaviour after a logout elsewhere in `docs-keycloak.md`: navigations are sent to the login,
      sub-resources get 401
- [x] 5.2 Update `AI/architecture.md` (session/auth observations)
- [x] 5.3 Delete the entry "Bug: Weiße Seite nach Logout anderswo" from `AI/open-proposals.md`
