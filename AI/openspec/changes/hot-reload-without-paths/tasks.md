## 1. Check first

- [x] 1.1 Add two test corpus files for the check (one open, one under `@@@ teacher`), following the naming of the existing `test-*` corpus files, and register them wherever the content suite lists its fixtures. Verify: `npm test` still passes the corpus checks.
- [x] 1.2 In `test/checks/deployment-surface.js`, add a check that starts `startAnonymous({ env: { NEXT_AUTOSCAN: "true" } })` and subscribes from Node with `currentFile` set to the open fixture. A second subscription declares both fixture paths strung together. The check modifies both fixtures, collects `reload` events until a quiet period, restores both files in `finally` and stops the instance. Assert: no event on either stream contains `md/` or a `files` key; the first stream got at least one event equal to `{ type: "page" }`; the second got none. Verify: the check fails on the current code, naming the leaked path.

## 2. Server

- [x] 2.1 In `broadcastReloadSSE` (`app.js`), send `{ type: "page" }` without `files`, and select page recipients by `filesChanged.includes(currentFile)` (exact path) instead of `endsWith`/`includes`. Update the comment to state why no path is sent. Verify: check 1.2 passes.

## 3. Client

- [x] 3.1 In the hot-reload script in `obsidian.js`, reload on `type: "page"` without consulting `payload.files`, keep the `sl-writing` skip and the position save, and replace the `else` branch's log, which references an undefined `current`. Verify: `grep -n "payload.files" obsidian.js` is empty.
- [x] 3.2 Confirm that page, document and presentation views declare the file's `md/…` path as `currentFile` (open each view of a corpus file, read the `/hot-reload?context=` request). Verify: in all three views, editing the open file on a local instance with `NEXT_AUTOSCAN=true` reloads it and restores the position.

## 4. Docs and full run

- [x] 4.1 Describe the new check in the `deployment-surface.js` row of `docs-testing.md`, and add it to `test/coverage-map.json` if the map lists checks per requirement. Verify: the coverage map references the new requirement "The reload endpoint names no file".
- [ ] 4.2 Run `npm test`. Verify: green, apart from the known flaky checks (AI/memory/flaky-content-checks.md), which are re-run.
- [ ] 4.3 Remove the "Hot-Reload-Kanal nennt geänderte gesperrte Files" entry from `AI/open-proposals.md` when archiving. If Gerald wants the remaining guess oracle tracked, add it there as a new entry. Verify: the entry is gone.
