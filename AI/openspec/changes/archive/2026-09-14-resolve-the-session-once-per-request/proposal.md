## Why

Every single permission question SafeLearn asks costs one HTTP request to Keycloak. `hasRoles` in `utils.js` opens with `await getUserAttributes(req)`, and that function (`middlewares/keycloak-middleware.js`) is an uncached `fetch` against `…/realms/<realm>/account`. The same call also reads `keycloak.json` from disk synchronously, on the event loop, every time.

A directive is not asked about once per request. It is asked about once per directive. Counted against the production corpus in `secureLectures` — 279 files, 137 of them carrying a whole-file directive — one ordinary page view runs:

| Caller | Checks |
| --- | --- |
| `getDirectoryListing` → `resolveFileVisibility`, per file with a directive | 137 |
| `sanitizeAndParseMarkdown` → `resolveFileVisibility` for the requested file | 1 |
| `removeForbiddenContent`, per inline `@@@` block of that file | up to ~30 |
| `getTopBar`, `getTopdownMenu` | 2 |
| `setUserAttribute("lastVisitedUrl", …)`, which re-reads the attributes itself | 1 read + 1 write |

That is roughly **140 to 170 `/account` requests to Keycloak for one page**, where the session already holds everything needed to answer them: the access token is fetched once at login and refreshed only within 60 seconds of expiry, and `rolesCalculated` is derived once and kept in the session. Only the three view preferences (`ve`, `vt`, `va`) are re-fetched — and those change only when the user clicks in this application's own settings menu.

There is a correctness argument next to the load argument. Because each check re-reads the preferences and re-reads `Date.now()`, a single request has no fixed answer to "who is this and when is it". A preference written between two checks, or a time window crossed between two checks, leaves a page whose navigation tree disagrees with its own body. Worse, `getUserAttributes` swallows a failed fetch and returns `{}`, and `hasRoles` then falls back to `{ve: 0, vt: 0, va: 0}` — so one failed request out of 140 silently downgrades one block of the page to the student view while the rest of the page stays a teacher's. The existing `role-resolution` requirement that the role set must not depend on evaluation order holds today only by accident, because every call rebuilds it from scratch.

And it is the wall in front of the planned corpus search: a substring search over all visible content needs the whole-file check for all 137 gated files plus the block check for all 407 inline blocks — about **540 Keycloak requests per query**, multiplied again by every keystroke of an incremental search.

## What Changes

- **A session's permission state is resolved once per request into a snapshot** carried on `req`: the role set as `hasRoles` assembles it today (client roles, LDAP units, display name, reserved-name rejection, plural canonicalization and aliasing), the three view preferences, and one reference timestamp for the request.
- **`hasSomeRoles` becomes a decision against that snapshot and performs no I/O.** Its signature and every call site stay as they are — `resolveFileVisibility`, `removeForbiddenContent`, `getTopBar` and `getTopdownMenu` keep passing `req`. What changes is that the answer is now a set intersection over data already in hand.
- **At most one identity-provider lookup per request.** The snapshot is built lazily on first need, so a request that asks no permission question makes no lookup at all.
- **`keycloak.json` is read once at startup**, not once per check.
- **`setUserAttribute` stops re-reading what the request already holds**, and updates the snapshot with what it wrote, so a request that changes a preference stays consistent with itself afterwards.
- **The student-view downgrade and the view pseudo-roles are resolved against the snapshot**, unchanged in meaning. `#exam`, `#practice` and `#answer` keep the rules `role-resolution` already fixes, including that `#practice` is the exact complement of `#exam`.
- **A failed lookup is handled once, for the whole request, and logged** — instead of today's per-check fallback that can leave one page built from two different identities. Whether the fallback stays at today's defaults or becomes a refusal is a decision for `design.md`; either way it stops being per-block.
- Explicitly *not* part of this change: memoizing the decision per distinct directive. Once the snapshot exists, a check costs a set lookup, and a cache in front of it would only be another thing that can go stale.

**No breaking change.** Every rule in `role-resolution` keeps its meaning; what changes is how often the application asks Keycloak to restate the same answer, and that a request now answers it the same way from start to finish.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `role-resolution`: two new requirements. First, that the whole evaluation context — roles, view preferences and the reference time for permission windows — is fixed for the duration of a request, so that every directive evaluated during one request is decided against the same session state, and the existing order-independence requirement holds by construction rather than by repetition. Second, that resolving that context queries the identity provider at most once per request, and not at all for a request that asks no permission question.

## Impact

**Code**

- `utils.js` — `hasRoles`, `hasSomeRoles`, `getClientRoles`. The assembly of the role set moves behind the snapshot; the rules it applies do not change.
- `middlewares/keycloak-middleware.js` — `getUserAttributes` and `setUserAttribute` gain the snapshot as their source and sink; the refresh middleware is the natural place to invalidate it when a token refresh replaces the session's claims.
- `app.js` — the `/` redirect route and the two `lastVisitedUrl` writes read the snapshot instead of fetching.
- `obsidian.js` — call sites unchanged.

**Out of scope**

- `middlewares/directory-service.js` `verifyCallerIdentity` authenticates the Obsidian plugin by bearer-token introspection and never reaches `hasRoles`. It belongs to `plugin-directory-auth` and is untouched here, even though its comments note that it merges the same two role sources.

**Verification**

- `npm test` drives the Puppeteer harness against the shared demo accounts of the Keycloak demo realm; the teacher/student toggle, the exam and answer views and the hidden-file cases are exactly the behavior that must come out unchanged.
- Worth adding: an assertion on the *number* of identity-provider lookups a rendered page causes, so the property this change buys cannot quietly regress.

**Enables**

- The planned corpus search. It is not part of this change, but it is the reason the cost per check stops being an internal detail: the search reuses `hasSomeRoles` for every candidate rather than deciding visibility itself, and that is only affordable once a check is free.
