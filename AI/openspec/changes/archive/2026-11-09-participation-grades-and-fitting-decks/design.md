## Context

This change bundles three unrelated backlog items. They share no code and can be implemented and verified one by one, in this order.

**Participation.** A participation column (`plusminus`) stores `value` 1 or 0 and `grade` NULL (`normalizeResult` in `exam/gradebook.js`). Presentations and projects already show how a grade is entered: `gradeKinds` lists them, `normalizeResult` takes `{ grade }` and stores the band midpoint, and `entryFromRow` recomputes the midpoint from the typed `grade` on every read. Project marks (`projectmark`) share the `+`/`−` input with participation today, both in the server (`normalizeResult`, `entryFromRow`) and in the client (`isMark` in `exam/client/gradebook.js`). `manual_entry` and `assessment` carry closed-year triggers that refuse any `UPDATE` in a closed school year.

**Preference reset.** `setPreferences` (`test/harness.js`) POSTs the whole block to `/userattributes`. That ends in `setUserAttribute`, which reads the account (from the request's permission context when there is one), merges the new attribute in, and POSTs the **whole** attribute set to the Keycloak Account API. Every rendered page also calls `rememberLastVisited` (`app.js:216`) without waiting for it, and that is a `setUserAttribute(req, "lastVisitedUrl", …)` built from the account **as that request read it at its start**. So a page request that started under `vt: 0` and finishes its `lastVisitedUrl` write after the reset writes the old `config` back. This is a lost update, and it matches the symptom: the reset reports success, and the reload then renders with `vt = 0`. It also explains why only the checks that fetch rendered pages in student view are affected, and why the timing of a solo run differs from the full suite. This is the leading hypothesis. Task 2.1 confirms or refutes it before anything is fixed.

**Decks.** `wrapInReveal` (`obsidian.js`) calls `Reveal.initialize` with `width: "90%"`, `height: "90%"`, `margin: 0.04`, `minScale: 0.2`, `maxScale: 2.0`. With percentages, reveal.js 5.2.1 sizes the slide to the viewport and does **not** scale it: the scale is fixed at 1, and `minScale`/`maxScale` never come into play. Content taller than the viewport therefore overflows. `css/reveal.css` caps `#revealContent img` at `max-height: 50%`. The board solution's sections are not under `#revealContent`, and a percentage height on an image inside an auto-height block resolves to nothing anyway. So images keep their natural size.

## Goals / Non-Goals

**Goals:**
- Participation takes a grade 1–5. Existing `+`/`−` become 1/5 once, including closed years.
- `test/exam.test.js` resets the teacher session reliably, alone and in the suite.
- Every slide of every deck fits the screen, shrunk where needed, never enlarged beyond its ordinary size.

**Non-Goals:**
- Changing project marks, which stay `+`/`−`.
- Renaming the kind `plusminus`: it is an internal name, and renaming it would mean rebuilding `assessment` for nothing.
- Splitting long slides automatically, or changing the corpus.
- The open questions on the hot-reload channel or the public image (separate backlog items).

## Decisions

### D1 Participation becomes a grade kind; the kind keeps its name

`gradeKinds` gains `plusminus`. `normalizeResult` handles `plusminus` through the grade branch. Before that, it turns the shortcuts into a grade: `{ mark: "+" }` → 1, `"o"`/`"O"` → 3, `"-"`/`"−"` → 5. The server does this, not the client, so the sheet and the API accept the same thing and the mapping lives in one place. Everything else is refused with `exam.errors.gradebook.gradeRange` (its text names the shortcuts). The `mark` branch for `+`/`−` is left with `projectmark` only. In `entryFromRow`, `mark` becomes `row.kind === "projectmark"`. `columnMax` keeps refusing a maximum for participation, under the existing error. In the client, `isMark` covers only `projectmark` and `isGraded` gains `plusminus`, so the field, arrow keys and colouring follow the presentation's path. The participation field's own input check also lets `+`, `o` and `-` through and sends them as `{ mark }`. After saving, it shows the grade the server answers with.

*Alternative:* a new kind `participation` with a rebuild of `assessment` as in 014. This was rejected because it rewrites every row for a name nobody sees.

### D2 One migration sets the grade, past the closed-year triggers

`019-participation-grades.sql` sets `grade = 1` where `value = 1` and `grade = 5` where `value = 0` on every `manual_entry` whose assessment is `plusminus` and whose `grade` is NULL. It also sets `value` to the midpoint of the scale in force, so that a reader that only reads `value` sees the same fraction. `entryFromRow` recomputes the midpoint on every read anyway. The update must also reach entries in closed years (the spec requires it). So the migration drops `manual_entry_closed_year_update`, updates, and recreates the trigger unchanged, as 014 does with all three. The migration runner already runs each file in one transaction. The trigger is therefore never missing outside the migration.

*Why also closed years:* otherwise a closed year would mix `+` with grades in one category, and the student's own results view would need two renderings.

### D3 Preference writes of one account are serialized and read fresh

This is subject to the outcome of task 2.1. If the lost update is confirmed, `setUserAttribute` will:
1. Run writes for the same account one after another (a per-account promise chain in the module's memory). A `lastVisitedUrl` write that is in flight then completes before a `config` write starts, and the other way round.
2. ~~Re-read the account from Keycloak right before merging, instead of the request's permission-context copy.~~ **Changed 2026-11-09 (Gerald):** a re-read would cost every rendered page a second identity-provider lookup, against `role-resolution` ("queried once while that request is served"). Instead the module keeps, per account, what this process last wrote of each attribute and when that write was done. A write merges the account as its request read it and lays over it every attribute written since that read began (the permission context's clock reading, taken before its lookup; for a request without a context, the time before its own lookup). Only successful writes are recorded. Together with 1, a write never sends an attribute older than one this process has stored. No extra lookup.

This holds within one instance, which is how SafeLearn runs. A change made elsewhere (the Keycloak console, a second instance) is not laid over, as before.

*Alternative:* fix only the harness, by waiting until in-flight requests finish before resetting. This was rejected if the race is confirmed. A real teacher toggling student view and clicking quickly hits the same lost update, so the fix belongs in the application. If 2.1 shows a pure harness cause, the fix goes into `setPreferences` instead, and D3 is dropped (recorded in tasks).

### D4 Only a slide that does not fit is shrunk; the deck configuration stays

Baseline (Gerald, 2026-11-09): `md/presentations/Quarkus/JPA - Basics (1).md` in secureLectures is laid out for the board and fits it today. It must look exactly the same afterwards. So the global sizing stays as it is (`width`/`height` `"90%"`, `margin`, font sizes). A fixed logical size such as 1280×720 would scale **every** deck and change the look of this one too, so it is rejected.

1. A small script in the deck of `wrapInReveal` measures, for the current slide, the section's natural `scrollHeight`/`scrollWidth` with all fragments counted as visible (fragments only change opacity, so they already take up their space), and compares it to the space reveal gives the slide. Only if it is larger does it set a scale factor below 1 on the section, via CSS `zoom` or `transform: scale` with a compensating size, so that it fits. If it fits, the script sets **nothing**: no style, no class. So a fitting slide is byte-for-byte the same DOM as today. It reruns on `ready`, `slidechanged`, `resize` and after the slide's images load.
2. `css/reveal.css`: the image limits are only relaxed so far that a large image is no longer cut off by its own rule, without changing images that fit today. Whether `max-height: 50%` is removed or replaced depends on the check in 3.4. If images on the baseline deck would change size, the rule stays and the fit from 1 does the work.

*Alternative:* CSS only (`max-height` on images in `vh`). This was rejected because it only fixes images and not long code, tables or many answers, and the backlog item asks for the whole slide. It would also change images that fit today.

*Alternative:* reveal's `r-fit-text`/`r-stretch`. This was rejected because both are per-element and opt-in, and the corpus and solution decks would need markup changes.

### D4 as implemented (2026-11-09)

- Reveal's scale is not 1 but a constant 1/0.9 (`presentationWidth / width` with `width: "90%"`), so it never depends on the content either; the finding above holds.
- The fit uses the CSS `scale` property with `transform-origin: 50% 0`, not `zoom` or `transform`. `scale` composes with the transforms of Reveal's slide transitions instead of replacing them, and unlike `zoom` it shrinks a percentage size (`max-width: 50%` on an image) along with the rest, so line breaks stay as they were. A shrunk slide is marked `data-sl-fit`; a fitting one gets neither.
- A slide wider than the deck is scaled until its right edge is back inside, from its horizontal centre.
- Besides `ready`, `slidechanged`, `resize` and image `load`, it reruns on `document.fonts.ready` and through a `ResizeObserver` on the current slide (a diagram drawn late).
- Print view: each slide is fitted to its own `.pdf-page` (slide width, page height), after `pdf-ready`. `scale` survives printing, so no fallback was needed.
- `css/reveal.css`: `max-height: 50%` on images was removed. It never capped anything (a percentage height in a block of no fixed height), and the baseline deck is pixel-identical without it. `max-width: 50%` stays: relaxing it would enlarge images of the baseline deck.
- Baseline `JPA - Basics (1)`: at 1920×1080 every slide fits and all 25 are pixel-identical after the change. At 1280×800 five slides and at 1024×768 eight slides did not fit before and are shrunk now; every other slide is pixel-identical. Slides whose code only scrolls inside its own `pre` count as fitting and are untouched.

## Risks / Trade-offs

- [Proposals shift with the migration] → Intended and decided. `+` counted 1.0 and `−` 0.0, and they become e.g. 0.94 / 0.25. Mention it in the release note for teachers.
- [A heavily shrunk slide becomes unreadable] → By design (spec). The teacher reformats it. No minimum is enforced beyond reveal's `minScale` for the whole deck.
- [The fit touches a slide that fits today] → The script only writes a style when the content is larger than the slide. Screenshot comparison of the baseline deck `JPA - Basics (1)` before and after, at board resolution (task 3.4).
- [Measuring is off by a few pixels and shrinks a slide that just fits] → Shrink only above a small tolerance (e.g. 2 px). Check against the baseline deck.
- [Serialized writes delay a page] → `rememberLastVisited` is not awaited, so only the preference POST itself can wait, by at most one in-flight write.
- [`zoom` in print] → Check the PDF export (spec scenario "Printing"). If `zoom` does not survive, fall back to `transform`.

## Migration Plan

`019` runs with the next start. Rollback: no automatic way back, since the mark values are overwritten. Before deploying, keep a backup of the exam DB (as for every migration).

## Open Questions

- Does 2.1 confirm the lost update? (It determines D3 vs. a harness fix.)

  **Answer (2026-11-09): confirmed, in the application.** Three solo runs of `test/exam.test.js` with every `setUserAttribute` logged (start, end, the `vt` the written block carries) were green, 188/188, without a single stale write: Keycloak answered writes in 3-5 ms that day. But the log shows the race narrowly won. In the two failing checks, the student-view phase calls only API routes and renders no page. The one `lastVisitedUrl` write in play is the one of the reload inside `setPreferences(teacher, { vt: 0 })`: that page renders with `vt 0` and, unawaited, writes the whole attribute set back, `config` with `vt 0` included. It finished 1-5 ms before the reset's write started in most resets, and once 1 ms after. A fourth run with every `lastVisitedUrl` write delayed by 150 ms (a temporary debug switch) reproduced the backlog exactly: "Preference "vt" of the teacher session was set to 1, but the application renders with 0" in the writing and Matura checks, the follow-up `403` failures, and 113 writes that put `vt 0` back after a reset. So a slower identity provider (as on 2026-11-07/09) is enough, and a teacher who switches back from student view quickly can hit it too.

  **Conflict found with D3 step 2.** Re-reading the account before every write costs a second identity-provider lookup on every rendered page (`rememberLastVisited`), which contradicts `role-resolution` "Resolving the context costs at most one identity-provider lookup per request" (scenario: "the identity provider is queried once while that request is served"). Decision pending with Gerald.
