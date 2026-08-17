## 1. Establish what a well-formed block is

- [x] 1.1 Read `preprocessSideBySide` (`obsidian.js:885`) and write down what the document has to carry and what the renderer adds itself — which markers are removed, what the split is on, what is trimmed, and where the blank lines around a column come from.
- [x] 1.2 Confirm against the plugin's own `isMarkerLine`: the line must be nothing but the marker, which is stricter than the renderer and is the rule that decides the shape a command writes.

## 2. The registry the menu and the palette are built from

- [x] 2.1 Add a list of authoring actions to `main.ts` — an id, a name, and what the action does to an editor — and register one Obsidian command per entry.
- [x] 2.2 Subscribe to `editor-menu` once and build the plugin's entries from the same list, standing together as a group of their own. A submenu was the first shape considered; `MenuItem.setSubmenu` is not part of Obsidian's published API, and `setSection` is — so the entries are one section rather than one item, which keeps them together in a menu the plugin does not own.
- [x] 2.3 Leave the list open for `plugin-section-authoring` to add to, and say so where it is declared.

## 3. The side-by-side commands

- [x] 3.1 Write the block from the tag constants the recognition rules already hold: the opening marker, the content, one separator and one empty line per further column, the closing marker.
- [x] 3.2 Enclose a selection whole and write no separator into it.
- [x] 3.3 Begin the insertion on a line of its own where the cursor stands mid-line.
- [x] 3.3a Write nothing above a directive that gates the file. Found while reviewing rather than planned: an insertion at the very top pushes that line down, and the document becomes readable by everyone — silently, through a command somebody ran to add a column. It costs one condition in `writeLines` and one in the fragment command's walk upward, and it has a check of its own.
- [x] 3.4 Leave the cursor where the next thing belongs: the first empty column, in both cases. Written first as "after the block when there was a selection", and corrected while building — after wrapping a selection the next thing a person writes is the other column, and that is the same answer the empty case gives.
- [x] 3.5 Register the two-column command, which asks nothing.
- [x] 3.6 Register the command that asks for a count, with a modal defaulting to three, refusing a count below two and setting no upper bound.

## 4. The fragment command

- [x] 4.1 Find the block the cursor is in — the run of non-blank lines around it, or the selection's first line — and write the marker on its own line above it.
- [x] 4.2 Leave the document otherwise as it was, and the cursor where the person was writing.

## 5. Give the harness what it lacks

- [x] 5.1 Add running a command by id to `test/obsidian/harness.js`, and reading the document afterwards — what a command inserts is a statement about a person's file.
- [x] 5.2 Add opening the editor's context menu and reading what the plugin put in it.
- [x] 5.3 Add setting a selection and reading where the cursor ended up.

## 6. Check it

- [x] 6.1 The two-column command with nothing selected produces a block the plugin marks, with each marker on its own line.
- [x] 6.2 The same command with several paragraphs selected encloses them unchanged, with no separator inside them.
- [x] 6.3 The command that asks produces the number of columns it was given, and refuses a count below two.
- [x] 6.4 A command invoked mid-line does not leave a marker sharing a line with text.
- [x] 6.5 The fragment command puts the marker above the whole paragraph the cursor was in, and does not divide it.
- [x] 6.6 Every command in the registry is offered in the context menu, established against the registry rather than against a list written down in the check.
- [x] 6.7 The cursor is left where the next thing written belongs.

## 7. Close it out

- [x] 7.1 Run `npm run test:obsidian`; green.
- [x] 7.2 Run `npm test`; green. `test/directive-grammar.test.js` loads the plugin's source into a context of its own; a class declaration evaluates its base at load time, so a name missing from its stubs costs every check in that file rather than the one that uses it — this change's `Modal` was the second time. Make the stubs answer an unknown name with a class instead of adding a third entry: what a directive grammar means is not a question about the plugin's import list.
- [x] 7.3 Update `README.md` in the plugin repository with the commands and where they are reached.
