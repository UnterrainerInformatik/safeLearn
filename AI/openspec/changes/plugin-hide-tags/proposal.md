Source proposal: `AI/proposals/plugin-hide-tags.md`

## Why

The SafeLearn tags are instructions to the rendering server, not text anyone wants to read. In Obsidian they are shown as what they literally are: `@@@ 4bhif, teacher[2025-11-28T08:00:00]` sits in the middle of a lecture as a line of punctuation, and `##side-by-side-start` announces a layout that the reading view then does not produce. A teacher reading their own document sees the machinery instead of the page.

Two proposals asked for the same thing from two sides — one for the reading view, one for the editor — and their open questions came back with the same answers: the same heading, the same frame, the same treatment of the file-level directive. They are merged here, because two changes would have specified one widget twice and would have drifted apart at exactly the point where they have to agree. Both answer one question: what does a teacher see who is writing, instead of the instruction to the server.

What stands in the way is `cleanPreview()` (`main.ts:343-368`), which takes tags out of *rendered* output: it walks `el.querySelectorAll("*")`, tests each element's whole `textContent`, hides an element whose text is nothing but tags, and replaces text nodes with freshly built `<span>` elements. That is editing a page after it was rendered, and by then the line structure the tags were written in is gone — which is why it can hide a marker but can never put a heading in its place or rebuild columns from it.

Three of the four faults the source proposal names are no longer there: the `/g`-regex `lastIndex` defect is gone (`withoutTags` builds a fresh pattern per call), the ViewPlugin no longer calls `cleanPreview` at all, and the line numbers it cites do not match the file. `plugin-fix-editor-decorations` repaired those. What remains is the mechanism itself, and that is what this change replaces.

## What Changes

- **The rendered reading view shows no tag text.** A markdown post-processor decides per rendered section what its source lines were — `getSectionInfo` hands over the whole document text and the section's line range — and hides or replaces on that basis, rather than searching rendered output for something that looks like a tag. A `##fragment` inside a line is removed from the text node's own data, so nothing around it is rebuilt and no formatting is lost.
- **A restricted block carries its name as a heading**, the way a table carries its header row, in both views. The heading rebuilds the directive's entries as chips, each carrying the distinction that entry carries — the same six the editor already marks per entry — so that `4bhif[gestern]` is still visibly a grant that never expires.
- **A time window is reproduced as it is written.** `4bhif[2026-08-01..2026-08-20]` stands in the heading as it stands in the document. Restating it as "1.–20. August" would claim a reading, and the server discards windows that a plausible restatement would make look sound.
- **A directive nothing can be read from gets a warning heading.** Its block is withheld from every reader, an admin included. A heading naming somebody would claim the opposite; no heading at all would be the one line that vanishes without trace.
- **The file-level directive gets the same heading in a frame with no lower edge.** It stands on line 1, governs the whole file and has no closing marker, so there is no box for a heading to sit on. The open frame says by itself that what it governs does not stop.
- **In the editor the directive line is replaced while the cursor is elsewhere**, and its own characters come back when the cursor is in it or a selection touches it. Nothing else in the editor is replaced: `##fragment` and the block markers keep the markings `plugin-edit-tag-support` gave them.
- **Side-by-side is rebuilt as columns in the reading view.** Letting the markers vanish and the content run on underneath would leave the reading view saying nothing about the page the server produces, which is the one thing the plugin is for. The column widths will never be reveal.js's; that is accepted.
- **`##fragment` disappears without a trace in the reading view.** That a fragment sits there is visible in the editor; the reading view should read like an ordinary document.

## Capabilities

### New Capabilities

- `plugin-hidden-tags`: what a person sees in place of a SafeLearn tag. It owns the rendered reading view — no tag text, columns rebuilt, a fragment gone without trace, a block in its frame with its heading — and the one rule that spans both views: that the editor and the reading view build the same heading from the same directive, so that switching view does not mean learning what one is looking at a second time.

### Modified Capabilities

- `plugin-editor-decorations`: gains the requirement that permits replacement at all — today none does, and everything the plugin does in the editor is a marking on text that stays. The requirement *What is marked reflects the document as it is currently shown* is corrected: its sentence "a tag becomes editable when the cursor is in it" reads as though the characters were always present and merely not editable, which for the directive line is no longer true. *The editor does not modify rendered output* is unchanged and becomes true in the code as well, since `cleanPreview` — the one function that wrote into rendered output on the editor's behalf — is gone.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` symlink): `cleanPreview` is replaced by a section-aware post-processor; `buildDecorations` gains a `Decoration.replace` with a widget and the rule for when it is lifted; `resolveBlocks` is taken off CodeMirror's `Text` so that both views resolve blocks by one walk with one rule.
- **`styles.css`**: the heading, its chips, the reading view's frame and the rebuilt columns. The chips can carry visual channels the entry marks cannot — an entry mark is cut into pieces by Obsidian's own tokenizer, which is why it may only use colour, weight and line style; a chip is not text in the document and has no such limit.
- **`test/obsidian/plugin.test.js`**: every check that expects the characters of a directive line in Live Preview now states something else. They are rewritten deliberately, not adjusted until green — including the one that directly contradicts the change, `the cursor entering a tag changes no text and leaves the tag marked`, whose point becomes that the cursor changes no *document text* while changing what is shown.
- **`test/obsidian/harness.js`**: the frozen `markerClasses` list is what a check reads decorations back through, and it gains the new classes.
- **`obsidian.js` is read, not changed.** `preprocessSideBySide` decides how the server cuts columns; the reading view mirrors it rather than inventing its own split.
- **`AI/architecture.md` §9** for any divergence this accepts, as the side-by-side marker divergence already is.
