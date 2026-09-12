## Context

See proposal.md — Why. What shapes the approach:

- `fetchAllDirectoryUsers` (middlewares/directory-service.js) already runs in two measurable phases and already has the callbacks to observe them: the `onPage` hook `fetchAllUserPages` fires per page, and `mapWithConcurrency`'s `onProgress` for the role-mappings pass. Both totals are known — `serverCount` from `GET users/count` for the first phase, `users.length` for the second. Today those callbacks only `console.log`.
- A fetch is already deduplicated to one in-flight run (`directoryUsersFetchPromise`), so "is a fetch running" is one variable, not a set.
- `searchDirectory` awaits `fetchAllDirectoryUsers()` unconditionally, which is what makes the HTTP request hang for minutes. The route in app.js has no timeout of its own.
- The plugin reaches the server through Obsidian's `requestUrl`, which has no configurable timeout, and a reverse proxy in front of the deployment typically severs an idle request long before a multi-minute fetch finishes — so the current blocking wait is not merely invisible, it is not reliably survivable either.
- Plugin releases reach other vaults through the Obsidian store with roughly a day's delay (see `AI/memory/plugin-update-paths.md`), so old-plugin/new-server and new-plugin/old-server both occur in practice.

## Goals / Non-Goals

**Goals:**
- A wait is legible: phase and progress, updating, wherever the plugin waits.
- The state of the directory data is inspectable without pulling the directory down.
- Neither version-skew direction produces a worse experience than today.

**Non-Goals:**
- Fixing or speeding up the fetch itself, including the `first=14200` case in `AI/open-proposals.md`. This change makes a slow fetch visible; it does not make it fast.
- Streaming partial directory results to the plugin. The 202 carries progress only; results arrive whole.
- Any progress reporting for the browser app — nothing there consumes this endpoint.
- Persisting progress across a server restart beyond the fetch checkpoint that already exists.

## Decisions

### Progress is module state written by the callbacks that already exist

A single module-level record in `directory-service.js` — phase, done, total, started-at — updated in place by the `onPage` and `onProgress` callbacks, and by the count/disk-cache steps that precede them. Exported as a `getDirectoryStatus()` that copies it out alongside what the in-memory cache holds.

*Why not an event emitter or a job registry:* there is at most one fetch, it lives in one function, and the consumers are two HTTP handlers in the same process. A registry would add a lifecycle to keep correct with nothing asking for one.

Phases: `idle`, `counting` (the `users/count` and freshness checks), `entries` (pagination), `roles` (role-mappings). `counting` has no total — see the spec's "A fetch has not yet determined its total".

### The status endpoint reports raw `done`/`total` per phase, not one blended percentage

The client renders the percentage. A single blended bar would need a fixed weighting between the two phases, and their relative cost is realm-specific — on the production realm the role-mappings pass dominates, on the demo realm it is negligible. A weighting invented here would produce a bar that stalls and then leaps, which is precisely the "is it broken?" impression the change exists to remove.

### Search answers from stale data and refreshes behind it; 202 is for a cold cache only

`searchDirectory` stops awaiting a refresh. It answers from whatever the in-memory cache holds, even past `directoryCacheTtlMs`, and kicks off the refresh unawaited. Only when nothing is cached at all — a cold start with no usable disk cache — does the route answer 202.

*Why:* without this, every search in the first minutes after the TTL expires would go back to 202 and polling, on a realm where the refresh takes minutes. Stale-by-minutes directory data is not a real hazard here — Gerald edits the realm by hand a few times a year (`AI/memory/directory-realm-update-cadence.md`) — whereas re-entering the "nothing is happening" state every ten minutes is exactly the reported problem. The TTL keeps its current meaning: when to *start* a refresh, not when to stop serving.

*Alternative considered:* keep blocking when the cache is merely stale and 202 only on a cold cache. Rejected — the blocking path is the bug, and "stale" is the common case, not the rare one.

### The plugin polls the status endpoint, not the search endpoint

On a 202 the plugin polls `GET /api/admin/directory/status` every 2 s and re-issues the search only once the status reports no fetch running. Re-issuing the search as the poll would mean each tick risks materializing and transferring ~14,000 entries.

If the status reports no fetch running while the plugin still holds a 202, that is a failed or abandoned fetch: the plugin re-issues the search exactly once more, and shows the existing failure indication if that also comes back 202. This bounds the loop — a search that keeps starting a fetch that keeps dying can never become an endless poll.

### Version skew is handled in both directions

- **New server, old plugin:** the old client tests `status >= 400`, so a 202 falls through to its `!Array.isArray(body)` check and surfaces as "The directory search failed." Worse wording than the new path, better than the current silent hang, and it resolves itself once the fetch completes. Accepted rather than gated behind an opt-in query parameter: a parameter would preserve the blocking path indefinitely, and that path is what is being removed.
- **Old server, new plugin:** the status endpoint answers 404. The plugin treats any non-`ok` status response as "state unknown", shows the settings summary as unknown, and — never having received a 202 from an old server — simply waits on the search as it does today.

### The settings summary polls only while the tab is visible

Started in `display()`, cleared in `hide()`, and it updates that one line's text rather than calling `display()` again — rebuilding the tab would drop focus out of the text fields, the same reason the instance-URL field already refreshes on blur rather than per keystroke.

### The status endpoint is registered next to the search route, under the same gate

Same `verifyCallerIdentity` call, same placement ahead of `checkAuthenticated`, same 403 shape. It reads process memory and issues no Keycloak call, so it cannot itself become slow — which matters, since the settings tab polls it.

## Risks / Trade-offs

- **A 2xx that carries no results is a contract change** → Only the plugin consumes this route; the old-plugin behaviour degrades to a visible error rather than silence, and `http/plugin-query-api.http` plus docs are updated in the same change.
- **Serving stale data indefinitely if every refresh fails** → The status endpoint reports when the data was built, the info view shows it, and the settings line shows it without opening anything; that is exactly the blind spot this closes.
- **Polling adds request volume** → One request per 2 s per waiting dialog, against an endpoint that touches no external service; the settings poll stops when the tab is hidden.
- **The role-mappings percentage advances unevenly** → It is driven by completion count across a concurrency pool of 8, so it is monotonic but bursty. Accepted: monotonic and bursty still reads as progress.
- **A fetch that dies leaves `idle` with no data, and the plugin re-searching restarts it** → Bounded by the single retry above; a persistently failing fetch shows as a failure rather than as a loop.

## Migration Plan

1. Server first (safeLearn, then secureLectures per `AI/memory/securelectures-sync-order.md`) — old plugins keep working, degraded to a visible error only in the cold-cache window.
2. Plugin release afterwards, per `AI/memory/plugin-release-process.md`.
3. Rollback is per side and independent: reverting the server restores blocking search and 404s the status endpoint, which the new plugin already handles as "state unknown".
