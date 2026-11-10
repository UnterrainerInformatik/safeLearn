## Context

`/hot-reload` (`app.js`) is registered before any session middleware and answers anyone. A client declares `context = { type, currentFile }` in the query string. `currentFile` is the decoded `location.pathname` without its leading slash, e.g. `md/POS/LT1-A.md`. With `NEXT_AUTOSCAN=true`, a chokidar watcher runs `scanFiles` on every change under `md/`, and `broadcastReloadSSE` sends:

- `{ type: "nav" }` to everybody when files were added or removed (and from the timed-permissions callback),
- `{ type: "page", files: diff.modified }` to every client whose `currentFile` `endsWith` or `includes` one of the modified paths.

The second payload is the leak. The recipient is selected correctly, but it receives all modified paths, including those of restricted files in the same scan. The client (`obsidian.js`, `reload` handler) uses `files` only to repeat the server's check, `payload.files.some(f => current.endsWith(f))`.

The exam module keeps its own authenticated stream (`exam/routes-live.js`) and is not affected. A test in `test/exam.test.js` (around `hotReloadPage`) dispatches hand-made `nav` events on the page's `EventSource`.

## Goals / Non-Goals

**Goals:**
- No corpus path ever travels over `/hot-reload`.
- Pages that are open on a modified file still reload, with position restore and the skip while a test is written, as before.
- Matching on the server cannot be widened by a crafted `currentFile`.

**Non-Goals:**
- Closing the guess oracle: a client that declares an exact path learns when that file is modified. This needs session-aware visibility on an endpoint that today runs before authentication, and that is a change of its own.
- Changing `nav` broadcasts. They carry no path today.
- Moving the endpoint behind authentication.

## Decisions

**Drop `files` from the payload instead of filtering it per client.** Filtering by visibility would need the client's session, and the endpoint has none. Filtering down to "only your own file" would work, but it repeats information the client already has. The empty notification is the smallest change that carries no information at all.

**Match by equality, not `includes`/`endsWith`.** `includes` lets one declared string like `md/a.md md/b.md …` match many files at once, so the oracle could test many guesses per connection. Real clients declare exactly the path of the file they render. Both sides use the `md/…` path relative to the app root (`scanFiles` returns `prefix + relative path`, and the client strips the leading slash and decodes). For them equality changes nothing. Before implementing, verify on the presentation and document views that their `location.pathname` is the file's `md/…` path. A view whose pathname differs would have to declare the file's path instead, and must not be matched more loosely.

**The client trusts the server's selection.** On `type: "page"` it reloads (after saving the position) unless the page is writing (`sl-writing`). This also fixes the current code where an unaffected `nav` on a Reveal deck falls into the `else` branch and logs `payload.files` without a declared `current`. That branch is tidied to a plain log.

**Test against a spawned instance with the watcher on.** The suite's main instance runs without `NEXT_AUTOSCAN`. `startAnonymous({ env: { NEXT_AUTOSCAN: "true" } })` gives an instance that watches the real `md/`. The check subscribes from Node (like `subscribeToReload`), modifies an open and a restricted test corpus file in the same moment, reads the first `reload` event, asserts `JSON.parse(data)` deep-equals `{ type: "page" }`, and restores both files in `finally`. A second subscription declares the two paths strung together and must get no event within the same window.

## Risks / Trade-offs

- [Watcher timing on a spawned instance: chokidar fires per file, so two edits may produce two scans and two events] → Read events until a short quiet period, and assert on each of them that no event contains a path. Assert at least one `page` event for the declared file.
- [An edit to `md/` while the main suite runs could trigger rescans elsewhere] → Only the spawned instance watches. The main instance has no watcher, and the existing staleness checks already edit corpus files the same way.
- [A view whose declared path is not exactly its file stops hot-reloading] → Covered by the verification in Decisions. If one exists, fix its declared path rather than loosen matching.
- [The guess oracle remains] → Stated in the spec as a known limit. It can go back to `AI/open-proposals.md` as a follow-up if Gerald wants it.
