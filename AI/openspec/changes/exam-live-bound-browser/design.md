## Context

Device binding is `exam-online-tests` D6: at start the server sets the cookie `sl-attempt-<id>` and stores the SHA-256 of its secret in `attempt.device_hash` (`startAttempt`, `exam/attempts.js`). `checkDevice` compares each request's cookie with that hash; with `device_hash` NULL (after a release) it binds the asking browser and hands it a fresh secret, otherwise a mismatch writes a row to `refused_device (attempt_id, at)` and emits `refused`. `releaseAttempt` sets `device_hash` to NULL and emits `released`. The live view (`exam/live.js`, `participantFrom`) sends `bound` (hash present or not) and `refused` (a count). Nothing about the browser itself is kept.

Two gaps surface on the way: binding after a release emits **no** event, so the live view does not learn that the student came back; and the snapshot has no way to name a browser.

Schema changes go through numbered files in `exam/migrations/` (`exam/db.js`, one transaction per file, a backup before migrating).

## Goals / Non-Goals

**Goals:** record the browser string at binding and at refusal, show it shortened with the full string reachable by mouse and by touch, rename the action, and keep the live view current when an attempt re-binds.

**Non-Goals:** recognizing devices by anything but the cookie (the string is shown, never compared), user-agent client hints, a history of every browser an attempt was bound to, any change to the student's pages or to the class screen.

## Decisions

### D1 — Two nullable columns, one migration

`ALTER TABLE attempt ADD COLUMN device_user_agent TEXT` and `ALTER TABLE refused_device ADD COLUMN user_agent TEXT`, in the next free migration number (today `009-bound-browser.sql`; renumber at apply time if another change took it). Only adds; existing rows keep NULL, which the view shows as "unknown". Alternative: a separate `binding` table with one row per binding. Rejected: the live view needs only the current binding, and the history is already implied by `refused_device`.

### D2 — Where the string is taken and written

`registerAttemptRoutes` reads `req.get("User-Agent")`, cuts it to 512 characters (an attacker-sized header must not bloat the database) and passes it into `startAttempt` and `checkDevice` as a new argument. `startAttempt` writes it with `device_hash`; `checkDevice` writes it with the fresh hash when it binds, and into `refused_device.user_agent` when it refuses. `releaseAttempt` clears `device_user_agent` together with `device_hash`, so "unbound" and "unknown" are never confused: hash NULL means unbound, hash set and string NULL means bound before this change.

### D3 — Binding after a release becomes an event

`checkDevice` emits a new `bound` event when it binds an unbound attempt. The live stream already rebuilds a participant through `liveParticipant` per event, so the new fields reach the open view without further plumbing. The client treats `bound` like `released`.

### D4 — Shortening on the server, no dependency

A small module `exam/user-agent.js` turns a string into `{ browser, version, os }` from an ordered list of patterns: Edge (`Edg/`), Opera (`OPR/`), Samsung Internet, Chrome / Chromium, Firefox, Safari (`Version/` + `Safari`), and for the OS Windows, macOS, iOS / iPadOS, Android, ChromeOS, Linux. Anything unrecognized falls back to "Other browser" with the OS if found. The participant snapshot carries `boundBrowser: { short, full } | null` and `refusedBrowser: { short, full } | null` (the latest refusal by `at`). Alternative: a library such as `ua-parser-js`. Rejected: one more dependency for six browsers, and the full string is always one tap away when the shortening is wrong. Unit tests pin the strings of the browsers students actually use.

### D5 — The cell and the touch control

The cell shows the short label with the full string in `title`. Next to it an icon button (`Info`, `aria-expanded`, labelled "Show the full browser string") toggles a `<small>` line with the full string in place. No `window.alert`, consistent with "no browser dialogs". The same pattern serves the "Other browsers" cell. Column order: Student · Status · Time left · In focus · **Bound to browser** · Other browsers · actions. On narrow screens the full-string line wraps; the short label does not.

### D6 — The button

`exam.live.release` becomes "Unbind browser" / "Browser-Bindung lösen"; `exam.live.released` becomes "{name} can go on in another browser now." unchanged in meaning. The button stays a plain single-click button, which takes it out of the backlog entry "Bestätigungen vereinheitlichen" (Gerald, 2026-10-18). New keys under `exam.live`: `columnBoundBrowser`, `boundUnknown`, `boundWaiting`, `showFullBrowser`, `hideFullBrowser`, `otherBrowser`. Both catalogs get the same keys (BabelEdit format).

## Risks / Trade-offs

- [The `User-Agent` is set by the browser and can be anything] → It is shown, never trusted: the binding stays the cookie. The display label says what the browser claims.
- [Privacy] → A browser string identifies no person beyond what the attempt already does and is low-sensitivity, but it is personal data about a student's device. It is stored only on the attempt and its refusals, shown only to teachers in the live view, deleted with the attempt (`ON DELETE CASCADE` for refusals, the attempt row itself), and therefore follows the exam module's retention of two years (exam-module design, Retention). It is not logged.
- [Shortening goes stale as browsers change their strings] → Unknown strings degrade to "Other browser · OS" with the full string available; the unit test list is extended when a case is noticed.
- [Migration during a running sitting] → Only nullable columns are added; attempts in progress show "unknown" until unbound and bound again.

## Migration Plan

Deploy as usual (safeLearn, then secureLectures). The migration runs at start with its backup. Rollback: the previous image ignores the extra columns; no data has to be removed.

## Decisions confirmed by Gerald (2026-10-18)

- **Refused browsers' strings are recorded and shown:** the string is stored with each refusal and the latest one is shown in "Other browsers", because it tells the teacher which device somebody tried with.
