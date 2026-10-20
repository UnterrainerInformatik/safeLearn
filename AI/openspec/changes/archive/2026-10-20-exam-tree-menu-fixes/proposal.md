## Why

The category menu in the question pool's tree (the ⋯ button) shows two flaws: for every category that is not empty, its last line reads `null`, and its first entry, **New question**, looks like a link (underlined, in link colour) while the other entries read as a plain list. Both make the new menu look broken.

## What Changes

- The menu of a category that is not empty ends with Rename; no stray `null` line. (Cause: `openMenu` in `exam/client/pool-tree.js` passes `this.menuDelete`, which is `null` there, to `replaceChildren`, and the DOM turns `null` into the text "null".)
- **New question** is an entry like the others: same look, same focus and hover, no underline or link colour. It still opens the editor for a new question in that category.

## Capabilities

### New Capabilities

### Modified Capabilities
- `question-editor`: the requirement "Categories are created, renamed and deleted at the node" states that the menu holds only its entries and that they look alike.

## Impact

- `exam/client/pool-tree.js` (`openMenu`).
- `css/exam.css` (the menu's entry rules for `a.sl-exam-tree-menu-item`, if they are no longer needed).
- `test/exam.test.js`: the menu tests gain a check of the menu's text and of the New question entry.
- No API, data or dependency change.
