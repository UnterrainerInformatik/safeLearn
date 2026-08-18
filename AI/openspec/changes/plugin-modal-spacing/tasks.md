## 1. Give both dialogs one shape

- [x] 1.1 In `ColumnCountModal.onOpen`, create a `modal-button-container` on `contentEl` and put the Insert button in it, so that what stands between the number field and the button is the theme's spacing and not a length this plugin chose.
- [x] 1.2 Do the same in `NameListModal.onOpen`, so that the two dialogs differ in the field they carry and in nothing else.
- [x] 1.3 Leave everything else in both classes untouched: the fields, the default of three columns and the minimum of two, `confirm()` in both, Enter for the count, Ctrl/Cmd+Enter for the list, and the focus and selection each dialog opens with.
- [x] 1.4 Add nothing to `styles.css` unless the container arrives without spacing of its own — and if it does, add the fallback there and say in the file why a length lives in a plugin at all.

## 2. Say it in checks

- [x] 2.1 Add a harness helper that reports the field's box and the button's box of the dialog that is open, in the shape of `columnsAreSideBySide`: what is claimed is a geometry, so what is read has to be one.
- [x] 2.2 Check the dialog that asks for a column count: the button's box stands below the field's and the two do not touch, with no particular distance asserted.
- [x] 2.3 Check the dialog that asks for a list of names against the same expectation, so that a change to one dialog cannot leave the other behind.
- [x] 2.4 Leave `answerColumnCount` and `answerNameList` addressing the button as the `button` in `.modal-container`, and let the run prove that it still is one — the button gained an ancestor, not a competitor.

## 3. Close it out

- [x] 3.1 Run `npm run test:obsidian`; green, including the two new checks.
- [x] 3.2 Re-take the screenshots: `npm run docs:screenshots`. The `name-list` shot is of the dialog this change re-lays out. It stays in the plugin repository and is not copied into the documentation, so nothing published changes.
- [x] 3.3 Look at both dialogs in a second theme before calling it done. The whole reason the spacing is not a number here is that one theme cannot answer for the others.
- [x] 3.4 Nothing for `AI/architecture.md` §9: this accepts no divergence from the renderer, and what the commands write is unchanged.
