Source proposal: `AI/proposals/plugin-modal-spacing.md`

## Why

Both dialogs the plugin opens build their content as a run of elements straight into `contentEl`: a heading, a field, a button. Nothing stands between the last two. `ColumnCountModal` writes the number field and the button one after the other, `NameListModal` does the same with a textarea, and on screen the button sits against the lower edge of the field it belongs to.

That reads as one grown-together control rather than as *type here, then confirm*, and a click aimed at the button lands in the field often enough to be noticed. It is a small thing, and it is one of the few small things a person sees every single time either command is used.

The dialogs also have no shape of their own to fall back on. Each lays itself out by the order its elements were created in, so what they look like is whatever `contentEl` does with a heading, a field and a button — which is what produced this in the first place, and which will produce it again for the next dialog somebody adds.

## What Changes

- **The confirmation stands in the container Obsidian uses for it.** Both dialogs put their button into a `modal-button-container` of their own rather than directly into `contentEl`. What separates it from the field is then the spacing of the theme the person is running, and there is no length written into this plugin that a theme can disagree with.
- **Both dialogs are laid out the same way**: heading, whatever explains the field, the field, and the confirmation below it in its container. They ask different questions — a count, a list of names — and that difference stays in the field, which is where it means something. Two layouts for *a field and a confirmation* would be a distinction that says nothing.
- **What the dialogs do is untouched.** Same fields, same default of three columns, same minimum of two, same keyboard behaviour — Enter confirms the count, Ctrl/Cmd+Enter confirms the list, because Enter belongs to the list — and the same text is written into the document.
- **A check says what is actually claimed here, and what is claimed is a geometry.** That there is space between the two boxes is not something a class name can prove, so it is read the way `columnsAreSideBySide` reads its claim: from the boxes the layout produced.

## Capabilities

### Modified Capabilities

- `plugin-authoring-commands`: gains the requirement that a command asking for something asks it in a dialog laid out as a field and a separated confirmation, and that both dialogs are laid out alike. The capability already says which commands ask (the column count, the list of names), what may be given and what is written from the answer; it says nothing about the asking itself, which is why the two dialogs could drift into two shapes without any requirement noticing.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` symlink): `ColumnCountModal.onOpen` and `NameListModal.onOpen` — the two `contentEl.createEl("button", …)` calls and nothing else in either class.
- **`styles.css`**: nothing, unless the container turns out to arrive without spacing of its own. A length added here is one that fights the theme on the next machine, so it is a fallback and not the plan.
- **`test/obsidian/harness.js`**: a helper that reports the field's box and the button's box of the open dialog, in the shape of `columnsAreSideBySide`. `answerColumnCount` and `answerNameList` address `.modal-container input` / `.modal-container textarea` and `.modal-container button`; the field is where it was, and the button is still the only `button` in the container — which a run has to prove rather than an argument.
- **`test/obsidian/plugin.test.js`**: one check per dialog, so that a change to one of them cannot leave the other behind quietly.
- **`tools/obsidian-screenshots.mjs`**: it photographs the name-list dialog (`name-list`, kept in the plugin repository and not copied into the documentation) and clicks `.modal-container button` afterwards. The picture changes, and the click has to keep finding the button.
- **No server file is read or changed.** Nothing here is about what the server does with a document.
