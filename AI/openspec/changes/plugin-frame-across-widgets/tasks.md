## 1. Establish what the editor builds

- [ ] 1.1 Write a document holding, inside one permission block, every element the live preview renders in place of lines — a table, a callout, a Mermaid block, a `$$…$$` block, an embedded note — and read back the children of `.cm-content` with their classes. It is the list the repair is measured against, and it belongs in the vault the run assembles rather than in `md/`.
- [ ] 1.2 Confirm on that document what the proposal measured: which children are `cm-line` and carry the frame today, and which are not. An ordinary fenced code block stays a line and is already correct — it is the control case.

## 2. Reach the widget elements

- [ ] 2.1 Take the block classes for a line out of `buildDecorations`' `lineClasses` map in a form a second consumer can read, so that the decorations and the DOM pass answer out of one walk rather than two.
- [ ] 2.2 Add the pass: for each child of `.cm-content` that is not a `cm-line`, resolve its line with `posAtDOM`, add the classes that line carries, remove the ones it does not, and skip an element the editor does not own rather than failing the update.
- [ ] 2.3 Run it in the write phase of `view.requestMeasure` after an update, so nothing is written to the DOM mid-update.
- [ ] 2.4 Add a `MutationObserver` on `.cm-content`'s child list calling the same function, for the elements Obsidian fills in after the update — the diagram and the embedded note are the two known ones. Disconnect it when the plugin is destroyed.
- [ ] 2.5 Establish that the pass is idempotent and that the observer does not react to its own writes.

## 3. Draw one rectangle

- [ ] 3.1 Hold the side edges at the element's padding box rather than at a fixed inset, so that the edge on a table widget stands in the same vertical line as the edge on a text line. Do not neutralise the widget's negative margin — that is the room Obsidian gives a wide table.
- [ ] 3.2 Give the side-by-side block's classes the same treatment, from the same rule. Two block kinds, one shape.
- [ ] 3.3 Leave what Obsidian draws alone: the callout keeps its colours, the table its borders and its horizontal scrolling.
- [ ] 3.4 Check both themes, as the existing frame rules are checked.

## 4. Say it in checks

- [ ] 4.1 Give the harness a way to read the laid-out boxes of the elements carrying a block's classes — top, bottom, left, right — in the order they stand on screen.
- [ ] 4.2 A table in the middle of a permission block: the framed elements form one unbroken vertical run, with the table among them and no gap between neighbours.
- [ ] 4.3 The side edges of that run share one x-coordinate, which is what the class alone cannot establish.
- [ ] 4.4 A block whose entire content is a table is one closed frame: the lid on the block's first line, the floor on its last.
- [ ] 4.5 A table inside a side-by-side block is inside the block's region.
- [ ] 4.6 A table outside every block carries no frame — the pass adds nothing where the document says nothing.
- [ ] 4.7 A table typed into an existing block is framed without the document being reopened, and a table left outside by moving the block's closing marker above it loses the frame.
- [ ] 4.8 The reading view still shows what it shows: the existing checks for it pass unchanged, and no new class reaches it.

## 5. Close it out

- [ ] 5.1 Run `npm run test:obsidian`; green.
- [ ] 5.2 Run `npm test`; green. `test/directive-grammar.test.js` loads the plugin's source into a context of its own — anything new evaluated at load time has to be answerable by its stubs.
- [ ] 5.3 Record in `AI/architecture.md` §9 whatever this accepts rather than repairs, and drop the entry if it accepts nothing.
- [ ] 5.4 Update `README.md` in the plugin repository only if what a teacher sees changed in a way worth describing; a frame that no longer breaks is the frame that was already described.
