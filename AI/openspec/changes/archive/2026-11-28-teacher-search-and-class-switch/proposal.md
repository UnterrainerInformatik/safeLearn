## Why

An admin enters teachers in classes from the directory's roughly 250 teachers. Every place offers only a long list or a dropdown, and nothing can be typed. Finding "Franz Gruber-Leitner" means scrolling. A second issue came with `class-bound-teachers`. A teacher on a class page, with no course chosen, who switches the class in the bar lands on that class's course page whenever it has a single course. The teacher asked for a class, not a course.

## What Changes

- **New:** every place where an admin picks teachers gets a text field that filters the list as the admin types. It covers the class page's "enter teacher" control, the teacher list of "new class", and the year change's list of the directory's other teachers. The field splits the input at spaces. A teacher is shown when every piece appears in their family name, given name or username, case- and accent-insensitive, in any order. So `gru lei` finds `Gruber-Leitner Franz`, and so does `franz gru`.
- On the class page, the dropdown becomes the filter field with a list of matches beneath it. Each match has its own "enter" button.
- **Changed:** a class chosen by the teacher in the bar no longer leads on to that class's single course. The class page stays open. Only the bar's own choice still continues to the right: the start page, or a year change that leaves a single class, still leads through a single class to its single course.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `class-teachers`: new requirement that an admin finds a teacher by typing parts of the name, wherever teachers are picked.
- `exam-navigation`: "A position with a single choice is chosen at once" no longer continues from a class the teacher chose.

## Impact

- `exam/client/classes.js`: `teacherSection` (dropdown → filter + matches), `checklist` for the new-class teachers, the year change's other-teachers list. Also one shared matching helper.
- `exam/client/bar.js`: `connectBar`. A class choice no longer sets the cascade key, and only the bar's own class choice does.
- `i18n/de.json`, `i18n/en.json`: placeholder and label for the filter field, plus "nobody matches" (BabelEdit format, same keys in both).
- `css/exam.css`: filter field and match list.
- `test/exam.test.js`: browser checks for the filter and for the class switch.
- `docs-exam-module.md`: describe the filter and the narrowed preselection.
- No server, API or migration change. The teacher list (`/directory/teachers`) is already loaded whole on the client.
