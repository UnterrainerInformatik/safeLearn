Source: AI/open-proposals.md, entry **Live-Ansicht: "bound to browser" statt "Release to another browser"** (section *Prüfungsmodul-UI*, design review of 2026-10-18, decided by Gerald the same day).

## Why

In the live view every writing student carries a button **Release to another browser**. It lifts the binding of the attempt to the browser that started it, so the student can go on on another device. Without an explanation nobody understands what it does, and the teacher cannot see which browser an attempt is bound to at all: the server keeps only a hash of the browser's secret. Before the first sittings with real classes (pilot on 2026-10-19), the teacher should see the binding and lift it with a button whose name says what it does.

## What Changes

- **New column "Bound to browser"** in the live view's participant table. It shows the bound browser shortened to browser, major version and operating system (e.g. `Firefox 131 · Windows`). The full browser string is shown on mouse-over and, for touch devices, behind a small info button in the cell that unfolds it in place.
- **The button is renamed "Unbind browser"** and stays without confirmation (Gerald, 2026-10-18). After unbinding the cell says the attempt waits for the next browser; once a browser opens it, the cell shows that one, without the page being reloaded.
- **The browser string is stored when an attempt is bound**: at start and at every re-binding after an unbind. Attempts bound before this change show "unknown".
- **Refused browsers keep their string too** (proposed default, see design Open Questions): the "Other browsers" cell shows the shortened string of the most recent refused browser, the full string the same way as above.
- Both strings live and die with the attempt; no new place keeps them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `online-test`: the live view shows which browser an attempt is bound to and which one was refused last, and the teacher's action is called "Unbind browser". The capability still lives in the open change `exam-online-tests`; this change adds a requirement to it rather than modifying one, so it applies whether or not `exam-online-tests` is archived first.

## Impact

- `exam/migrations/`: a new migration adding the browser string to `attempt` and `refused_device`.
- `exam/attempts.js` (`startAttempt`, `checkDevice`, `releaseAttempt`), `exam/routes-attempts.js` (passes the request's `User-Agent`), `exam/live.js` (participant snapshot), a small new module that shortens a browser string.
- `exam/client/live.js` and `css/exam.css`: the new column, the info button, the renamed button.
- `i18n/en.json`, `i18n/de.json`: new and renamed keys under `exam.live`.
- `test/exam-tests.test.js` and the harness checks of the live view.
- No new dependency, no change to the student's pages.
