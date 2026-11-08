## Context

`exam-hidden-page-signals` added a heartbeat to the writing page (`watchFocus` in `exam/client/attempt.js`). Every 5 s it posts `{ frames, hidden, reportedAway, tampered }` to `POST /exam/api/attempts/:id/beat`. `recordBeat` in `exam/attempts.js` measures the span by server time. It counts a span as hidden by timing when `hidden` is set or `frames < span × 5 fps`, unless the focus log already counts it. The raw frame count is thrown away after that. The live view (`exam/live.js`, `exam/client/live.js`) shows the result in the suspicious cell and sorts within a status by `awayMs + hiddenMs`.

The start of an attempt is a plain button, `exam.attempt.start`, which posts `POST /tests/:id/attempt`. A reload resumes a running attempt at once and shows the questions (`attempt.js`, "A running attempt is resumed at once").

The Fullscreen API only starts full screen from a user gesture (`element.requestFullscreen()` inside a click handler). It ends with Esc, and also when the tab is switched. Browser full screen started with F11 is not visible to the page, so it plays no part here. iPhone Safari has no element full screen.

## Goals / Non-Goals

**Goals:**
- Every attempt is started and resumed through a full-screen button. No setting and no second path.
- Leaving full screen and a drop in tick rate are flagged and counted, each heartbeat span in at most one category.
- The tick rate is relative to the student's own display, not a fixed number of frames per second.
- The threshold is settled by measuring energy-saving modes, not by guessing.

**Non-Goals:**
- Blocking or locking the questions outside full screen. The bar only offers the way back.
- Proving to the server that the page really is in full screen. The client reports it, and an extension can lie, as with every client-side signal (see `exam-hidden-page-signals`).
- Detecting F11 full screen.
- A sortable table or a choice of order.

## Decisions

### D1: One button that requests full screen, then starts

The open test's button becomes `exam.attempt.startFullscreen` ("Start the test in full screen"). The request to stay in full screen stands above it (`exam.attempt.fullscreenNotice`). The click handler calls `document.documentElement.requestFullscreen()` and awaits it. It then posts `POST /tests/:id/attempt` with `{ fullscreen: true }`, or `{ fullscreen: false }` if the call is missing or rejects. The attempt starts either way, so a student on an iPhone can still write.

A reload no longer shows the questions at once. `writingPage` first renders a gate with the countdown and "Continue in full screen" (`exam.attempt.continueFullscreen`). The questions are built behind it and shown on the click. The gate is skipped when the page is already in full screen, which cannot happen after a reload but keeps the code honest.

The teacher's try (`previewView`) uses the same button and gate, without posting anything.

Alternative: offer full screen but also a plain start. Rejected by Gerald: the button is the only way in, so nobody needs to announce full screen.

### D2: Leaving full screen while writing

`watchFocus` listens to `fullscreenchange`. When the page leaves full screen, a bar appears above the questions (`exam.attempt.backToFullscreen` with a button that calls `requestFullscreen()` again). It does not cover the questions, and it goes away once full screen is back.

The state goes to the server with the heartbeat, not through its own route. The beat gains `out` (true if the page was out of full screen at any moment during the span) and `noFullscreen` (true if a `requestFullscreen` call was refused). At each `fullscreenchange` the page sends one beat right away, using the state from before the change, and starts a new span. So spans line up with the changes, and the time out of full screen is exact to the 1 s minimum gap between beats instead of to 5 s. A change within 1 s of the previous beat is merged into the next span. The span is then counted as out, which errs towards flagging.

A reload counts as out of full screen: the first beat after the gate reports `out` for the span before the click, because the page reaches the gate outside full screen.

Alternative: a `POST /attempts/:id/fullscreen` route like the focus log. Rejected, because the beat already carries the span and the server's classification (D4). A second clock would need its own rules against double counting.

### D3: Two rates in the beat, one share

The page counts animation frames (as now) and timer ticks from a `setInterval` at 250 ms. The beat sends both, `{ frames, ticks }`. On the server, for a span of `s` seconds:
- `tickShare = ticks / (s × 4)`. Timers have a nominal rate, so no baseline is needed. Hidden pages throttle them to 1/s or less.
- `frameShare = (frames / s) / baseline`. The baseline is the median frame rate of the attempt's first 6 **normal** spans (D4) of at least 3 s. Until it exists, `frameShare` is unknown and only `tickShare` counts.
- `share = min(frameShare, tickShare)`, capped at 1, kept as `tick_share` (per mille) for the last span.

A span is **tick rate down** when `share < tickDownShare`. The value is a server constant, 0.5 (D6).

The baseline is the student's own, so 60 Hz and 144 Hz displays both read about 100 %. A student who starts in energy-saving mode has a lower baseline and no false alarm. The risky case is switching into it during the test (D6).

### D4: Every span lands in exactly one category

`recordBeat` classifies each span in this order. The first category that matches takes it:
1. The focus log already counts the student as away (`reportedAway` or `away_since`): nothing new is counted.
2. Hidden by timing (as now: `hidden` or under 5 fps): `hidden_ms`/`hidden_count`.
3. Out of full screen (`out`): `out_ms`/`out_count`.
4. Tick rate down (D3): `slow_ms`/`slow_count`.
5. Normal: it may feed the baseline.

