## Context

The focus log (`watchFocus` in `exam/client/attempt.js`, `recordFocus` in `exam/attempts.js`) listens to `visibilitychange`, `blur`/`focus` and `pagehide`. It keeps `focus_count`, `focus_ms` and `away_since` on `attempt`. `exam/live.js` turns these into `focusCount`/`focusMs`/`away` in the snapshot, and the live view sorts by net time out of focus.

Extensions of the "always active window" kind run as a content script in the page's own JavaScript world at `document_start`, so before our code. They replace the getters of `visibilityState`/`hidden` and the function `hasFocus`, either on `Document.prototype` or as own properties of `document`. They also register capture listeners on `window`/`document` that call `stopImmediatePropagation()` on `blur` and `visibilitychange`. All three inputs of the focus log go blind at the same time. See proposal.md for the motivation.

The attacker is a student using a generic extension, not one written against safeLearn. The page runs on the student's device, so every client-side signal can be defeated by an extension made for that purpose. The goal is to make the generic extensions visible, not to be tamper-proof.

## Goals / Non-Goals

**Goals:**
- Two independent signals, so that defeating one still leaves the other: an integrity check of the properties, and the timing evidence from animation frames and timers.
- The server decides "hidden by timing" from the raw beats. The client only reports what it measured.
- No double counting with the focus log, and no change for a student with a clean browser.

**Non-Goals:**
- Blocking, ending or locking an attempt; any effect on the grade.
- Detecting a browser window that is only partly covered (another window beside it). Browsers keep drawing such a window, so the timing cannot see it.
- Detecting extensions by their ID or files, requiring full screen or a private window, Safe Exam Browser.
- Telling the student about a finding.

## Decisions

### D1: Untouched references come from a fresh `about:blank` iframe

At the start of `watchFocus` the page inserts a hidden, same-origin `about:blank` iframe. From its `contentWindow` it takes `Document.prototype`'s `visibilityState`/`hidden` getters, `Document.prototype.hasFocus` and `Function.prototype.toString`. A property counts as manipulated if any of these holds:
1. `document` has an own property of that name (`Object.getOwnPropertyDescriptor(document, name)`).
2. Our realm's `Document.prototype` getter or function is not native, judged by the iframe's `toString` (`/\{\s*\[native code\]\s*\}\s*$/`).
3. The iframe's untouched getter, called on our `document`, answers differently from our `document`'s property. A cross-realm getter call is allowed between same-origin realms.

Check 3 runs at every beat, because a value-only override can only be caught at the moment it lies. Checks 1 and 2 run at start and at every beat, since an extension may install itself late. The iframe stays in the page for the whole attempt.

Alternative: our own realm's `Function.prototype.toString`. Rejected, because extensions that patch the getter often patch `toString` as well, and the iframe's copy escapes a patch made only in the top frame. An extension that also injects into `about:blank` frames (`all_frames` with `match_origin_as_fallback`) defeats D1. That is the case D2 exists for.

### D2: The heartbeat counts animation frames; the server judges

Every 5 s (`setInterval`) the page posts `{ frames, hidden, reportedAway, tampered }` to `POST /exam/api/attempts/:id/beat`:
- `frames`: how many `requestAnimationFrame` callbacks ran since the previous beat (a counter in a self-rescheduling rAF loop).
- `hidden`: the page's visibility as read through D1's untouched getter.
- `reportedAway`: true if the page's own focus listeners reported an absence at any time during the beat's span, or the page is away now.
- `tampered`: the names found by D1, at most the three known ones.

