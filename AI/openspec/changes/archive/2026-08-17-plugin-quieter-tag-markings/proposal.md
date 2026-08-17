## Why

A marking is supposed to tell a teacher what the server will do with their document. It is not supposed to be the loudest thing on the page — and two of them were.

`##fragment` was shown as its own ten characters, in a box: a background, a two-pixel border, rounded corners, an icon in front of it and its own font size. What it says is small — *what follows waits for a click* — and it says it about a line of otherwise ordinary prose. Written mid-sentence, as the corpus writes it, the tag dominated the sentence it stood in. The reading view has dropped the tag entirely since `plugin-hide-tags`; the editor was the one place it was still shouted.

The two directive frames were drawn in two colours: the block form in an ochre (`#c8961e`), the file-level form in an amber (`#e09000`) that reads as orange on a full-width frame. That was a second answer to a question the shape of the box already answers — two edges against one, and a floor the file-level form has nowhere to draw — and it spent the palette's warning colour on something that is not a warning. The palette's actual warnings are red: `permission-withheld` is the line no reader sees.

## What Changes

- **A fragment marker is shown as an icon.** `🔀` stands where the tag's characters are, with no frame and no tint. Nothing else on the line changes.
- **The tag comes back when it is touched.** Cursor in it, or a selection across it, and `##fragment` is its own characters again, editable. This is the rule the directive line already follows, applied to a tag rather than to a whole line — and it is applied per tag: two fragments in one line answer independently, so editing one leaves the other quiet.
- **Both forms of directive are drawn in one colour, and that colour is yellow.** What tells the file-level form from the block form is the shape of its box, which is what it always was. Yellow rather than the amber the file-level form used to carry, and lighter than either was.
- **Nothing is written into anybody's document** to make any of this happen, and the reading view is untouched.

## Capabilities

### Modified Capabilities

- `plugin-editor-decorations`: gains the requirement that a fragment stands as an icon while nothing is in it — the capability describes what a decoration *covers* and how it survives an edit, and says nothing about a tag being shown as something other than its characters. That rule exists for the directive line (*A directive line is shown as the heading of the block it opens*) and now has a second instance. The requirement *A directive that governs the whole file is marked as doing so* is restated: the distinction it requires is real, and it now lives in the shape of the frame alone rather than also in its colour.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` symlink): a second widget beside `DirectiveHeadingWidget`, and one branch in `buildDecorations` where the fragment's mark was unconditional.
- **`styles.css`**: `.fragment-highlight` loses its frame, its tint and its `::before`; `.fragment-icon` is new. `--fragment-bg` and `--fragment-border` are gone, and so are `--permission-file-bg` and `--permission-file-border` — a variable pair that exists to hold the same value as another pair is a way for the two to drift apart again.
- **`test/obsidian/plugin.test.js`**: the checks that read a fragment's marking read its text, and a tag at rest has none. Each is restated rather than deleted. One of them — `cursor-into-tag` — asserted the opposite rule on purpose, and is the check this change has to turn around.
- **`test/obsidian/harness.js`**: the frozen `markerClasses` list gains `fragment-icon`.
- **`README.md`** in the plugin repository: what a teacher sees changed, so the fragment section says what they now see.
- **No server file is read or changed.** Nothing here is about what the server does with a document.