As with `beat_hidden`, a count only rises when the previous span was not in the same category (`beat_out`, `beat_slow`). So no span counts twice, and the order key `awayMs + hiddenMs + outMs + slowMs` adds up without overlap.

`noFullscreen` on a beat, or `fullscreen: false` at the start, sets `fullscreen_unavailable` for good.

### D5: Storage in migration 017

`attempt` gets these columns:
- `fullscreen_unavailable INTEGER NOT NULL DEFAULT 0`
- `out_count`, `out_ms`, `beat_out INTEGER NOT NULL DEFAULT 0`
- `slow_count`, `slow_ms`, `beat_slow INTEGER NOT NULL DEFAULT 0`
- `tick_share INTEGER NULL`: per mille, for the last span.
- `frame_baseline REAL NULL`
- `rate_samples TEXT NULL`: the frame rates of the normal spans so far, comma-separated, until there are 6. Then it is cleared and `frame_baseline` is set.

Attempts that already exist read as "in full screen, no figures", and their tick-rate cell stays empty because `tick_share` is null. The closed year's triggers already cover `attempt`.

### D6: The threshold is watched in class, not measured beforehand

Gerald decided on 2026-11-08 to skip the planned measurement and to watch the tick rate live with his classes instead. The reason: the signal never goes into a grade, it only flags a row for the teacher, so a false alarm costs a look, nothing more. `tickDownShare` ships at 0.5.

What is known without measuring: Chrome's energy saver caps drawing at 30 fps. Switched on mid-attempt on a 60 Hz display, the share sits at about 0.5, right at the threshold. On a 120/144 Hz display it falls to 0.2-0.25 and reads as "Tickrate Down!". A student who starts in that mode has the lower rate in their baseline and no alarm. If the false alarms get in the way in class, one of these remedies is chosen then, as a change of its own:
- a lower threshold;
- a re-baseline after a steady new rate over several spans;
- ignoring a rate that sits steadily at about half the baseline.

The measurement that was planned, kept for that later change. It was to run on Windows and Linux, since no macOS is available:
- Chrome with the energy saver on (Settings → Performance, "Turn on when the computer is unplugged", laptop unplugged). It caps drawing at 30 fps.
- Edge with efficiency mode.
- Firefox on battery.
- Each with a 60 Hz display, and with 120/144 Hz where available.
- Turning the mode on during an attempt, which is the false-alarm case.


The Puppeteer harness cannot switch the energy saver. It simulates a slow page by throttling `requestAnimationFrame` through an init script, which tests the server's rule, not the browser.

### D7: Snapshot and view

The participant in the snapshot gains:
- `fullscreenUnavailable`
- `outCount`, `outMs`
- `slowCount`, `slowMs`
- `tickShare`: a fraction, or null.

A change of `out_count`, `slow_count` or `fullscreen_unavailable` emits `notify(sitting, "suspicious", username)` like the hidden count. The current `tickShare` changes with every beat. So the existing 5 s `beats` event (`liveSilence`) carries it beside `silentMs`, `{ silent: {…}, share: { <username>: tickShare } }`, which costs no extra query or event.

`exam/client/live.js`:
- The suspicious cell gains the lines "out of full screen 2×, 40 s" and "full screen not available".
- A new **Tick rate** column after it shows "97 %" while writing. Once there was a drop it shows the red "Tickrate Down!" with "1×, 40 s", and while writing the current percentage below it. After the attempt it shows the figures without the percentage.
- The amber stripe also covers tick rate down.
- The order key becomes `awayMs + hiddenMs + outMs + slowMs`.

The view for the class shows none of this.

## Risks / Trade-offs

- [Energy saver switched on mid-test gives a false "Tickrate Down!"] → Likely on a fast display (D6). Accepted: it is a flag for the teacher, never a penalty, and the teacher watches it in class.
- [Full screen ends with every tab switch, so a tab switch also reads as "out"] → D4 gives the span to the focus log first, so it is not counted twice. The time back on the page before the student returns to full screen does count as out, which is intended.
- [A student without element full screen (iPhone) is always flagged] → "full screen not available" is a separate, plainly named finding, so the teacher sees it is the device.
- [The gate after a reload costs the student a click while the clock runs] → One click. The reload itself is the student's doing.
- [An extension fakes `fullscreenElement` or swallows `fullscreenchange`] → Accepted, as with the visibility properties. The teacher sees the room, and the tick rate and hidden-by-timing signals stay independent of it.
- [The extra beat at each full-screen change] → At most a few per attempt. The 1 s minimum gap bounds it.

## Migration Plan

Migration 017 only adds columns with defaults, so it runs on a live database and needs no backfill. A page left open from before the deployment sends old beats without `ticks`, `out` or `noFullscreen`. The server treats the missing fields as "no ticks known" (`tickShare` unknown, frames only) and "in full screen". Deploy outside a sitting, as before. Rolling back to an older image ignores the new columns.

## Open Questions

- Whether 0.5 holds up in class, and how to handle a mid-attempt energy-saver switch (D6). It is settled by watching live, and a remedy is a change of its own.
