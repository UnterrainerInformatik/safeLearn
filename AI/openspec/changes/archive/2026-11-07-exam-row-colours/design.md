## Context

The list of online tests already colours rows (change `2026-11-07-exam-test-list-timing`):
- `exam/client/test-timing.js` exports `testTiming(test, at)` → `open | soon | later | done`.
- `exam/client/tests.js` (`TestList.group`) sets `data-timing` and `title` on each `<tr>` and draws `timingLegend()` above the tables.
- `css/exam.css` (search for `Where a test stands in the list`) defines `--sl-exam-timing-{open,soon,later,done}` and their `-bg` values on `.sl-exam-tests`, dark values under `#markdown-content.dark-mode .sl-exam-tests`, a 5 px `box-shadow: inset 5px 0 0 …` stripe on `td:first-child`, the tint on `tr[data-timing=…]:not(.is-marked) > td`, and `.sl-exam-tests-legend*`.

Constraints in the tables this change touches:
- **Marked row:** `markRows` in `exam/client/frame.js` toggles `tr.is-marked`, styled by `.sl-exam-table tbody tr.is-marked > td` (light `#dfeffc`, dark `#1f3a52`).
- **Sticky columns:** cells with `data-sticky` get `.sl-exam-sticky`, which sets an opaque `background-color` (`#ffffff` / dark `#1e1e1e`) so scrolled cells do not show through. A row tint must be opaque and must override this on sticky cells too.
- **Matura candidate:** `td.sl-exam-participant` has its own background (`--sl-exam-participant-bg`) and must keep it.
- **Gradebook sheet** (`exam/client/gradebook.js`): one `<tr data-student>` per student (built around line 474, `class: "sl-exam-left"` for those who left, which fades them with `opacity: 0.6`). `show(values)` (around line 420) redraws proposal, winter and grade after every save, with `values.effective` (integer 1–5 or `null`, computed server-side as `override ?? proposal.grade`, `exam/gradebook.js` around line 659). A comment row `tr.sl-exam-comment-row` can follow a student's row.
- **Student record** (around line 860): rows for each category (`categoryCell(category)` carries `category.grade`), the winter row in the summer semester (`values.winter`), the proposal (`values.proposal.grade`) and the actual grade (`current.effective`, redrawn on override changes around line 832).
- **Results tables** (`resultsTable(entries)` around line 913, rows from `resultRows`): each row has `grade` as a string (`""` when there is none). `markRow` builds a project's mark row with `mark: true` and no grade.
- **Grading scale** (around line 979): one row per grade 1–4 with its threshold input, and a last row for 5 ("below that").
- **Live view** (`exam/client/live.js`, the participant row around line 481): `data-status` is `"not started" | writing | submitted` (with a space). The suspicious cell is filled by `fillSuspicious(cell, participant)` (around line 603). It runs on every row draw, on `update`, and on the stream's `beats` tick (`silence`, around line 593), sets `cell.dataset.suspicious = "1" | "0"`, and shows signs when `participant.tampered?.length > 0`, `participant.hiddenCount > 0`, or the heartbeat is missing (`silentMs` above 20 s while writing, ticking on the client). `.sl-exam-live-table tr[data-status="submitted"] { opacity: 0.7 }` fades submitted rows today. The view for the class (`/exam/sittings/:id/screen`) has no participant rows.
- **Attendance table** (around line 441): already tinted by handout group (`--sl-exam-group-a/b-bg`) with absent rows faded. Out of scope.

## Goals / Non-Goals

**Goals:**
- One CSS vocabulary for row colours, reused by every coloured table, including the existing test list.
- The colour logic in a DOM-free module with unit tests, so the browser harness only checks that it is wired in.
- No visible change to the test list.

**Non-Goals:**
- Colouring individual result cells of the sheet by their grade. Only rows are coloured.
- Configurable thresholds for the colours. The rule is fixed: 5 bad, 1–2 good.
- The attendance table, the question pool, rosters, the classes list, the config sheet, import tables.
- Colouring anything on the view for the class.

## Decisions

### D1: Shared tones as `data-tone` on the row

Every coloured row gets `data-tone="good|bad|warn|info"` (no attribute for neutral). A flag without a tint uses `data-flag="warn"`. The tokens move from `.sl-exam-tests` to `#markdown-content` (light) and `#markdown-content.dark-mode` (dark), as the participant colours do:

| tone | stripe light | tint light | stripe dark | tint dark |
|---|---|---|---|---|
| good | `#5f9b6a` | `#edf5ee` | `#6fbf7d` | `#1f3524` |
| bad | `#c0392b` | `#fbe3e0` | `#ef6b5b` | `#4a1f1b` |
| warn | `#c77c00` | `#fdf0d5` | `#f0a830` | `#4a3510` |
| info | `#8a9bb0` | `#eef2f7` | `#6f8299` | `#262d36` |

