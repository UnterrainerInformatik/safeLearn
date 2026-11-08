## Context

`exam-fullscreen-chrome` couples three things to one class, `sl-writing` on `<html>`:

- `css/exam.css` hides `#sidebar`, `.topbar-burger`, `.topbar-menu` and `#topdown-menu` under it.
- The hot-reload client in `obsidian.js` skips every `reload` event while it is set.
- `wrapInPage(..., { writing: true })` serves it from the first byte for a reload of `/exam/my` during an attempt.

`exam/client/exam-client.js` keeps the class in step through the `sl-exam-writing` event, which `WriteTest.announce(writing)` in `exam/client/attempt.js` dispatches. The same listener hides the student's results sections on `/exam/my` and reloads them when writing ends. A preview (`data.writing.preview === true`, from `GET /exam/api/tests/:id/preview`) never announces anything. Its Submit only prints `exam.attempt.previewNotSubmitted`, and its deadline (`finish()`) prints `exam.attempt.timeIsUpPreview` and stops the clock. Neither one leaves full screen.

The preview page `/exam/tests/:id/preview` (`exam/routes-tests.js`) is a teacher page without the module bar. It opens in a window of its own and holds one `test` element with `preview: "1"`.

## Goals / Non-Goals

**Goals:**
- The preview hides the chrome with the same CSS a writing student gets, but stays open to hot reload.
- Ending a preview (Submit or deadline) mirrors a real submission: the page leaves full screen, the chrome comes back, and a closing page replaces the questions.

**Non-Goals:**
- Hot reload while a student writes stays exactly as it is.
- Nothing changes on the server for the preview: no endpoint, no record, still no writes.
- Hot reload is not filtered per client. That is a separate backlog item ("Hot-Reload-Kanal nennt geänderte gesperrte Files").

## Decisions

### D1 — A second class, `sl-previewing`, that hides the chrome but does not hold back hot reload

The CSS rule matches `html.sl-writing` and `html.sl-previewing` with the same selectors. The hot-reload client keeps checking `sl-writing` only.

*Alternative:* set `sl-writing` for the preview too, and add a marker that the hot-reload client checks. That moves exam knowledge ("is this a preview?") into the core client and puts two meanings on one class. A separate class keeps the core unaware of previews. The core does not need to know why either class is set, just as `wrapInPage` documents today.

### D2 — `announce` carries whether it is a preview, and exam-client keeps both classes apart

`announce(writing)` dispatches `{ writing, preview: this.preview }`. In `exam-client.js` the listener does the following:

- It sets `sl-writing` to `writing && !preview` and `sl-previewing` to `writing && preview`.
- It touches the results sections and their reload only for a real attempt, so a preview event never counts as an "ended" attempt.

`writingPage` announces for both kinds of page. The existing `announce(false)` calls in `disconnectedCallback`, `openTests` and `resultPage` clear both classes, because neither kind of page is writing then.

*Alternative:* a separate `sl-exam-previewing` event. That means more wiring for the same lifecycle, and `disconnectedCallback` would have to send two events.

### D3 — The preview page is served with `sl-previewing` from the first byte

`wrapInPage` gets `options.previewing`, alongside `options.writing`, and renders it as `class="sl-previewing"`. The preview route passes it on every request, because the page always opens straight into the preview behind its gate. This matters because hot reload is allowed in the preview. Without the option, every corpus change while the teacher edits would make the sidebar flash up during the reload.

*Alternative:* let the client set the class only once the element has mounted. That is simpler, but it flickers on every hot reload, which is exactly the case the preview keeps.

### D4 — Ending a preview: `endPreview(reason)`

Submit in the preview goes through the same arming as a student's Submit (`data-armed`, `exam.attempt.confirmSubmit`), so the teacher sees the real flow. A confirmed Submit and the preview branch of `finish()` both call `endPreview("submitted" | "timeUp")`. That method does the following:

1. Calls `stop()`, which clears the timer and the `fullscreenchange` listener from `watchPreview`.
2. Shows the closing page.
3. Calls `announce(false)`.
4. Calls `leaveFullscreen()`.

This is the same order as `submit()`: stop, then show, then leave. The `fullscreenchange` that follows then finds no bar to show.

The closing page (`.sl-exam-attempt-preview-ended`) shows one note and a button:

- After Submit, the note is `exam.attempt.previewEnded` ("The preview has ended. Nothing was submitted.").
- At the deadline, the note is `exam.attempt.timeIsUpPreview`, whose existing text still fits.
- The button is `exam.attempt.restartPreview` ("Start the preview again").

`exam.attempt.previewNotSubmitted` is no longer used and is removed from both language files.

### D5 — Starting again fetches a fresh preview and always shows the gate

The button calls `GET /exam/api/tests/:id/preview` again, which reshuffles the test, and shows `writingPage(writing, { gate: true })`. The gate is passed explicitly: `exitFullscreen()` resolves asynchronously, so `!document.fullscreenElement` can still be false right after ending, and the default would skip the gate. The gate's own button ("Start the test in full screen") then puts the page back into full screen from its click. `writingPage` announces again, so the chrome is hidden again. If the fetch fails, `refusal(error)` is shown on the closing page and its button stays.

*Alternative:* have the restart button go straight into full screen, which saves one click. But then the gate's notice would not be shown, and the teacher would no longer see what the student sees at the start.

## Risks / Trade-offs

- [A hot reload during the preview throws away the teacher's answers and the countdown] → This is intended (decided 2026-11-08). The preview saves nothing anyway, and a teacher who edits alongside wants the new version. The reloaded page is served without chrome (D3) and stands behind the gate, so it looks like a fresh start.
- [A teacher's own tab with the student view, or a real attempt, in the same browser] → Each page has its own `<html>`, so the classes do not leak across tabs. On one page, a preview and a real attempt never exist together, because a preview element is only placed on the preview route.
- [The exam harness check "the teacher's try hides nothing and keeps full screen" flips] → Rewrite it in the same change. The coverage map entry ("the teacher's try hides nothing and keeps full screen") is updated with it.

## Migration Plan

Client, CSS, i18n and one route option only. Deploying is enough, and rolling back means reverting the commit. There is no data and no migration.
