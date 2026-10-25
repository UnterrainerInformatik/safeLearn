## Context

The exam module's online tests (`online-test`) run on four tables: `test`, `sitting`, `sitting_participant` and `attempt`. A sitting opens at `opens_at` by the clock. Whether a student sees an open test is answered by `openTestsOf` (`exam/attempts.js`). The teacher follows a sitting on `/exam/sittings/:id/live` and puts `/exam/sittings/:id/screen` on the projector. Both are fed by `exam/live.js` (`notify`/`listen`) over an authenticated event stream. `endSitting` and `extendSitting` (`exam/tests.js`) already act on the whole sitting.

Content visibility is decided in three places, all reading the file:
- the whole-file directive, checked in `app.js` `sanitizeAndParseMarkdown` and `getDirectoryListing` through `resolveFileVisibility`;
- inline blocks, through `filterForbiddenSegments` → `hasRoles` (`utils.js`);
- the view pseudo-roles `#exam`/`#practice`/`#answer`, also in `hasRoles`, from the stored preferences `ve`/`va`. `#exam` is hard-wired to `teacher`/`admin`.

Attachments are served on a live session grant (`recordAttachmentGrants`, 10 minutes, epoch-invalidated, recorded only by the corpus branch of the page handler), or else on the full decision `mayServeAttachment`, which re-reads every referencing file.

## Goals / Non-Goals

**Goals:**
- Reuse sitting, participants, extend/end, make-up, the class screen and the open-tests signal for offline tests, instead of building a parallel model.
- Keep the corpus' own visibility rules untouched: the handout is an exception that only the module's route can produce, for one request at a time.
- Make "who may see the handout now" a question answered from the database at every request, so attendance, group and window changes need no invalidation.

**Non-Goals:**
- No snapshot of the handout: it is rendered live from the file.
- No change to the hot-reload channel. The page reload on file change does not reach the handout page, and the channel naming restricted files stays a backlog item.
- No per-participant windows.

## Decisions

### D1 — An offline test is a `test` with `kind = 'offline'`, not a new table

Migration `013-offline-tests.sql` adds:
- `test.kind TEXT NOT NULL DEFAULT 'online' CHECK (kind IN ('online','offline'))`
- `test.duration_s INTEGER` (offline only; sittings copy it, so make-ups keep the same duration as the online rule requires)
- `test.handout_a TEXT`, `test.handout_b TEXT`, with `CHECK (handout_b IS NULL OR handout_a IS NOT NULL)`
- `test.assessment_id INTEGER REFERENCES assessment (id)`: the offline test's gradebook column
- `sitting.started_at TEXT`
- `sitting_participant.present INTEGER NOT NULL DEFAULT 1 CHECK (present IN (0,1))`, `sitting_participant.handout_group TEXT NOT NULL DEFAULT 'A' CHECK (handout_group IN ('A','B'))`

Every guard that is about questions (`A test without questions cannot be scheduled`, assembly, snapshot, follow-pool) asks `kind = 'online'`. The course's list, deletion and the module bar stay one code path.
*Alternative:* a separate `offline_test`/`offline_sitting` pair. Rejected: it would duplicate extend/end/make-up/screen/list and the year-change purge for no behavioural gain.

### D2 — "Open" for an offline sitting means started and inside its window

Before the start, `opens_at`/`closes_at` hold the planned window (so lists sort and the gradebook column has a date). Start sets `started_at = opens_at = now` and `closes_at = now + duration_s`, in one transaction, and moves the column's `held_on` to that date. Every query that asks "is this sitting open" adds `AND (t.kind = 'online' OR s.started_at IS NOT NULL)`. For an online sitting nothing changes. `extendSitting`/`endSitting` work unchanged once `started_at` is set and are refused before it. Start is refused while a handout does not resolve (D5) or the sitting already started.
*Alternative:* leave the window empty until the start. Rejected: `opens_at`/`closes_at` are `NOT NULL` with a `CHECK` and are read in many places.

### D3 — Presence and group live on `sitting_participant`; absent participants are not open to anything

The participant's open offline sittings are answered in `openTestsOf` (a second `SELECT` for `kind = 'offline'` with `present = 1`, returned with `kind: 'offline'`, `handout: 'A'|'B'|null` and no attempt). Because the open-tests check behind the violet Exams button and the student's open-tests stream (`listenTests`) already read `openTestsOf`, the button, the Exams page entry and its disappearance at the window's end follow without new machinery. A change of presence or group calls `notify(sittingId, 'attendance', username)` and the student's open-tests notification, so a late arrival sees the entry at once. Every participant starts present and in group A (the column defaults), so the teacher only unticks the absent and clicks the B students. This default was chosen for the fewest clicks while walking the rows. Its consequence: a student the teacher forgets to untick is served the handout.

### D4 — A server-set view override, honoured by `hasRoles`

`hasRoles` today derives the view from `context.preferences`. A handout route sets a request-scoped override, `req[handoutViews] = { answer: boolean }`, where `handoutViews` is a module-private `Symbol` exported from `permission-context.js`. No body, query, header or cookie parser can produce a Symbol-keyed property. With the override present, `hasRoles` uses `context.studentView` regardless of `vt` (teachers render "as a student" too, including the solution deck), grants `#exam`, refuses `#practice`, and grants `#answer` per the flag. Without the override nothing changes. The override is read only by `hasRoles`. The page's top bar and settings menu render from the real preferences.
*Alternatives:* a fake `preferences` object (rejected: `ve` alone cannot grant `#exam` to a student, and changing that rule for preferences would open it to everyone); a separate filter pass for handouts (rejected: a second implementation of the inline rule, which `filterForbiddenSegments` exists to prevent).

