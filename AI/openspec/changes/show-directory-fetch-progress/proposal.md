## Why

When the server has no usable directory cache it fetches the whole realm before answering — against `auth.htl-leonding.ac.at` (14,289 users) that takes minutes, and `GET /api/admin/directory/search` simply holds the HTTP request open for all of it. The plugin waits inside a single `requestUrl` with nothing to show, so a teacher who opened the person picker or "Show directory info" sees an empty dialog that never fills in and concludes the feature is broken. The server already knows exactly how far along it is — it logs `role-mappings 45% (6430/14289)` to its own console — but nothing carries that outside the container.

The same gap makes the cache itself invisible: nobody can tell from the plugin whether the directory they are looking at was fetched minutes ago or is a day-old disk cache with skipped records, and the one view that could say so ("Show directory info") is reachable only from the command palette, where a person who does not already know it exists will not find it.

## What Changes

- The directory search endpoint stops holding a request open across a running fetch. While no answerable directory data exists yet it answers immediately with `202` and the fetch's progress (phase, records done, total) instead; the caller polls until a `200` carries the results. **BREAKING** for any caller that assumes a `2xx` from this endpoint always carries a result array.
- A new, cheap status endpoint reports whether a fetch is running, which phase it is in and how far along, plus the state of the cache behind it (entry count, when it was built, how many records were skipped, whether it came from memory or disk) — without pulling the full directory down to find out.
- The server tracks its fetch phases as observable state rather than only as log lines: counting, paginating users, resolving role-mappings, idle.
- Every place in the plugin that waits on a directory answer — the person picker, the directory info view, and the "list classes" command — shows the running fetch's phase and percentage while it waits, and keeps itself updated until the answer arrives, instead of showing nothing.
- The plugin's settings tab gains a button that opens the directory info view, so it is discoverable without the command palette, plus a one-line cache summary next to it (or the running fetch's progress while one is running).
- The directory info view gains a cache section showing the full breakdown the status endpoint reports.

## Capabilities

### New Capabilities
- `directory-fetch-status`: The server reports the state of its own directory cache and of any directory fetch currently running — phase, progress, and what the cached data is — to the same teacher/admin identities that may search, without requiring a search to find out.

### Modified Capabilities
- `directory-search`: A search that cannot be answered yet reports the in-progress fetch instead of holding the request open until it completes.
- `plugin-directory-search`: The picker and the "list classes" command show a running directory fetch's progress while they wait, rather than waiting silently.
- `plugin-directory-info-view`: The view shows a running fetch's progress while it waits, shows the state of the cache its data came from, and is reachable from the plugin's settings as well as from the command palette.

## Impact

- `middlewares/directory-service.js`: fetch progress becomes tracked state exported for the routes; `searchDirectory` gains a non-blocking form that can report "not yet".
- `app.js`: the `GET /api/admin/directory/search` handler's response contract, plus one new status route registered alongside it under the same `verifyCallerIdentity` gate.
- `AI/plugin/main.ts`: the `searchDirectory` client (polling and progress reporting), `NameListModal`'s directory search, `DirectoryInfoModal`, the "list classes" command, and `SafeLearnSettingTab`.
- `AI/plugin/styles.css`: the progress and cache-summary elements.
- `test/directory-service.test.js` and the plugin test harness; `http/plugin-query-api.http` for the new route.
- No Keycloak-side change: the status endpoint reads state the server already holds and issues no new admin-API call.
