## Context

See proposal.md — Why. What shapes the approach, all in `AI/plugin/main.ts`'s `NameListModal`:

- The textarea is the dialog's only output today: `appendName` appends to it, `confirm` splits it per line, and `onList` receives that. Everything else — the picker, the class filter, the checkboxes — feeds it.
- `checkedResultNames` deliberately survives a re-render so a mark is not lost when the search changes, which is what makes the current selection partly invisible.
- Nothing inside `buildDirectorySearch` may be a `<button>`: `test/obsidian/harness.js` finds the dialog's field and confirmation by querying for the modal's first input/textarea and its first button. Removing the textarea moves that first input to the picker's search field, so the harness's assumption breaks rather than merely shifting.
- Without a login the picker is not built at all and the dialog is what it was before `plugin-admin-directory-ui`.

## Goals / Non-Goals

**Goals:**
- Taking a filtered class over costs one action, not one per person.
- What will be inserted is visible at all times and reversible in one click.
- No state a person cannot see: nothing chosen off-screen without being listed.

**Non-Goals:**
- Typing free names next to the picker. A name the directory does not hold is written in the document afterwards (the user's call — it keeps the dialog to one way of naming people).
- Reordering, sorting or grouping the chosen list.
- Any change to what the picker searches, how it filters, or what the server returns.

## Decisions

### The chosen list is the dialog's model, and the textarea becomes its fallback

`chosenNames: string[]` — insertion order, deduplicated on trimmed exact match — replaces both `checkedResultNames` and the textarea as what `confirm` reads. The textarea is built only where no picker is shown, and additionally revealed if the picker reports `unreachable` or `failed`, so a reachable-instance-but-dead-directory can still be answered. That fallback is why the spec says a command must not leave a person with neither way of naming anybody.

*Why insertion order and not sorted:* the command writes one section per name in the order given (`plugin-authoring-commands`), and a person taking over 4AHIF then adding two teachers means that order.

*Why dedupe on the trimmed exact name:* that is what the picker returns and what the document carries; `plugin-authoring-commands` requires the name written as given, so folding case here would have to be undone when writing.

### Clicking a row moves it; there is no separate move control

A result row's whole surface moves that person down, a chosen row's whole surface takes them back out. This replaces the current "click the row toggles its checkbox" indirection, which existed only because the checkbox was the state. Both stay clickable `<div>`s — never `<button>`s — for the harness reason above.

*Alternative considered:* keep the checkboxes and add a "select all" control. Rejected by the user in favour of this: with checkboxes the selection is still invisible once it scrolls or is filtered away, which is half the complaint.

### "Add visible" takes exactly what the result list is showing

It moves `lastEntries` — what was last rendered — not the last search's full result and not the whole directory. The wording matters for the class-filter case: `runSearch` already unions the checked classes and renders the union, so "visible" is that union.

### The harness answers the dialog the new way

`answerNameList` and `dialogBoxes` (`test/obsidian/harness.js`) stop assuming a textarea is the dialog's first field. They locate the picker's own elements by the `safelearn-` classes already used for exactly this purpose (`data-safelearn-name` is already on result rows), and keep the textarea path for the no-login case, which still exists. Confirmation stays the modal's first and only `<button>`.

### Ctrl/Cmd+Enter moves from the field to the modal

The binding sits on the textarea today, which no longer exists where the picker is shown. It moves to the modal's content element, so it confirms either way, while Enter inside the textarea keeps belonging to the list where that field is shown.

## Risks / Trade-offs

- **A person who wants a name the directory lacks now has to add it in the document** → Accepted, and the user's explicit preference; the directory's own search field is the first place they will look, and a missed name is visible in the written document rather than silently dropped.
- **Removing the textarea where a picker is shown changes a dialog people have muscle memory for** → It is the same dialog reached from the same commands, and the chosen list stands where the field stood.
- **The harness's "first input" convention gets more fragile as the dialog grows** → Addressed by locating picker elements through their existing `safelearn-` classes rather than by position.
- **A very long chosen list could push the confirmation out of view** → The chosen list scrolls within its own box, the way the results list already does.

## Migration Plan

Plugin-only; released per `AI/memory/plugin-release-process.md`. No server change and no data migration — a dialog's shape is not persisted anywhere. Rollback is a plugin version revert.
