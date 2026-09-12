## Why

Taking a whole class over from the picker costs one click per person. Narrowing the student picker to `4AHIF` offers about thirty people, and every one of them needs its checkbox ticked before "Add selected" does anything — the one case the class filter exists to serve is the one the picker makes most tedious.

The checkboxes also hide what is actually selected. `checkedResultNames` survives a filter change on purpose, so "Add selected" can carry names the current filter no longer shows; nothing in the dialog says so, and there is no way to see or undo a mark that has scrolled out of the result list.

## What Changes

- The picker's result checkboxes are removed. Clicking a result moves that person into a list of chosen people below it; clicking them there takes them back out.
- "Add selected" becomes "Add visible": it moves everyone the result list currently shows into the chosen list in one action.
- Choosing the same person twice leaves them in the chosen list once.
- The chosen list is what gets inserted, and it is visible the whole time — including people chosen under a filter that no longer shows them.
- **BREAKING** for the dialog's shape where a picker is shown: the free-text field goes away, and the chosen list takes its place. Names not in the directory are added afterwards in the document itself. Where no picker is shown (no instance configured, or no login held) the dialog keeps the free-text field unchanged — without it there would be no way to name anybody at all.
- Confirming from the keyboard moves from the text field to the dialog, so Ctrl/Cmd+Enter still confirms where the field no longer exists.

## Capabilities

### New Capabilities

<!-- None: this changes how an existing picker is operated, not what the plugin can do. -->

### Modified Capabilities
- `plugin-directory-search`: people are chosen by moving them into a visible list rather than by marking checkboxes; everything currently offered can be taken over in one action; what has been chosen is shown and can be taken back out.
- `plugin-authoring-commands`: where the directory picker is shown, the name list is given by choosing people rather than by typing into a field, and the dialog rather than the field carries the keyboard confirmation.

## Impact

- `AI/plugin/main.ts`: `NameListModal.onOpen` (the textarea, `appendName`, `confirm`, the Ctrl/Cmd+Enter binding) and `buildDirectorySearch` (`checkedResultNames`, `renderResults`, the "Add selected" control).
- `AI/plugin/styles.css`: `.safelearn-directory-result` loses its checkbox rule; the chosen list needs its own.
- `test/obsidian/harness.js`: `answerNameList` and `dialogBoxes` find the dialog's field and confirmation by querying for the first input/textarea and the first button. With a picker shown there is no longer a textarea to find, so both need to answer the dialog the new way.
- `test/obsidian/plugin.test.js`: the picker's interaction tests.
- No server-side change: the endpoint, the queries and what is returned are untouched.
