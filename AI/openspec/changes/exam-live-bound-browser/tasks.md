## 1. Recording the browser string

- [ ] 1.1 Migration `009-bound-browser.sql` (next free number at apply time) per D1: `attempt.device_user_agent`, `refused_device.user_agent`, both nullable; unit test that the previous schema with attempts and refusals migrates with every row unchanged and the new columns NULL
- [ ] 1.2 `exam/routes-attempts.js`: read `User-Agent`, cut to 512 characters, pass it to `startAttempt` and `checkDevice` (D2)
- [ ] 1.3 `exam/attempts.js`: write the string at start, at re-binding and with each refusal; `releaseAttempt` clears it with the hash; `checkDevice` emits `bound` when it binds an unbound attempt (D3); unit tests in `test/exam-tests.test.js` extending "an attempt is bound to its browser…" (string stored, cleared on release, replaced on re-bind, recorded on refusal, cut at 512)

## 2. The snapshot

- [ ] 2.1 `exam/user-agent.js` per D4 with unit tests for current Firefox, Chrome, Edge, Safari (macOS, iOS, iPadOS), Samsung Internet, Chrome on Android and ChromeOS, and the fallback for an unknown string and an empty one
- [ ] 2.2 `exam/live.js`: `boundBrowser` (`null` when unbound, `{ short: null, full: null }` → "unknown" when bound without a string) and `refusedBrowser` from the latest refusal, in both `liveSnapshot` and `liveParticipant`; unit test that the class-screen payload and every student response carry neither
- [ ] 2.3 Handle the `bound` event in the live stream like `released`

## 3. The live view

- [ ] 3.1 `exam/client/live.js`: column "Bound to browser" per D5 with short label, `title`, info button toggling the full string in place; "waiting for the next browser" when unbound, "unknown" when bound without a string
- [ ] 3.2 Rename the button to "Unbind browser", single click, no confirmation (D6)
- [ ] 3.3 "Other browsers": short label of the latest refused browser next to the count, full string the same way as 3.1
- [ ] 3.4 `css/exam.css` for the new cells in both themes and at the 390px legibility viewport
- [ ] 3.5 `i18n/en.json` and `i18n/de.json`: new and renamed keys under `exam.live` (D6), same keys in both; `test/i18n-catalog.test.js` stays green

## 4. Checks and wrap-up

- [ ] 4.1 Harness check extending "a second browser is refused and recorded until the teacher releases the attempt": the teacher sees the short label of the student's browser (harness user agent set explicitly), the full string after tapping the info button, the refused browser in "Other browsers", "Unbind browser" without a dialog, the waiting state, and the new browser after re-binding without a reload
- [ ] 4.2 Harness check: the class screen and the student's attempt page contain no browser string
- [ ] 4.3 Update `AI/architecture.md` (data, live view) and `docs-exam-module.md` (live view section)
- [ ] 4.4 Run `npm test` in both module configurations and record the result
- [ ] 4.5 Deploy to secureLectures; check in the live view of a real sitting that bound browsers show and that an older attempt shows "unknown"
