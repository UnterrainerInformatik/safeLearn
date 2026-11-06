## 1. Storage

- [x] 1.1 Add `exam/migrations/015-hidden-page-signals.sql` with the `attempt` columns of design D4, all defaulting to a clean attempt
- [x] 1.2 Extend the migration tests so that a database at 014 migrates and existing attempts read as clean

## 2. Server

- [x] 2.1 Add `recordBeat(db, row, beat, at)` to `exam/attempts.js` per design D2: validate the body (`frames` a non-negative integer, `hidden`/`reportedAway` booleans, `tampered` a subset of the three known names), ignore beats under 1 s apart, after the deadline or the submission, set `beat_at`, judge the span, skip what the focus log counts, update `hidden_count`/`hidden_ms`/`beat_hidden`, and merge `tamper_detail`/`tamper_at`
- [x] 2.2 Emit `suspicious` on the live stream only when `hidden_count` or the tamper set changed (design D5)
- [x] 2.3 Add `POST /exam/api/attempts/:id/beat` to `exam/routes-attempts.js` behind `requireStudent` and `attemptOf`
- [x] 2.4 Add `tampered`, `hiddenCount`, `hiddenMs` and `silentMs` to `participantFrom` in `exam/live.js` (design D3/D6); make sure none of them reaches the class screen or a student's payload
- [x] 2.5 Unit tests in `test/exam-tests.test.js`: first beat only sets `beat_at`; a span with too few frames counts; `hidden: true` counts; `reportedAway`/`away_since` stop counting; consecutive hidden beats are one stretch; an over-frequent beat, a beat after the deadline and a submitted attempt are ignored; the tamper set only grows; events are emitted only on change
- [x] 2.6 Route tests in `test/exam.test.js`: another student's attempt answers 404, another browser 409, a teacher session 403; invalid bodies answer 400

## 3. Writing page

- [x] 3.1 In `exam/client/attempt.js`, create the hidden `about:blank` iframe and the tamper check of design D1 (own property, non-native by the iframe's `toString`, value differs from the untouched getter)
- [x] 3.2 Add the rAF frame counter and the 5 s heartbeat with `frames`, `hidden`, `reportedAway` and `tampered`; track `reportedAway` from the existing focus listeners; stop both and remove the iframe in `this.stop`
- [x] 3.3 Harness check in `test/exam.test.js`: an `evaluateOnNewDocument` script that overrides `visibilityState`/`hidden`/`hasFocus` and swallows `blur`/`visibilitychange` produces a manipulated-browser finding naming the overridden properties; a clean page produces none

## 4. Live view

- [x] 4.1 Add the suspicious cell to `exam/client/live.js` (badge, "hidden by timing n×, t", "no heartbeat for t"), interpolating `silentMs` like the time away; empty for a clean attempt; no heartbeat warning once submitted
- [x] 4.1a Add the live stream's 5 s `beats` tick (`liveSilence`) so the view learns that ordinary beats still arrive (design D3); harness check for the cell and the tick
- [x] 4.2 Change the order key to `awayMs + hiddenMs`; extend the ordering test
- [x] 4.3 Add the `exam.live.*` keys to `i18n/en.json` and `i18n/de.json` with identical keys (BabelEdit format)

## 5. Documentation and verification

- [x] 5.1 Update `AI/architecture.md`: migration 015, `recordBeat`, the beat route in the route table, the live stream's `suspicious` event, the writing page's heartbeat and tamper check
- [x] 5.2 Run `npm test` and record the results (flaky checks per memory: rerun before judging)
  - 2026-11-06: `npm test` 926 tests, 924 pass, 2 fail; `test/exam.test.js` rerun: same 2. Both also fail on HEAD 2235f91 without this change (reproduced in a worktree), so they are pre-existing: "the live view orders by status … holds still under the mouse" (the 2 s wait after the mouse leaves) and "started from its page, a present student sees their handout" (the handout link on /exam/my). All new checks pass.
