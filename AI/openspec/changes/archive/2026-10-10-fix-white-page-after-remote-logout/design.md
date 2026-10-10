## Context

See proposal.md (Why) for the failure chain. The relevant state in `middlewares/keycloak-middleware.js`:

- Sessions live in an `express-session` MemoryStore. Passport's `deserializeUser` hands back the stored object itself, so writing to `req.user` also writes to the session, and the change is saved when the response ends.
- The refresh middleware is an `async` function that reads `req.user.accessTokenDecoded.exp` for every request that has a `req.user`, and calls `refreshAccessToken` once fewer than 60 s remain.
- When `client.refresh` throws, `refreshAccessToken` sets the tokens to `null` and sets `req.session.needsReauth = true`, and nothing ever reads that flag. `checkAuthenticated` only asks `req.isAuthenticated()`, which is still true.
- `checkAuthenticated` answers every unauthenticated request with `302 /test`, whatever kind of request it is.
- Express is 4.22 and does not forward a rejected promise from middleware. Node is 24, which terminates the process on an unhandled rejection. Compose restarts the container (`restart: unless-stopped`).
- `sanitizeAndParseMarkdown` in `app.js` calls `refreshAccessToken` unconditionally for every Markdown page it renders (and so for `/convert`), and `GET /userattributes` does the same. These renewals run inside the route handlers, after `checkAuthenticated` has already let the request through. The handlers are `.then` chains without a `.catch`, so anything that rejects in them is an unhandled rejection too.
- Every rendered page already asks the Keycloak account endpoint for the user's attributes (`fetchAccount`, one lookup per request; see role-resolution). If that fails, the request settles on default preferences.

## Goals / Non-Goals

**Goals:**
- A dead session is detected and ended in the request that finds it, and the user ends up at the login.
- Sub-resources and programmatic requests get a status they can act on, not a login page.
- No path through authentication or refresh can reject unhandled.

**Non-Goals:**
- Back-channel logout, where Keycloak pushes the logout to the application. It would need a client setting in the realm and a public endpoint. The pull-based detection here is enough for the symptom.
- Making the open page notice the logout by itself, before the user does anything. The page reacts on its next request, not proactively.
- Changing the in-memory session store (deployment-surface keeps it deliberately).

## Decisions

**1. Ending a session = `req.logout()` plus regenerating the session, not a flag.**
Inside `refreshAccessToken`, an `invalid_grant` logs the user out (`req.logout`) and destroys the session's identity, so the very next check in the same request sees `isAuthenticated() === false`. `needsReauth` goes away. *Alternative:* keep the flag and read it in `checkAuthenticated`. That leaves a half-alive `req.user` with null tokens that every reader of `req.user` has to guard against, which is the shape that caused the crash.

**2. Only `invalid_grant` ends the session; other refresh failures leave it alone.**
A network error or a 5xx from Keycloak says nothing about the session, and logging the user out would only redirect them to a login that is itself unreachable. The request continues with the current token. If that token has really expired, the account lookup fails and the page renders with the defaults, as role-resolution already specifies for a failed lookup. The error is logged. *Alternative:* end the session on any failure, as the current code effectively intends. Rejected, because a short Keycloak outage would then log everyone out.

**3. Navigation vs. sub-resource is decided by `Sec-Fetch-Mode` / `Sec-Fetch-Dest`, falling back to `Accept`.**
A request with `Sec-Fetch-Mode: navigate` (or, without Fetch Metadata, one whose `Accept` contains `text/html`) is redirected to `/test`, as before. `/test` stores `originalUrl` and the callback returns there. Everything else gets `401` with an empty body. That includes `/hot-reload`, but only once it requires a session, which it does not today. It stays public, and an SSE client that reconnects against a live server is harmless. All target browsers send Fetch Metadata. The `Accept` fallback covers older clients and tools. *Alternative:* a path-based list of asset prefixes. Rejected: it duplicates the static mount allowlist in `app.js` and drifts from it.

**4. A `401` from the account endpoint triggers one forced renewal.**
Markdown pages need no help here: the forced renewal in `sanitizeAndParseMarkdown` already finds the dead session on the next page view (Decision 6 makes it act on that). But the routes that render or answer without that renewal (`/` resolving the start page, `/search`) only renew within the 60-second window, and right after a remote logout the access token is usually still well within its lifetime. Keycloak's account endpoint rejects a token whose session no longer exists, and every such request already asks it once through the permission context. On a `401` there, `fetchAccount` calls `refreshAccessToken` once. If Keycloak refuses that renewal, Decision 1 ends the session and the `SessionEndedError` of Decision 6 propagates out of the permission context, instead of the context settling on default preferences as it does for other lookup failures. The request is then answered as unauthenticated. This adds no lookup, only one token call on the failure path. *Alternative:* rely on the expiry window for those routes. Then `/search` would keep answering a logged-out session for up to the token lifespan.

> Verified (tasks 1.2): after a logout at Keycloak the demo realm's account endpoint answers `401` for the still-unexpired access token (`200` before).

**5. The refresh middleware is null-safe and forwards errors.**
It reads `req.user?.accessTokenDecoded?.exp`. A session without a decodable token counts as ended (Decision 1), and the middleware wraps its body in `try { … } catch (e) { next(e) }`. A final Express error handler in `app.js` logs the error and answers 500. A `process.on('unhandledRejection')` safety net is **not** added: it would hide the next bug of this kind instead of routing it, and the spec requirement is met by forwarding.

**6. A session that ends mid-request is a `SessionEndedError`, answered by the final error handler.**
`refreshAccessToken` throws a `SessionEndedError` after it has ended the session (Decision 1). It does not return quietly. Every caller that runs after `checkAuthenticated` therefore stops instead of rendering on without a `req.user`. `sanitizeAndParseMarkdown` rethrows it instead of turning it into an error string. The handler chains for `.md`, `/convert`, `/search`, `/` and `/userattributes` forward rejections with `.catch(next)`. The final error handler in `app.js` answers a `SessionEndedError` the way `checkAuthenticated` answers a missing session, with the same helper: navigation → `/test`, everything else → empty `401`. Any other error is logged and answered with `500`. The refresh middleware ahead of `checkAuthenticated` catches `SessionEndedError` itself and calls `next()`, so that `checkAuthenticated` decides there, as for any request without a session. *Alternative:* move the forced renewal ahead of `checkAuthenticated`. That changes when the dark-mode claim is picked up for `/convert` and still leaves the handler chains without a `.catch`, which the third requirement needs anyway.

## Risks / Trade-offs

- [Some client sends neither Fetch Metadata nor `text/html` in `Accept`, but navigates (old Obsidian webviews, curl).] → It gets a 401 instead of a redirect. That is acceptable for tools. The Obsidian plugin uses its own token-based auth and does not go through this path.
- [Decision 4 turns a transient 401 from the account endpoint into a token renewal.] → It is only one call, and if the renewal succeeds the request goes on as before, so the cost is negligible.
- [The new check needs its own login, because it ends the session it uses.] → It uses `openSession`, not `sharedSession`, and adds exactly one authentication to the run. That number is stated in the check, consistent with the browser-verification requirement against multiplying authentications.

## Migration Plan

No data or configuration migration. Deploy through the usual safeLearn → secureLectures sync. Sessions held at deploy time are discarded once, as with every deploy. To roll back, revert the commit.
