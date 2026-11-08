## Context

`wrapInPage` (`obsidian.js`) frames every page with `#topbar` (the burger, `.topbar-title`, `.topbar-menu` with the Exams button, the teacher/student switch, the presentation button and the settings chevron), `#wrapper > #sidebar` and `#topdown-menu`, the settings menu. The body stays `display: none` until `init()` in `obsidian-page.js` has applied the session's preferences (`page-bootstrap`). The core must not import from `exam/`.

The writing element already tells the page when a real attempt starts and ends: `announce(true)` in `writingPage()` (also behind the gate after a reload) and `announce(false)` in `resultPage()` and `disconnectedCallback()` dispatch `sl-exam-writing`. A preview never announces. `exam/client/exam-client.js` listens to hide the results section, and `/exam/my` already computes `writing` on the server so that a reload renders the results hidden from the start.

The hot-reload client from `getAutoReloadScript()` calls `location.reload()` on a `nav` event on every page, and on a `page` event when the current file is among the changed ones.

Nothing calls `document.exitFullscreen()` today. `submit()` and `finish()` call `this.stop()`, which removes the `fullscreenchange` listener and the heartbeat, and then show `resultPage()`.

## Goals / Non-Goals

**Goals:**
- A single, generic marker for "a test is being written on this page", which the core can read without knowing the exam module.
- No flash of the chrome on a reload of `/exam/my`.

**Non-Goals:**
- Blocking keyboard navigation (Alt+←, F5, Ctrl+L). Those stay as they are and are still counted by the existing signals.
- A server-side marker for content pages that place a test element. They hide the chrome once the element mounts (see Risks).
- Changing the class screen (`/exam/sittings/:id/screen`), which has no chrome anyway.

## Decisions

### D1: A class on `<html>`, `sl-writing`, hides the chrome by CSS

`html.sl-writing` hides `#sidebar`, `.topbar-burger`, `.topbar-menu` and `#topdown-menu` (`display: none !important`, which also beats the mobile overlay's inline styles), and lets `#markdown-content` take the freed width. The rule lives in `css/exam.css`, which `main.css` loads on every framed page. The `sl-exam-writing` listener in `exam-client.js` toggles the class, so the chrome follows exactly the events that already hide the results.

The alternatives were removing the elements from the DOM, which would need rebuilding the nav tree and the settings after the test, and `inert`/`pointer-events: none`, which would leave the controls visible and so look broken. A class keeps the DOM as it is, and showing it again after the test needs no reload.

### D2: `wrapInPage({ writing: true })` sets the class from the first byte

`wrapInPage` gets an option that writes `class="sl-writing"` on `<html>`. `/exam/my` passes its existing `writing` value. Together with the body hidden until `init()`, the chrome is never painted on a reload. The option is generic: the core only knows that a page is "being written", not why.

The alternative was setting the class in `exam-client.js` at module start, as it does with `.sl-exam-my-results[hidden]`. It was rejected because the module script runs after `init()` has shown the body, so a frame with the chrome can be painted in between.

### D3: The hot-reload client skips while `sl-writing` is set

In the `reload` handler, before saving the scroll position, the client returns when `document.documentElement.classList.contains('sl-writing')`, and logs that it skipped. Nothing is queued: a reload after the test would replace the result just shown with the list of tests (the spec says the result stays). The nav tree may be stale until the next page the student opens, which is harmless.

The alternative was deferring the reload until `sl-writing` goes. It was rejected for the reason above.

### D4: Leave full screen in the submit paths, after `stop()`

A helper `leaveFullscreen()` calls `document.exitFullscreen()` when `document.fullscreenElement` is set, and catches the rejection. `submit()` calls it once the server has returned the result, and `finish()` calls it when the server reports the attempt as submitted. Both run after `this.stop()`, so the `fullscreenchange` that follows sends no beat and shows no "Back to full screen" bar. `resultPage()` itself does not call it, because it also draws an attempt that was already submitted when the page loaded. The preview never reaches either path with a result, so it keeps full screen.

`exitFullscreen()` needs no user gesture, so the deadline path works without a click.

## Risks / Trade-offs

- [A content page with a test element shows the chrome for a moment after a reload, until the element has mounted and announced] → Accepted: the Exams page is the way students get to a test (the top bar's button), and on a content page the hiding still holds for the attempt itself. A server-side check per content page would need the core to ask the module.
- [A student opens the settings menu before starting, then starts] → `#topdown-menu` is hidden with the rest, whatever its open state. After the test it comes back in the state it had.
- [A `disconnectedCallback` without a submit (the element is removed) shows the chrome again while the attempt is still open] → Same as the results section today; it only happens when the page itself navigates away.
- [Narrow screens: hiding the burger removes the only way to the nav] → Intended for the attempt; it comes back after it.

## Migration Plan

No data change. Deploy as usual; rollback is a revert of the commit.
