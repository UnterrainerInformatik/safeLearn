## 1. Storage

- [x] 1.1 Add `exam/migrations/017-fullscreen-tick-rate.sql` with the `attempt` columns of design D5, all defaulting to "in full screen, no figures"
- [x] 1.2 Extend the migration tests: a database at 016 migrates, existing attempts read with no out-of-full-screen time, no drop and a null `tick_share`

## 2. Server

- [x] 2.1 `startAttempt` takes `{ fullscreen }` from `POST /tests/:id/attempt` and sets `fullscreen_unavailable` when it is false; a missing field counts as true (old client)
- [x] 2.2 Extend `recordBeat` and its body validation: `ticks` a non-negative integer, `out`/`noFullscreen` booleans, all optional for old clients (design Migration Plan)
- [x] 2.3 Classify each span in the order of design D4 (focus log, hidden, out, tick rate down, normal); keep `out_*`/`slow_*` and the `beat_out`/`beat_slow` run flags; set `fullscreen_unavailable` on `noFullscreen`
- [x] 2.4 Compute `tickShare`/`frameShare`/`share` per design D3; collect `rate_samples` from normal spans of at least 3 s and set `frame_baseline` from their median at 6; store `tick_share` per mille; keep `tickDownShare` as one server constant
- [x] 2.5 Emit `suspicious` when `out_count`, `slow_count` or `fullscreen_unavailable` changed (design D7)
- [x] 2.6 Add `fullscreenUnavailable`, `outCount`, `outMs`, `slowCount`, `slowMs`, `tickShare` to the snapshot's participant in `exam/live.js`; add `share` to the `beats` event; check that none of it reaches the class screen or a student's payload
- [x] 2.7 Unit tests in `test/exam-tests.test.js`: each category takes a span exclusively and in order; a tab switch with full screen lost counts only for the focus log; the baseline forms after 6 normal spans and ignores out/hidden/slow spans; 60 Hz and 144 Hz baselines both read about 100 %; a span at a fifth of the baseline counts as down; ticks alone flag a drop before the baseline exists; runs count once; old beats without the new fields are accepted
- [x] 2.8 Route tests in `test/exam.test.js`: invalid `ticks`/`out`/`noFullscreen` answer 400; `fullscreen: false` on start flags the attempt

## 3. Writing page

- [x] 3.1 Replace the open test's button with "Start the test in full screen" and the notice above it (design D1); request full screen in the click handler, then start with `{ fullscreen }`
- [x] 3.2 Put a "Continue in full screen" gate in front of the questions on resume, with the countdown running; same button and gate for the teacher's try, posting nothing
- [x] 3.3 Listen to `fullscreenchange` in `watchFocus`: show and hide the "Back to full screen" bar without covering the questions; send an extra beat at each change with the state from before it; track `out` over the span and `noFullscreen` on a refused request (design D2)
- [x] 3.4 Add the 250 ms tick counter beside the rAF counter, send `ticks`; stop it in `this.stop`
- [x] 3.5 Add the `exam.attempt.*` keys (`startFullscreen`, `fullscreenNotice`, `continueFullscreen`, `backToFullscreen`) to `i18n/en.json` and `i18n/de.json` with identical keys (BabelEdit format); remove `exam.attempt.start` if nothing else uses it
- [x] 3.6 Harness checks in `test/exam.test.js`: the only start control is the full-screen button and the page is in full screen after it; a reload shows the gate, then the saved answers; Esc shows the bar and the questions stay usable; a page whose `requestFullscreen` rejects still starts and is flagged; a throttled `requestAnimationFrame` (init script) produces "Tickrate Down!"

## 4. Live view

- [x] 4.1 Add "out of full screen n×, t" and "full screen not available" to the suspicious cell in `exam/client/live.js`
- [x] 4.2 Add the tick-rate column after the suspicious cell (design D7): the percentage while writing, the red "Tickrate Down! n×, t" once there was a drop, the final figures after the attempt; update the percentage from the `beats` event
- [x] 4.3 Extend the amber stripe and its tooltip to tick rate down
- [x] 4.4 Change the order key to `awayMs + hiddenMs + outMs + slowMs`; extend the ordering test with the three-student scenario
- [x] 4.5 Add the `exam.live.*` keys (column heading, warning, out-of-full-screen and not-available lines) to both language files

## 5. Measuring energy saving (design D6) - dropped, see D6

- [x] 5.1 Add a local, unshipped debug flag that logs `frames`, `ticks` and the share per beat to the console
- [x] 5.2 ~~Measure on Windows and Linux: Chrome energy saver (laptop unplugged), Edge efficiency mode, Firefox on battery; at 60 Hz and at 120/144 Hz where available; and with the mode switched on during an attempt~~ (dropped by Gerald on 2026-11-08: watched live in class instead, design D6)
- [x] 5.3 ~~Write the figures into design D6, settle `tickDownShare` and, if a mid-attempt switch reads as down, choose and implement one of the D6 remedies with a unit test~~ (`tickDownShare` ships at 0.5; D6 records the decision and the known 144 Hz case)
- [x] 5.4 Remove the debug flag again

## 6. Documentation and verification

- [x] 6.1 Update `docs-exam-module.md`: the full-screen start, the gate after a reload, the new signals and the tick-rate column
- [x] 6.2 Update `AI/architecture.md`: migration 017, the extended beat, the snapshot fields and the order key
- [x] 6.3 Add the new checks to `test/coverage-map.json`
- [x] 6.4 ~~Run `npm test` (re-run flaky checks per the known list)~~ and `openspec validate exam-fullscreen-tick-rate` (harness skipped by Gerald on 2026-11-08; unit, migration and coverage tests green, validate green)
