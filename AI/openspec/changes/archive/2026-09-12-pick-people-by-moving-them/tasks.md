## 1. The chosen list replaces the checkbox state

- [x] 1.1 Introduce `chosenNames` (insertion-ordered, deduplicated on the trimmed exact name) in `NameListModal` and remove `checkedResultNames` from `buildDirectorySearch`.
- [x] 1.2 Render the chosen list below the results as clickable `<div>` rows (never `<button>`s), each carrying the name in a `data-safelearn-name` attribute the way result rows already do.
- [x] 1.3 Make a click on a chosen row take that person out of the list, and re-render.
- [x] 1.4 Show how many people are chosen, so a selection carried over from an earlier filter is countable at a glance.
- [x] 1.5 Scroll the chosen list within its own box so a long selection never pushes the confirmation out of view; style it in `AI/plugin/styles.css` alongside the existing results rules.

## 2. Choosing from the results

- [x] 2.1 Remove the result checkbox and its stylesheet rule; make a click anywhere on a result row move that person into the chosen list.
- [x] 2.2 Leave an already-chosen person in the list once when they are chosen again.
- [x] 2.3 Rename the "Add selected" control to "Add visible" and make it choose exactly `lastEntries` — what the result list is currently showing, including the union of several checked classes.
- [x] 2.4 Make "Add visible" a no-op that loses nothing already chosen when the result list is empty.
- [x] 2.5 Keep an already-chosen person chosen when a new search re-renders the results, without duplicating them.

## 3. What the dialog confirms

- [x] 3.1 Build the textarea only where no picker is shown, and make `confirm` read `chosenNames` where one is.
- [x] 3.2 Reveal the textarea as a fallback when the picker reports `unreachable` or `failed`, and have `confirm` read it in that case, so a dialog is never a dead end.
- [x] 3.3 Move the Ctrl/Cmd+Enter binding from the textarea to the modal's content element, keeping Enter belonging to the list inside the textarea where that field is shown.
- [x] 3.4 Confirm that `onList` still receives display names in the order they were chosen, trimmed and otherwise unchanged.

## 4. Test harness and tests

- [x] 4.1 Update `answerNameList` and `dialogBoxes` in `test/obsidian/harness.js` to drive the picker through its `safelearn-` classes rather than through "the modal's first input/textarea", keeping the textarea path for the no-login case.
- [x] 4.2 Add plugin tests in `test/obsidian/plugin.test.js`: clicking a result moves it down; clicking it in the chosen list removes it; choosing the same person twice holds them once; "Add visible" takes the whole filtered list in one action; two filters in turn accumulate.
- [x] 4.3 Add a test that a chosen person survives a filter change that no longer shows them, and is still inserted.
- [x] 4.4 Add a test for the no-login dialog being unchanged, and one for the unreachable-directory fallback field.
- [x] 4.5 Run `npm test` and confirm the existing authoring-command tests still pass unchanged.

## 5. Documentation

- [x] 5.1 Update `docs-obsidian.md` where the picker's checkbox interaction is described.
- [x] 5.2 Update `AI/plugin/README.md` if it describes picking people.
