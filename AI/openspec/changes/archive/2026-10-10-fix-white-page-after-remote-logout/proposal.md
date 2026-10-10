Source: AI/open-proposals.md — "Bug: Weiße Seite nach Logout anderswo"

## Why

Someone who signs out of Keycloak while an htl.dev page is still open — directly at Keycloak, or in another application on the same realm — gets a white page on the next link they click, instead of the login. A failed token refresh leaves the local session looking authenticated but with its tokens nulled out. The page is still rendered, but every request after it throws in the refresh middleware. Express 4 does not catch a rejected async middleware, Node 24 terminates the process on an unhandled rejection, and the container restarts. That restart is the only reason a reload afterwards lands at the login correctly, and it also throws out every other user's session (sessions are held in memory).

The mechanism is read from the code, not from a log. Both production containers were recreated by the deploy at 11:15 on 2026-10-10, so the logs from the time of the observation are gone. The symptoms fit it exactly: the HTML arrives, every sub-resource fails with an empty MIME type (no response at all), and the reload stream keeps reconnecting with backoff (server gone).

## What Changes

- A refresh rejected by the identity provider ends the local session there and then, instead of setting a `needsReauth` flag nobody reads and leaving `req.isAuthenticated()` true.
- The request that ran into the dead session is sent to authenticate again. A page navigation is redirected into the login and comes back to the page it asked for. A request a page makes on its own (scripts, modules, styles, images, `fetch`) gets `401` instead of a redirect to an HTML login it cannot use.
- The refresh middleware no longer dereferences a token that may be absent. Any error it raises goes to Express's error handling instead of becoming an unhandled rejection.
- A failure in one request can no longer terminate the process and with it every other user's session.
- A verification check revokes a session's refresh token at the identity provider and asserts that the next navigation lands at the login and that the server is still running.

## Capabilities

### New Capabilities
- `session-lifecycle`: what the application does when a session it holds ends at the identity provider. That covers a refresh that is refused, the request that discovers it, and the guarantee that one session's failure does not take down the others.

### Modified Capabilities
<!-- none — deployment-surface's "Sessions are held in memory" stays as is; this change removes an unintended restart, not the accepted one -->

## Impact

- `middlewares/keycloak-middleware.js`: `refreshAccessToken`, the refresh middleware, `checkAuthenticated`.
- `app.js`: an error handler at the end of the chain, if one is needed for errors passed on from the middleware.
- `test/`: a new check in the Puppeteer harness. It ends the session at Keycloak through the demo realm (no admin rights needed; end-session or the refresh-token revocation endpoint).
- No API, dependency or configuration changes. The deploy goes through the usual safeLearn → secureLectures sync.
