## 1. Server: fetch progress as observable state

- [x] 1.1 Add a module-level progress record to `middlewares/directory-service.js` (phase, done, total, startedAt) with the phases `idle`, `counting`, `entries`, `roles`, plus a setter used by the phases below.
- [x] 1.2 Set the phase to `counting` at the start of `fetchAllDirectoryUsers`, covering `fetchDirectoryUserCount`, the disk-cache freshness check and the checkpoint check; leave `total` absent for this phase.
- [x] 1.3 Drive the `entries` phase from the existing `onPage` callback — `done` from `nextFirst`, `total` from `serverCount` — alongside the checkpoint writes already there, seeded from `resumeFrom.nextFirst` so a resumed fetch does not report starting from zero.
- [x] 1.4 Drive the `roles` phase from `mapWithConcurrency`'s existing `onProgress` (`completed`/`total`), keeping the 5%-step console logging unchanged.
- [x] 1.5 Reset the phase to `idle` when the fetch settles, in both the success and the failure path, so an abandoned fetch never leaves a stale "running" state behind.
- [x] 1.6 Export `getDirectoryStatus()` returning a copy of the progress record plus what is currently held: entry count, when it was built, how many records were skipped — and nothing about any skipped record beyond what a search result already carries. Reading it SHALL NOT start a fetch.
- [x] 1.7 Unit-test `getDirectoryStatus()` in `test/directory-service.test.js` against a stubbed fetch: idle with no data, each phase with its totals, `counting` reporting no total, and reset-to-idle after a failure.

## 2. Server: search stops blocking

- [x] 2.1 Split `fetchAllDirectoryUsers` so the cache read and the refresh are separable: a synchronous "what is held right now" accessor, and the existing deduplicated refresh, startable without awaiting it.
- [x] 2.2 Change `searchDirectory` to answer from whatever is held — including past `directoryCacheTtlMs` — and to start an unawaited refresh when the TTL has expired, instead of awaiting one.
- [x] 2.3 Make `searchDirectory` report "not ready" (rather than awaiting, erroring, or answering empty) when nothing is held at all, and have that path start a fetch if none is running.
- [x] 2.4 Update the `GET /api/admin/directory/search` handler in `app.js` to answer `202` with the progress payload for the "not ready" outcome, and `200` with results otherwise; leave the `403` and `502` paths untouched.
- [x] 2.5 Extend `test/directory-service.test.js`: a cold cache reports "not ready" and starts a fetch; a stale cache answers from held data and starts a refresh without awaiting it; a repeated search after completion answers with results.

## 3. Server: the status endpoint

- [x] 3.1 Register `GET /api/admin/directory/status` in `app.js` immediately next to the search route, ahead of `checkAuthenticated`, behind the same `verifyCallerIdentity` gate with the identical `403` shape.
- [x] 3.2 Answer it from `getDirectoryStatus()` alone — no Keycloak call, no fetch started.
- [x] 3.3 Add both routes' new shapes to `http/plugin-query-api.http` (a `202` search, a status call while fetching, a status call while idle).
- [x] 3.4 Document the endpoint and the `202` contract in `docs-technical-details.md`, and the teacher/admin gate it shares with search in `docs-keycloak.md` where the directory-service client is described.

## 4. Plugin: client-side progress

- [x] 4.1 Extend `DirectorySearchResult` in `AI/plugin/main.ts` with a `"fetching"` outcome carrying phase, done and total, and return it for a `202`.
- [x] 4.2 Add a `directoryStatus()` client call for the new endpoint, reporting "unknown" for a `404` or any non-ok response, so an old server degrades rather than fails.
- [x] 4.3 Add a shared "wait for the fetch, then retry the search" helper: poll the status every 2 s while a fetch is running, re-issue the search once it reports idle, allow exactly one further `202` before giving up with the existing failure indication, and stop cleanly when the caller is closed.
- [x] 4.4 Render progress from one shared formatter (phase name plus percentage, or phase name alone while no total is known) so every waiting surface words it identically.

## 5. Plugin: the waiting surfaces

- [x] 5.1 Show the fetch and its progress in `NameListModal`'s directory search, in the existing `.safelearn-directory-status` line, distinct from unreachable/failed, and fill the picker in when the fetch completes.
- [x] 5.2 Show the fetch and its progress in `DirectoryInfoModal` while it waits, and fill its sections in on completion without reopening.
- [x] 5.3 Show the fetch and its progress for the "list classes" command, and produce the class list once it completes.
- [x] 5.4 Cancel any running poll when a modal closes, so a closed dialog leaves nothing polling behind.
- [x] 5.5 Style the progress element in `AI/plugin/styles.css`, following the existing directory-status conventions.

## 6. Plugin: settings entry point and cache state

- [x] 6.1 Add a button to `SafeLearnSettingTab` that opens `DirectoryInfoModal`, shown only with an instance configured and the teacher/admin role held — the same condition guarding the palette command.
- [x] 6.2 Add the one-line state summary beside it: entries held and how long ago they were built, the fetch's progress while one is running, or "unknown" when the status cannot be determined.
- [x] 6.3 Refresh that line on an interval started in `display()` and cleared in `hide()`, updating only its text rather than rebuilding the tab.
- [x] 6.4 Add a directory-state section to `DirectoryInfoModal`: entry count, when it was built, skipped-record count, and whether a fetch is running.

## 7. Verification and release

- [x] 7.1 Extend `test/obsidian/plugin.test.js` for the new surfaces: a `202` shows progress rather than an empty dialog, the result appears after completion, the settings button opens the view, and the settings line reports the state.
- [x] 7.2 Run `npm test` (browser harness plus content verification) and confirm nothing in the existing directory paths regressed.
- [x] 7.3 Verify against a real cold cache: restart the server with no disk cache, open the picker and the info view while the fetch runs, and confirm the progress advances through both phases and resolves into results.
- [x] 7.4 Update `AI/architecture.md` with the status endpoint and the non-blocking search contract.
