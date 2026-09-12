---
name: directory-service-credentials-invalid
description: "Local .env's DIRECTORY_SERVICE_CLIENT_ID/_SECRET are rejected by the real Keycloak realm, so directory search never holds data (since 2026-09-12 it answers 202 forever, not 502)"
metadata: 
  node_type: memory
  type: project
  originSessionId: be273af7-2f17-4ff8-8dfb-879001a396f3
  modified: 2026-09-10T06:27:27.224Z
---

The local `.env`'s `DIRECTORY_SERVICE_CLIENT_ID`/`DIRECTORY_SERVICE_CLIENT_SECRET` (in `/mnt/data/source/HTL/safeLearn/.env`) are rejected by the real `safeLearn` Keycloak realm at `auth.unterrainer.info` with `invalid_client (Invalid client or Invalid client credentials)`.

**Why:** Discovered 2026-09-10 while manually verifying `plugin-directory-multi-select` — started the real local server and did a real PKCE login against the demo realm. `GET /api/admin/directory/search` throws in `getDirectoryServiceToken()` (`middlewares/directory-service.js`) for every query (empty or not), so no directory data is ever held. This reproduces as 6 failures in `npm test`'s `directory search` suite (`test/checks/directory-search.js`) — every check that expects a `200`; the checks that expect a refusal (`student token`, `no bearer`, `invalidated token`) still pass because those never reach the directory-service client at all, and so do the three `directory status` checks, since that endpoint reads process memory and needs no Keycloak identity of its own.

Since `show-directory-fetch-progress` (2026-09-12) the **symptom changed**: the endpoint no longer answers `502`. A search that has nothing to match against answers `202` and starts a fetch behind itself, so a dying fetch now presents as a `202` that never resolves. `GET /api/admin/directory/status` is what tells the two apart — `{"fetching": false, "phase": "idle", "entries": null}` right after a `202` means the fetch died, not that it is slow.

**How to apply:** A never-resolving `202` (or, before 2026-09-12, a `502`) from directory search in this environment is almost certainly this stale/invalid credential, not a code defect — confirm against this before debugging the search logic itself. Either the Keycloak-side `DIRECTORY_SERVICE_CLIENT_ID` client was deleted/rotated, or the local `.env`'s secret is a stale copy. Whoever administers the realm needs to reissue the secret (or recreate the service-account client, `view-users` role) and update `.env`. See [[plugin-login-state-missing]] for a second, unrelated pre-existing gap found the same session.
