## Context

See proposal.md for the three reports. The relevant current state:

- **Class screen.** `/exam/sittings/<id>/screen` is a page of its own that embeds the same `sl-exam-live` element as the live view, with `screen: 1`. It opens its own `EventSource` on `/exam/api/sittings/<id>/events` and redraws the summary from `draw()` (snapshot) and `update()` (change). Its clock and time left are computed in the browser every second from the last server time, so they run even when no event ever arrives. That is why "everything else works" while the counts stand still. The existing browser test (`test/exam.test.js`, "the view for the class shows state…") checks only the first snapshot after the page loads, never a change after it.
- Reading the code does not settle why the screen's stream delivers no changes in production. Candidates, each consistent with what was observed:
  1. **Connection limit.** Over HTTP/1.1 a browser allows six connections per host. The teacher's live view (its stream plus the page's `/hot-reload` stream) and other open safeLearn tabs already hold some, and the screen's stream may wait in the queue. A queued `EventSource` stays `CONNECTING` and fires no `error`, so the view's fallback to polling (after three errors) never starts.
  2. **Session renewal on an idle page.** The stream sends `renew` when the access token is about to expire, and the client reconnects. The live view also makes ordinary requests that renew the session; the screen makes none. If the reconnect fails with 401, `poll()` drops every error except 403, so the screen goes quiet without saying so.
  3. **A proxy that buffers or cuts long-lived responses** on the way to babylon5.
- **Live link after the sitting.** `sittingLinks()` in `exam/client/tests.js` returns both the live-view and the class-screen link, and both callers (the course's list and the test's page) skip it when `sitting.state === "over"`. The live view itself, `liveSnapshot()` and the API have no such restriction: an ended sitting's live view already works when opened by its address.
- **Category tree.** `.sl-exam-tree-row` is a flex row: fold, name (`flex: 1 1 auto; overflow-wrap: anywhere`), tools (`flex: 0 0 auto`). The tree panel `.sl-exam-pool-tree` has `overflow-y: auto`, so it scrolls sideways too. Each nesting level adds 1em of indentation, and a long unbroken name or a deep path makes the row wider than the panel. The tools, at the far right, end up in the part that is scrolled out of view. On top of that they are `visibility: hidden` until the row is hovered or focused.

## Goals / Non-Goals

**Goals:**
- The class screen's counts are current without depending on which of the candidate causes above it was.
- No server, API or schema change.

**Non-Goals:**
- Changing the teacher's live view's stream or its fallback. It works, and the class screen is the only view that is idle by design.
- A separate "report" or export of focus data after the sitting. The ended sitting's live view is the place for it.
- Changing the keyboard shortcuts or drag and drop of the tree.

## Decisions

### D1 — The class screen polls snapshots instead of holding a stream

With `screen: 1`, the element does not call `connect()`. It fetches `/api/sittings/<id>/live` every 5 s (the existing `pollMs`) and draws it with the existing `draw()`. The badge, window and clock keep ticking every second from the last server time, as now.

Why: polling removes all three candidate causes at once. A fetch that cannot get a connection is only delayed, not stuck forever. Every fetch is an ordinary request that renews the session. Short responses get through buffering proxies. The screen shows three numbers to a room, so a 5 s delay is invisible, and one small JSON request per 5 s per open screen costs nothing. It also frees one connection for the teacher's own live view in the same browser.

`poll()` gets the error handling the screen needs: 403 stops it with the student-view notice, as now. On a network error or a server error the view keeps polling and shows in its connection line that it is waiting for the connection, instead of failing silently. A 401 reloads the page, as it does on every module page (`apiError` in `frame.js`): the reload goes through the login and, while the identity provider's session lives, comes straight back to the screen, which polls on. Polling on after a 401 instead would never recover by itself, since no later request gets through without a login (decided with Gerald, 2026-10-19).

Alternatives considered:
- *Keep the stream and add a watchdog* (treat it as failed when no snapshot arrives within ~10 s or nothing arrives within two heartbeats; the server would have to send heartbeats as named events, since `EventSource` does not expose comments). This is more code on both sides and needs a server change. It is the right fix if the teacher's live view ever shows the same symptom, but nothing reported so far points there.
- *Fix only the most likely cause.* None of the three can be confirmed from the code. Confirming one would need production network traces, and the fix above holds for all of them.

