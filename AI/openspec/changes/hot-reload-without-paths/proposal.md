Source: AI/open-proposals.md

## Why

`/hot-reload` answers without authentication. When the watcher finds modified corpus files, `broadcastReloadSSE` in `app.js` picks the clients whose declared `currentFile` matches one of them, and sends each of those clients the **whole** list of modified files (`{ type: "page", files: diff.modified }`). One sync often carries several files. A student who has `md/POS/index.md` open then receives `md/POS/LT1-A.md` in the same event when the teacher edits a test hidden under `@@@ teacher` the evening before and syncs both. The content stays secret, but the path and the time of the edit do not. This was noticed during the explore for `exam-offline-sittings` (2026-10-25).

The client does not need the list. The server has already decided that the page is affected, and the client only checks that decision again against its own path.

## What Changes

- A page reload notification carries only its kind, `{ type: "page" }`, and no file paths. The server keeps its per-client choice of who gets one.
- The server matches a client's declared `currentFile` to a modified file by exact equality instead of `endsWith`/`includes`. A declared context made of many paths strung together then no longer matches several files at once. Real pages declare exactly the path of their file, so they behave as before.
- The client reloads on every `page` event it receives (apart from the existing skip while a test is written). It no longer compares itself against a list. `nav` stays as it is.
- The `deployment-surface` requirement for the reload endpoint says what the endpoint carries: the kind of reload, and never a path.
- A check in `test/checks/deployment-surface.js` subscribes like an anonymous client, modifies a corpus file, and asserts that the event contains no path.

Out of scope: an anonymous client can still declare a guessed path as its `currentFile` and learn when that exact file is modified. Closing that would require an authenticated stream that checks visibility per session. It is recorded in `design.md` as a known limit.

## Capabilities

### New Capabilities

### Modified Capabilities
- `deployment-surface`: the unauthenticated reload endpoint carries no file paths, and a page notification goes only to a client whose declared file is exactly the modified one.

## Impact

- `app.js`: `broadcastReloadSSE` (payload, matching).
- `obsidian.js`: the hot-reload client script (`reload` handler).
- `test/checks/deployment-surface.js`: new check. `test/exam.test.js` (hand-fed stream) is checked for payloads that still carry `files`.
- `docs-testing.md`: describes the check.
- No new dependency. secureLectures gets the change through the usual merge.
