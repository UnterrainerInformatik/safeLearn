## 1. Read what the two sides actually do

- [x] 1.1 Read `preprocessSideBySide` (`obsidian.js:885`) and write down the split rule the reading view has to mirror — which markers are stripped, what the content is split on, what is trimmed, and why the blank lines around a column are there.
- [x] 1.2 Establish what Obsidian hands a markdown post-processor: that `ctx.getSectionInfo(el)` returns the whole document text with the section's line range, and what it returns where there is no file behind the render. Record the answer in `design.md` if it differs from what that document assumes.

## 2. One walk for both views

- [x] 2.1 Take `resolveBlocks` off CodeMirror's `Text`: give it a line source (a count and a line-number-to-text function) so the editor and the reading view resolve blocks by one walk with one rule.
- [x] 2.2 Adapt the editor's call site to the new signature, leaving what it decides unchanged.

## 3. The heading both views show

- [x] 3.1 Add one function that builds the heading element from a `DirectiveEntry[]` and whether the line is the file-level form. Both views call it; neither builds a heading of its own.
- [x] 3.2 Give each entry a chip carrying its distinction — entry, timed, broken window, view switch, unresolved switch — and the entry's text as the document writes it, window included, with nothing restated.
- [x] 3.3 Give a discarded entry a chip that says the server does not read it, rather than leaving it out of the heading.
- [x] 3.4 Give a directive from which nothing is readable a heading of its own, stating that no reader sees the block.
- [x] 3.5 Add the chip and heading classes to `styles.css`, in both themes, using the channels a chip can carry and the entry marks cannot.

## 4. The editor replaces the directive line

- [x] 4.1 Emit a `Decoration.replace` with the heading widget over a directive line while no cursor is in it and no selection touches it; emit none when one is.
- [x] 4.2 Suppress the per-entry marks on a line that is replaced, and emit them unchanged when the replacement is lifted.
- [x] 4.3 Give the widget an `eq` over the text it was built from, so a rebuild that changes nothing hands back a widget the editor can keep.
- [x] 4.4 Leave the range non-atomic, so that moving the cursor into it is what lifts the replacement, and confirm the line decorations of the block still apply to the replaced line.
- [x] 4.5 Draw the file-level directive's frame open at the bottom in the editor, in the same shape the reading view uses.

## 5. The reading view

- [x] 5.1 Replace `cleanPreview` with a post-processor that reads `getSectionInfo`, resolves the blocks over the document's lines, and decides what its own section is from its line range.
- [x] 5.2 Remove tag text from the text node that holds it, by rewriting the node's data rather than replacing the node, and remove a section whose source lines held nothing but tags. Ask that of the source, not of the rendered result: it was written first as "the section has no text left", which also empties a paragraph holding only an image, a rule or a diagram — found while reviewing, and it has a check of its own now.
- [x] 5.3 Show a directive line as the heading, a closing marker as nothing, and the lines of a block inside the frame — sides on every section, lid on the first, floor on the last.
- [x] 5.4 Render a side-by-side block as columns from its source at the section that opens it, splitting it as `preprocessSideBySide` splits it, and hide every other section of that block.
- [x] 5.5 Remove `##fragment` with nothing left in its place.
- [x] 5.6 Handle the case where there is no section info: strip tag text, assert no structure, and do not recurse into the plugin's own rendering.
- [x] 5.7 Add the reading view's classes to `styles.css`, in both themes, so the frame reads as the same frame the editor draws.

## 6. Rewrite the checks that now say something else

- [x] 6.1 Add the new classes to the frozen `markerClasses` list in `test/obsidian/harness.js`, and give the harness whatever it lacks for asserting about a replaced line and about the reading view.
- [x] 6.2 Rewrite `the cursor entering a tag changes no text and leaves the tag marked` to state what it now has to state: that the cursor changes no document text while changing what is shown.
- [x] 6.3 Rewrite the eight directive checks the source proposal lists (`plugin.test.js:451, 525, 555, 591, 618, 691, 712, 731`) so each asserts its own point against the new behavior — with the cursor placed in the line where the point is about per-entry marks and their positions.
- [x] 6.4 Re-examine `a permission block is decorated in the editor` (`:192`) and `a corpus file in live preview carries the plugin's own markers` (`:152`). Rewrite them where their meaning changed; where it did not, say so rather than churn them.

## 7. Check what did not exist before

- [x] 7.1 The directive line at rest: shown as its heading, its own characters not on screen.
- [x] 7.2 A selection touching the line shows the line; the cursor on a neighbouring line does not.
- [x] 7.3 The heading reproduces a time window as written.
- [x] 7.4 The unreadable directive's heading says the block is shown to nobody.
- [x] 7.5 The file-level directive's frame is open at the bottom, in both views.
- [x] 7.6 The reading view shows no tag text, for every tag form, on a corpus document.
- [x] 7.7 The reading view shows a side-by-side block as columns, for two columns and for three.
- [x] 7.8 A tag in a formatted line is removed and the formatting around it survives.
- [x] 7.9 The same directive is shown with the same heading in both views.

## 8. Close it out

- [x] 8.1 Run `npm run test:obsidian`; green, with no check left asserting the old behavior.
- [x] 8.2 Run `npm test`; green. It reads the plugin's source into a context of its own, so the stubs it loads `main.ts` with have to cover what the module now evaluates at load time — a class declaration evaluates its base, and a name missing from the stub costs every check in that file rather than the one that uses it. No application file changes.
- [x] 8.3 Record in `AI/architecture.md` §9 what this change accepts: the block content rendered twice for the columns, and a permission directive inside a side-by-side block getting no frame.
- [x] 8.4 Update `README.md` in the plugin repository to describe what a teacher now sees instead of the tags.
