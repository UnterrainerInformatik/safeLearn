## 1. The frame

- [x] 1.1 Add the rule `html:is(.sl-writing, .sl-previewing):fullscreen body::after` to `css/exam.css`, next to the chrome-hiding rule: fixed, `inset: 0`, `box-sizing: border-box`, 8px solid `#7c3aed`, `pointer-events: none`, highest `z-index`, `content: ""`. Add a comment that names this change and says why it is pure CSS (design D1, D2)
- [x] 1.2 Check by hand on the running instance: a student's attempt in full screen shows the frame in the light and the dark theme, Esc removes it, "Back to full screen" brings it back, and the preview shows it too

## 2. Tests

- [x] 2.1 In `test/exam.test.js`, add a helper `frameOf(page)` that reads the computed `border-top-width`/`border-top-color` and `pointer-events` of `body::after` (`getComputedStyle(document.body, "::after")`)
- [x] 2.2 Extend the student's full-screen check: frame present (violet, 8px, no pointer events) after "Start the test in full screen"; gone after Esc while the "Back to full screen" bar is shown; back after "Back to full screen"; absent behind "Continue in full screen" after a reload; gone on the result page after submitting
- [x] 2.3 Extend the preview check: frame present after "Start the test in full screen" in the preview, absent behind its gate, gone after the preview has ended
- [x] 2.4 Extend the offline-handout check: no frame on the handout page
- [x] 2.5 While the frame is shown, click an answer and the Submit button to confirm that it takes no clicks
- [x] 2.6 Add the frame to the "Writing in full screen" text in `test/coverage-map.json`

## 3. Documentation and verification

- [x] 3.1 Add one sentence on the violet frame to `docs-exam-module.md`, where full screen and the hidden chrome are described
- [x] 3.2 Note the frame beside `sl-writing`/`sl-previewing` in `AI/architecture.md`
- [x] 3.3 Run `npm test` (re-run the known flaky checks) and `openspec validate exam-fullscreen-frame`
