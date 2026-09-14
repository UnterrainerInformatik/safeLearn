## 1. The teacher half carries its parentheses

- [x] 1.1 In `subjectHeading`, wrap the trimmed teacher half in `(…)` unless it already begins with `(`
      and ends with `)` — the predicate from design.md, not a looser "contains a bracket" test
- [x] 1.2 Leave the subject half exactly as it was given, and leave the lone-half rule as it is: a
      teacher half given alone is still the whole heading, now in its parentheses
- [x] 1.3 Change the teachers field's placeholder in `SemesterTableModal` from `(UNTEG)` to `UNTEG`, so
      the field stops asking for what the plugin now writes

## 2. The weekday column follows what was ticked

- [x] 2.1 Give `semesterTableLines` a parameter saying whether the weekday column is wanted, and build
      the headings and every row without it where it is not — widths, delimiter row and the marker
      column all derive from the headings array, so nothing else needs touching
- [x] 2.2 Pass it from `insertSemesterTable`, computed from the `weekdays` set it already holds
      (`weekdays.size > 1`) — not from the weekdays the generated dates happen to contain (design.md —
      Decisions)
- [x] 2.3 `npm run build` in the plugin repo and confirm the bundle builds clean

## 3. Tests in safeLearn

- [x] 3.1 `test/semester-table.test.js`: the column-list check keeps `Day` for a table generated with
      two weekdays ticked, and a new case asserts the column is absent with one ticked — including that
      each row then starts marker, date
- [x] 3.2 `test/semester-table.test.js`: the no-subject-column case carries the marker column, `Date` and
      `Info` for one ticked weekday, and `Day` as well for two
- [x] 3.3 `test/semester-table.test.js`: `subjectHeading` cases for a bare teacher half (`UNTEG` →
      `(UNTEG)`), one given with brackets already (unchanged, not doubled), a teacher half given alone,
      and a subject half alone (no brackets)
- [x] 3.4 `test/obsidian/plugin.test.js`: the end-to-end table test generates for one weekday, so it
      becomes the without-`Day` case; add the with-`Day` case by ticking a second weekday, and feed one
      subject column its teacher half without brackets so the plugin's wrapping is seen end to end
- [x] 3.5 Check whether the DST, month/year-boundary and holiday cases in `test/semester-table.test.js`
      read the weekday out of a column that a single-weekday fixture no longer has, and fix the ones
      that do — by ticking two weekdays where the check is about the weekday itself
- [x] 3.6 `npm test` and `npm run test:obsidian` both green

## 4. Verification in the vault

Run rather than clicked through, as in the change this one follows. The checks live in
`test/obsidian/plugin.test.js`, which drives a real Obsidian over the debugging protocol
(`npm run test:obsidian`), and in `test/semester-table.test.js`, which calls the plugin's own code out
of `main.ts` (`npm test`).

- [x] 4.1 A subject column given `0WMC` and `UNTEG` writes the heading `0WMC<br>(UNTEG)`, the form every
      heading in the corpus has — asserted directly on `subjectHeading`, and end to end through the
      dialog, whose fixture now gives that half without its brackets
- [x] 4.2 The same column given `0WMC` and `(UNTEG)` writes the same heading, with one pair of brackets
      — asserted beside it, along with `(UNTEG+LANDH`, which is a half missing its closing bracket
      rather than a bracketed one and is therefore bracketed
- [x] 4.3 One weekday ticked over the winter semester: the table carries no `Day` column, and its rows
      still read marker, date, empty subject cells, empty `Info` — the end-to-end table check generates
      exactly this, 21 Mondays, and reads the rows back
- [x] 4.4 Two weekdays ticked over the same span: the `Day` column is there and its rows interleave in
      date order, as before — its own end-to-end check, Mon+Thu; and the column follows what was ticked
      rather than what the range holds, which is checked on a span too short to hold a Thursday
- [x] 4.5 Generated next to a hand-written table in a real class file: both still read as tables, and
      Obsidian's table editor leaves the generated one alone on first edit — the table-editor half is
      the Obsidian suite's check that an edit widens only the column typed in. The shape was compared
      against `secureLectures/md/4BHIF/26-27 - 4BHIF - WS.md`, whose hand-written table carries no
      weekday column: generated for one ticked weekday it now matches that file's heading row cell for
      cell, which is the gap the previous change recorded and this one closes

## 5. Release

- [x] 5.1 Bump the version in the three places, push, tag, and cut the GitHub release with `main.js`,
      `manifest.json` and `styles.css` — 1.0.16, a patch bump: the output changes visibly, but this
      follows the precedent set at 1.0.2
