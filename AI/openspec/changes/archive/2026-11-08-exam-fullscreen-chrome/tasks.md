## 1. Hiding the chrome

- [x] 1.1 Add the `html.sl-writing` rule to `css/exam.css` (design D1): hide `#sidebar`, `.topbar-burger`, `.topbar-menu` and `#topdown-menu` with `!important`, and let `#markdown-content` take the full width; check it at 390 px and at desktop width
- [x] 1.2 Toggle `sl-writing` on `document.documentElement` in the `sl-exam-writing` listener in `exam/client/exam-client.js`, and set it at module start when the server already rendered it (keep the existing results handling)
- [x] 1.3 Add the generic `writing` option to `wrapInPage` in `obsidian.js` that writes `class="sl-writing"` on `<html>` (design D2), and pass `/exam/my`'s existing `writing` value from `exam/routes-attempts.js`

## 2. Hot reload

- [x] 2.1 In `getAutoReloadScript()`'s `reload` handler, return early and log the skip while `<html>` carries `sl-writing`, before the scroll position is saved; nothing is queued (design D3)

## 3. Leaving full screen

- [x] 3.1 Add `leaveFullscreen()` to `exam/client/attempt.js` (exits only when `document.fullscreenElement` is set, swallows the rejection) and call it in `submit()` after the result arrives and in `finish()` when the server reports the attempt submitted, both after `this.stop()` (design D4); not in `resultPage()`, not for a preview
- [x] 3.2 Update the module comment at the top of `exam/client/attempt.js` with the leaving of full screen and the hidden chrome

## 4. Tests

- [x] 4.1 Harness checks in `test/exam.test.js`: after starting, `#sidebar`, `.topbar-burger`, `.topbar-menu` and `#topdown-menu` are not displayed and the title is; they stay hidden after Esc; a reload of `/exam/my` during the attempt serves `<html class="sl-writing">`; after submitting, the page is out of full screen, the chrome is shown again and the result is on the page; the same after the deadline; a teacher's preview hides nothing
- [x] 4.2 A check that a hot-reload `nav` event during the attempt does not reload the writing page, and does not reload it after submitting either
- [x] 4.3 Add the new checks to `test/coverage-map.json`

## 5. Documentation and verification

- [x] 5.1 Update `docs-exam-module.md`: leaving full screen after submitting, the hidden chrome during the attempt, the skipped hot reload
- [x] 5.2 Update `AI/architecture.md`: the `writing` option of `wrapInPage`, the `sl-writing` class and its use by the hot-reload client
- [x] 5.3 Run `npm test` (re-run flaky checks per the known list) and `openspec validate exam-fullscreen-chrome`