The implementation still starts with a browser test that changes a count after the screen has loaded (task 1.1), so the defect is pinned in the suite. If that test fails in the test environment before the fix, the cause is in the client and the fix must make it pass. If it passes before the fix, the cause is environment-specific (1–3 above), and the test stays as a regression guard.

### D2 — The live-view link for every state, the class-screen link only until the end

`sittingLinks(sitting)` returns the live-view link always and adds the class-screen link only while `sitting.state !== "over"`. Both callers call it unconditionally. The link keeps its label "Live-Ansicht" / "Live view", so the same view is not called two names (`exam-ui-conventions`, one wording for one thing). For an ended sitting the live view needs no change: Release only appears for a writing participant, End now and Extend only while the sitting is open, and the stream harmlessly carries any later admin correction.

### D3 — Time away in minutes from one minute on

`focusText()` formats the away time as `{seconds} s` below 60 s and `{minutes} min {seconds} s` from 60 s on (`4 min 12 s`; `5 min 0 s` is shown as `5 min`). It uses new i18n keys `exam.live.leftPageMinutes_one/_other` beside the existing `leftPage_*`, in German and English. Minutes and seconds instead of rounded minutes: a teacher judging a 1:50 absence wants to see that it was nearly two minutes, not "1 min".

### D4 — One `⋯` menu button at the start of each category row

Each non-root row becomes: fold, `⋯` button, name. The `⋯` button (`.sl-exam-tree-menu-button`, `aria-haspopup="menu"`, `aria-expanded`) is `flex: 0 0 auto` and comes before the name. It is therefore never pushed out by the name, and the row's horizontal overflow, if any, only cuts the end of the name. The name wraps, so that already happens rarely. Like the tools today, the button shows on hover and focus, and always on touch screens. Being at the start of the row, it no longer needs to be hidden to keep long names readable, but it stays quiet (low contrast) until the row is hovered.

The menu (`role="menu"`, entries `role="menuitem"`) is one element per tree, positioned below the button and appended to the tree's panel, not inside the row, so the row's overflow cannot clip it. Its entries:
- **New question**: a link to the editor's address for this category, as the 📝 link today.
- **New subcategory…** and **Rename…** open the existing name popup at the row (`openPopup`), as `+` and ✎ do today.
- **Delete** only for an empty category. It is a `confirmButton` inside the menu: the first click arms it and the menu stays open, the second deletes. Clicking elsewhere disarms it and closes the menu, following the module's confirmation rule.

Keyboard: Enter, Space or ↓ on the button opens the menu with focus on the first entry; ↑/↓ move between entries; Escape closes the menu and returns focus to the button; Tab closes it. The tree's own shortcuts (F2, Insert/`+`, Delete, Ctrl+X/V, Alt+↑/↓) are unchanged, so the menu is an alternative for the mouse, not the only way. The tree keeps its single tab stop: the menu button is `tabIndex -1` like the tools today, and a new shortcut is not needed because every entry already has one.

Alternatives considered:
- *Keep the icons but move them to the start.* Four icons before every name eat most of a narrow panel at depth five and make the tree noisy. Gerald asked for one button.
- *Keep them at the end with `position: sticky; right: 0`.* This keeps them in view while scrolling sideways, but they would cover the end of the name, and the panel would still scroll sideways.
- *A context menu on right-click only.* It cannot be discovered and does not exist on touch screens.

## Risks / Trade-offs

- [The class screen's counts lag by up to 5 s instead of arriving at once] → Acceptable for a room display. The spec asks for "within a few seconds".
- [The cause of the stream failure stays unproven, and could one day affect the teacher's live view as well] → The live view already falls back after errors. The watchdog alternative under D1 is noted here, ready if it is ever needed. The new screen test guards the board.
- [Menu positioning near the bottom of the tree panel could open below the visible area] → Open upwards when the space below the button is smaller than the menu's height.
- [Existing tests click `.sl-exam-tree-add`, `-rename` and `-delete` directly] → They move to opening the menu first. The class names stay on the menu entries, so the selectors change only by the menu step.

## Migration Plan

Client-only. Deploy as usual; no data migration. Rollback is a revert of the commit.