### D5 — The handout is addressed by its corpus path and resolved at use

The test stores the normalized corpus path (`normalizeCorpusPath`) of the `.md` file. "Resolves" means that `filesMap` holds a Markdown file at that path at the moment of asking. That is answered on every page that shows the handout, at start, and on every handout request. A rename or move therefore shows red without any watcher. The red state is shown, never repaired: the module does not guess the new location.
The picker reads a teacher API that returns every Markdown file of the index with its folder path, plus a flag "readable by the class". The flag is decided by evaluating the file's whole-file directive with `getActivePermissionRoles` against the course's class role (the lower-cased class name) and the absence of a directive. It does not cover individual name roles, so it is a warning, not a guarantee. The tree and the search (substring of the file name, case-insensitive) are built on the client from that list.

### D6 — Rendering a handout reuses the page pipeline, minus the whole-file gate

A new function next to `sanitizeAndParseMarkdown`, `renderHandout(path, req, { answer })`, reads the file, strips (does not evaluate) a first-line directive, sets the override from D4, and runs `preParse` with `embedDefaults: true` (no module element inside a handout makes requests), then `marked`, `manipulateHtml` and `sanitizeHtml`. The participant's route `GET /exam/my/sittings/:id/handout` authorizes from the database (open, participant, present, group → path, path resolves) before reading the file, and wraps the result in `wrapInPage` without navigation highlighting for the file. Every refusal is the module's ordinary not-found answer, which names nothing. The teacher's preview (`/exam/tests/:id/handouts/:group/preview`) and solution deck (`/exam/tests/:id/handouts/:group/solution`, via `splitForReveal`/`wrapInReveal`) use the same function behind `teacherPage`, with `answer: false` and `answer: true`. The solution button appears when the raw file contains a `@@@` directive naming `#answer`. That check is cheap and textual, and a false positive only shows a deck without answers.
The handout page subscribes to the student's open-tests stream and replaces its content with a closing notice when the sitting leaves `openTestsOf`. This is a courtesy, not a protection: what was on screen could have been copied anyway.

### D7 — Handout attachments are checked against the database, not granted

`renderHandout` does not call `recordAttachmentGrants`, so `Only the corpus grants attachments` keeps its mechanism. Instead, the attachment route gains a third check after the grant and `mayServeAttachment`, registered by the module like `registerOpenTestsCheck`: `handoutMayServe(req, attachment)`. It looks up the session's currently servable handouts (the D6 authorization, one indexed query) and, for each that references the attachment according to the attachment index, decides the reference with `filterForbiddenSegments` under the D4 override, exactly as `mayServeAttachment` does for corpus files. No state is kept, so closing, ending, unticking or regrouping takes effect on the very next request. That is what the modified `attachment-access` requirement asks for.
*Alternative:* grants that expire at `closes_at`. Rejected: they survive an absent mark or a group change, and an extension would need re-granting.

### D8 — The teacher's sitting page for an offline sitting is the attendance table

`/exam/sittings/:id/live` renders, for an offline sitting, the attendance table (name, present toggle, A/B buttons when the test has handout B, the row tinted by group, Matura highlighting as in the live view) with Start / Extend / End / View for the class above it. It is fed by the same stream and snapshot (`liveSnapshot` returns `kind`, `startedAt`, and per participant `present` and `group` instead of attempt figures), so two teachers' screens stay consistent. The class screen (`screen: "1"`) shows, for `kind: 'offline'`, only name, clock, window and time left, or "not started", and drops the counts.

### D9 — The gradebook column is created with the test

Creating an offline test creates an `assessment` of kind `test` or `shorttest` in the course, named after the test and dated by the planned date. Renaming the test renames the column. Start moves `held_on` to the start date (D2). Deleting the test deletes the column only if it holds no entry. Otherwise deletion is refused (`offline-test`). The column's header links to the test through `assessment_id`.

## Risks / Trade-offs

- [A second path through `hasRoles` that grants `#exam` to students] → The override is a Symbol set only by two module routes after the database authorizes the request. Tests assert that a query parameter, header or stored preference never produces it, and that the same session's other pages still show the practice variant.
- [The handout is rendered live, so a teacher's later edit changes what a student sees on reload] → Intended (typo fixes). It is documented in `docs-exam-module.md`. A deliberate snapshot can come later if needed.
- [A forgotten "absent" tick serves the handout to someone at home] → The default "present" is a convenience trade-off (D3). The attendance table is the place to see it, and an untick takes effect on the next request.
- [The "readable by the class" warning misses name roles and other classes' roles] → It is labelled a warning. The authoritative behaviour is unaffected because the handout route ignores the file's directive anyway.
- [The hot-reload channel names a modified handout file to every connected client] → Pre-existing. Recorded in `AI/open-proposals.md`, not addressed here.
- [`kind` guards missed somewhere, so an offline test reaches attempt code] → `startAttempt`, `previewView` and assembly refuse `kind = 'offline'` explicitly, and a test covers each.

## Migration Plan

`013-offline-tests.sql` only adds columns with defaults, and existing rows become online tests with every participant present in group A, which online code never reads. The runner's pre-migration backup covers rollback. A deployment without the module is unaffected.
