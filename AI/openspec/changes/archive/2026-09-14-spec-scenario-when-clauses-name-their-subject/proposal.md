## Why

Eight `WHEN` clauses in the semester table requirements end on a preposition with nothing after it:

- **WHEN** the dialog is generated from with more than one weekday ticked
- **WHEN** an end date earlier than the start date is generated from
- **WHEN** a range is generated for with one weekday ticked

The verb is transitive — a table is generated *from* a dialog, *for* a range — and the object went
missing, leaving the subject of the sentence standing where the object belongs. Three of the eight
then had a condition appended to them by the change that shipped on 2026-09-14, which is how
"generated from with more than one weekday ticked" came about.

A scenario is read by whoever is deciding whether the behaviour in front of them is the behaviour
that was specified. Reading it should not cost a second pass to work out which noun is doing what.
Nothing about the behaviour is in question here: every one of the eight is unambiguous once read
twice, and the checks that cover them are green and stay untouched.

## What Changes

- The eight `WHEN` clauses are rewritten so that the sentence names what is generated. Each becomes
  "a table is generated from the dialog …" or "a table is generated for a range …", which is what
  each of them was already trying to say.
- Nothing else. No requirement text changes, no `THEN` changes, no scenario is added, removed or
  renamed, and no behaviour is specified differently than it is today.

Decisions taken here, recorded so the specs need not re-argue them:

- **The subject becomes the table, not the dialog.** "The dialog is generated from" reads as though
  the dialog were the thing produced. What the command produces is the table, and the dialog and the
  range are what it is produced from and for — so the table is the subject and the two are where
  they belong.
- **The conditions stay where they are.** "… with exactly one weekday ticked" is the part that
  distinguishes one scenario from its neighbour, and it reads correctly once the clause in front of
  it does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-authoring-commands`: three requirements carry the eight clauses — "The table is written in
  the shape the corpus already uses", "Every date in the range is written and none is skipped", and
  "A span that describes no lessons writes no table". Each is restated with its scenarios reworded
  and its requirement text unchanged.

## Impact

- `AI/openspec/specs/plugin-authoring-commands/spec.md` — eight lines, on archive.
- No code, no tests, no corpus. The behaviour these scenarios describe is the behaviour that shipped
  as plugin 1.0.16 and is covered by `test/semester-table.test.js` and `test/obsidian/plugin.test.js`
  as they stand.