Browsers stop rAF entirely for a hidden page and for a fully covered window (Chrome's occlusion tracking). They throttle a hidden page's timers to at most once per second, and after five minutes to once per minute. So a hidden page sends beats late and with almost no frames.

The server measures the span of a beat as the time since the previous beat it received, using server time (`beat_at`). The client's clock is never used. A beat counts as **hidden** if `hidden` is true, or if `frames < spanSeconds × 5`. A visible page draws 30–60 frames per second even in battery-saver mode, so 5 fps leaves a wide margin.

A hidden beat is not counted if `reportedAway` is true or the attempt's `away_since` is set: the focus log already has it. Otherwise its span is added to `hidden_ms`, and `hidden_count` is incremented if the previous beat was not hidden (`beat_hidden` flag). The first beat of an attempt only sets `beat_at`. Beats closer than 1 s to the previous one are ignored, as are beats after the deadline or the submission. Spans are capped at the time since the attempt started.

Alternative: the client decides and reports "hidden". Rejected. A server-side judgement over raw counts keeps the rule in one place, testable without a browser, and lets the threshold change without a client update.

### D3: "Without heartbeat" is derived, not stored

The snapshot computes `silentMs = now - beat_at` for a writing attempt (or `now - started_at` before the first beat). The view shows "without heartbeat" above 20 s, which is four missed beats. Nothing is stored, and a submitted attempt never shows it. A stretch without beats that ends with a late hidden beat is counted by D2 anyway. A stretch that ends with a normal beat (network outage, laptop asleep) only showed while it lasted.

Since an ordinary beat emits no change (D5), the view would otherwise never learn that beats still arrive. So every open live-view stream sends a `beats` event every 5 s: `{ serverTime, silent: { <username>: silentMs } }` for the sitting's writing attempts (`liveSilence` in `exam/live.js`), checked against the session like every other delivery. That is one query per open view, not one event per student. The view resets each row's `silentMs` from it and counts on from there. While polling, the snapshots carry `silentMs` anyway.

### D4: Storage in migration 015

`attempt` gets these columns:
- `tamper_detail TEXT NULL`: a comma-separated set of property names, merged and never shrunk.
- `tamper_at TEXT NULL`: the first finding.
- `beat_at TEXT NULL`
- `beat_hidden INTEGER NOT NULL DEFAULT 0`
- `hidden_count INTEGER NOT NULL DEFAULT 0`
- `hidden_ms INTEGER NOT NULL DEFAULT 0`

The defaults read every existing attempt as clean. No other table changes. A closed year's triggers already cover `attempt`, and beats are refused for submitted attempts anyway.

### D5: One route, guarded like the focus route

`POST /exam/api/attempts/:id/beat` goes behind `requireStudent` and `attemptOf` (own attempt, bound browser, `sl-attempt-<id>` cookie). It answers `{ recorded }`. A change of `hidden_count` or of the tamper set emits `notify(sitting, "suspicious", username)` on the live stream. Ordinary beats emit nothing, so 30 students every 5 s do not flood the stream. The view interpolates the time hidden like it interpolates `focusMs`, and `silentMs` grows client-side from the snapshot's value.

### D6: The view and the order

The snapshot's participant gains:
- `tampered`: an array of names, or empty.
- `hiddenCount`, `hiddenMs`
- `silentMs`, null unless writing.

`exam/client/live.js` shows these in their own cell, after the focus cell. The cell holds a red "browser manipulated (visibilityState, hasFocus)" badge, a line "hidden by timing 2×, 1 min 30 s", and a "no heartbeat for 45 s" warning. It is empty for a clean attempt. The order key becomes `awayMs + hiddenMs`. The focus share and its colour stay as they are, so the two signals stay distinguishable. The view for the class shows neither.

## Risks / Trade-offs

- [An extension made to defeat both signals (a fake rAF driven by a Worker, an injection into the iframe)] → Accepted. The goal is the generic extension, and D1 and D2 have to be defeated together.
- [A laptop asleep or a frozen tab produces a late beat with no frames, counted as hidden] → It is shown as a flag for the teacher to judge, never as a penalty. It is also what we want to see: the student was not writing.
- [Background throttling differs between browsers] → The rule needs only "few frames in the span", and rAF stops for hidden pages in Chromium, Firefox and Safari alike. The harness covers Chromium.
- [One beat every 5 s per student] → About 6 requests/s for 30 students: tiny writes on one row, no stream event.
- [Short absences below one beat (under ~5 s) slip through D2] → Accepted. D1 still flags the browser, and short absences matter least.

## Migration Plan

Migration 015 adds the columns with defaults, so it can run on a live database and needs no backfill. An old client open during the deployment sends no beats. Its attempt shows "without heartbeat" until the page reloads. That is harmless outside a sitting, so deploy outside one. Rollback means an older image. The added columns are ignored by the old code.