These are the test list's current values (open → bad, soon → warn, later → info, done → good), so the test list does not change visibly.

Rules, scoped to `.sl-exam-table`:
- `tr[data-tone] > td:first-child` gets `padding-left: 12px` and the inset stripe in its tone.
- `tr[data-tone]:not(.is-marked) > td` and `tr[data-tone]:not(.is-marked) > td.sl-exam-sticky` get the tint. The second selector must win over `.sl-exam-sticky`'s white and dark backgrounds, so its specificity must be at least that of `#markdown-content.dark-mode .sl-exam-sticky`. Prefix the rules with `#markdown-content` (and `#markdown-content.dark-mode` where needed).
- `td.sl-exam-participant` keeps its background: exclude it with `:not(.sl-exam-participant)` on the tint rule.
- `tr[data-flag="warn"] > td:first-child` draws an amber stripe. When both a tone and a flag apply (a submitted, suspicious participant), the flag stripe wins on the edge (`box-shadow: inset 5px 0 0 var(--warn)`) while the tone's tint stays. That keeps the flag visible on a green row.

*Alternative considered:* a class per tone (`is-good`). Rejected because `data-*` matches what the test list and the live view already use (`data-timing`, `data-status`) and is easier to query in tests.

The test list keeps `data-timing` as the name of its state and adds `data-tone` mapped from it. Its own `--sl-exam-timing-*` rules and tokens are removed. Its legend switches to the shared legend classes (D4).

### D2: `exam/client/row-tone.js`, no DOM

```js
export function gradeTone(grade)   // 5 → "bad", 1|2 → "good", 3|4|null|undefined|"" → null; accepts numbers and numeric strings
export const timingTone = { open: "bad", soon: "warn", later: "info", done: "good" };
export function setTone(element, tone)   // sets or removes data-tone; the one writer of the attribute
```

`setTone` touches only `element.dataset`, so it needs no DOM in tests (a plain object with `dataset` works). Keeping the rule in one function guarantees the sheet, the record, the results, and the scale agree. Unit tests in `test/exam-row-tone.test.js`.

### D3: The sheet recolours in `show`

The sheet row is created before `show(row)` runs, so `show` gets the `<tr>` and calls `setTone(tr, gradeTone(values.effective))` on every redraw. This covers the initial draw, saved results (`resultCell` passes `show`) and saved overrides (`onSaved: (record) => show(…)`). The sheet of students who left uses the same `row` builder and gets the same colours, still faded by `.sl-exam-left`. A student's comment row stays neutral.

The student record's grade row is redrawn around line 832. It calls `setTone` on its `<tr>` there too.

### D4: Legends only where the value is not in the row

The sheet, the record and the results show the grade in the row, and the grading scale is their legend, so they get no legend. The live view's rows do not say "submitted" in a colour-specific way and the stripe has no text, so the live view gets a legend: "submitted" (good) and "suspicious signal" (warn stripe). The legend markup is shared: `.sl-exam-legend` with `.sl-exam-legend-item[data-tone]`, or `[data-flag]`, replacing `.sl-exam-tests-legend*`. The stripe-only legend item has no tint.

### D5: Live view

`data-tone="good"` for `status === "submitted"`. Delete the `opacity: 0.7` rule. `data-flag="warn"` while the suspicious cell has any sign. `fillSuspicious` already decides that (`cell.dataset.suspicious`), so it also sets or removes `data-flag` and `title` on `cell.closest("tr")`. Every path that redraws the cell, including the 5 s `beats` tick, then raises and clears the flag with it. On the first draw, `suspiciousCell` (around line 582) fills the cell before it is in a `<tr>`, so `closest("tr")` is null there. `row()` therefore sets `data-flag` from `cell.dataset.suspicious` once the `<tr>` is built. The view for the class is untouched.

### D6: Tooltips

Rows whose value is visible (grades) need no tooltip. The live view's flagged row gets `title` with the suspicious text already used in its cell. The test list keeps its existing `title`.

## Risks / Trade-offs

- [A red row on the student's own results page could feel harsh] → It is the school's familiar convention for "Nicht genügend", and the grade is shown anyway. If it turns out to be unwelcome, the student view can drop `data-tone` without touching the rule.
- [Specificity fights with `.sl-exam-sticky`, `.is-marked`, `.sl-exam-participant`] → D1 lists the selectors. The harness checks the computed background of a sticky cell and of a marked row.
- [The sheet with many red rows becomes loud] → Tints are light (the same as the test list), and the stripe carries most of the signal.
- [Faded rows of students who left with a tint] → `opacity` applies to the whole row including the tint, which is acceptable: they still read as left.

## Migration Plan

Client and CSS only. No API or database change. Rollback is reverting the commit.
