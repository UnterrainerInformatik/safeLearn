## Context

See `proposal.md` — Why. What shapes the approach is what the plugin is after `plugin-fix-editor-decorations` and `plugin-edit-tag-support`:

- Every recognition rule sits in one block at the top of `main.ts`, each returned from a function rather than held in a constant, and the editor and the rendered view read the same rules. This change adds to that block and opens no second one.
- `resolveBlocks(doc: Text)` walks the whole document once, reports the blocks and the file-level directive line, and is the only place that decides what a block is. It takes CodeMirror's `Text`, which the reading view does not have.
- `parseDirectiveEntries` already reports, per comma-separated entry, where it sits and what the server will make of it — readable, timed, broken window, view switch, unresolved switch. That is exactly what a heading has to show, so the heading needs no grammar of its own.
- `buildDecorations` resolves blocks over the whole document and emits decorations for visible lines only, handing the set to `Decoration.set(ranges, true)` so the library sorts it.
- `cleanPreview` is registered as a markdown post-processor and is called by nothing else.

On the server side, `preprocessSideBySide` (`obsidian.js:885`) matches a start-to-end block as one regular expression, strips the two markers, splits the remainder on `##separator`, trims each column and wraps it in `<div class="side-by-side-col">` with **blank lines around the content** — the content is still Markdown there, and Markdown inside an HTML block is only parsed when an empty line separates it from the tags.

## Goals / Non-Goals

**Goals:**

- One walk, one rule, two views. The reading view and the editor answer "what is this line" from the same function.
- The reading view decides from the *source lines a section came from*, not from what its rendered text looks like.
- Nothing rendered is rebuilt in order to hide something in it.
- The heading claims nothing the server does not do.

**Non-Goals:**

- Matching reveal.js column widths. The reading view says *that* there are columns and what is in them; how wide they end up is the reading view's business.
- Replacing anything but the directive line in the editor. `##fragment` and the block markers keep the markings they have — see the decision below.
- Enforcing anything. The plugin still shows and never corrects.

## Decisions

### The reading view works from section info, not from rendered text

Obsidian calls a markdown post-processor once per rendered section and hands it a context whose `getSectionInfo(el)` returns the **whole document text** together with the section's `lineStart` and `lineEnd`. So the post-processor can split that text into lines, run the same `resolveBlocks` the editor runs, and know exactly what its own section is: lines inside a block, the line that opens one, the line that closes one, a line of column markers, or ordinary text.

**Why not keep searching rendered output:** by the time a section is rendered, the line structure is gone. `cleanPreview` therefore has to guess from an element's `textContent` whether that element *was* a tag, which is why it can only ever hide — it cannot put a heading in a marker's place, and it cannot tell which content belonged to which column. Everything this change asks for needs the source, and the source is available.

**Fallback when there is no section info:** `getSectionInfo` returns null for content rendered outside a file's reading view — an embed, a hover preview, or markdown this plugin renders itself. In that case the post-processor does the one thing that needs no source: it strips tag text out of text nodes. No frame, no heading, no columns. That is also what keeps a re-render from recursing into itself.

### A `##fragment` is removed from the text node's own data

`node.data = node.data.replace(fragmentPattern(), "")`, rather than building a `<span>` and replacing the node with it. The node keeps its identity and its place, so whatever wraps it — emphasis, a list item, a link — is untouched. Replacing a node is what made a tag in a formatted line take the formatting with it.

An element whose text is nothing but tags is *not* hidden by class any more. A section is removed when the *source lines* it was rendered from held nothing but tags — asked of the source, not of the rendered result. The rendered form is the wrong thing to ask: a paragraph holding only an image, a horizontal rule or a diagram has no text in it either, and hiding a section because nothing in it is a word takes content out of a document in order to remove a tag that was never there. The one exception is the section a heading was just put into, which is a directive line and therefore holds nothing but a tag.

### Side-by-side is rendered from its source, not assembled from rendered sections

A side-by-side block spans many sections: the marker line, the paragraphs and lists in each column, the closing marker. They arrive in separate post-processor calls, in an order the reading view's virtualization decides, and grouping already-rendered siblings into columns means reaching into a container Obsidian owns while it is still filling it.

Instead the section that carries `##side-by-side-start` renders the whole block itself: it takes the block's source out of `info.text`, splits it on `##separator` exactly as `preprocessSideBySide` does, and renders each column into a `div.safelearn-column` with `MarkdownRenderer.render`. Every other section of the block hides itself, which each one can decide alone from its own line range.

**Why this and not DOM grouping:** every section decides about itself from the source. No section has to wait for another to exist, nothing is moved between parents, and a block that is half-scrolled-into-view cannot end up half-grouped.

**What it costs:** the block's content is rendered twice — once by Obsidian into the sections that then hide, once by us into the columns. On the corpus that is two short blocks. Recorded as a trade-off rather than discovered as a slowdown.

**Nested tags inside a column:** the columns are rendered through Obsidian's own renderer, so this post-processor runs over them again — with no section info, by the rule above. A permission directive inside a side-by-side block therefore gets its tag text stripped but no frame and no heading. The server does not support a permission block inside a side-by-side block either (`preprocessSideBySide` runs after `removeForbiddenContent` and matches the markers as plain substrings), so this is a document nobody can write meaningfully. It is recorded, not repaired.

### The frame in the reading view is drawn one section at a time

A block's lines are spread over several sections, so the box is drawn the way the editor draws it: sides on every section of the block, a lid on the first, a floor on the last. The same three classes, the same reasoning, and the same accepted imperfection — a box assembled from separate elements has seams where they meet.

Every block covering a section is asked, not the first one found. The corpus writes a closing marker and the next directive on consecutive lines, which Markdown renders as one paragraph — and that one section is the floor of the first block and the lid of the second at the same time.

The alternative, rendering the whole block ourselves the way the columns are done, was rejected here: a permission block is most of a document's content, re-rendering it would double the cost of the page rather than of two short blocks, and unlike the columns there is nothing about a frame that requires the parts to share a parent.

### The heading is built from the entries the grammar already reports

One function builds the heading element from a `DirectiveEntry[]` plus whether the line is the file-level form, and both views call it. That is the merge's whole point: two builders would be free to disagree about the thing both views exist to show the same way.

Each entry becomes a chip. A chip is not text in the document, so it can carry visual channels an entry mark cannot — `styles.css` records why the entry marks may only use colour, weight and line style: Obsidian's tokenizer cuts a decoration wherever it starts a token, so `4bhif[gestern]` reaches the page as four spans, and a `::before` icon appears four times over. A chip is one element and has no such limit.

**A window is reproduced verbatim.** The chip carries the entry's text as written. Nothing translates a timestamp, because the plugin's only value is that it claims nothing the server does not do, and the server discards windows that a readable restatement would make look sound.

**An entry the server discards appears in the heading, without the marking a surviving entry gets.** This extends the existing rule rather than contradicting it: today a discarded entry is "shown by the marking its neighbours have and it does not", which works because its characters are on the page. Under replacement the characters are gone, so leaving the entry out of the heading would hide the mistake instead of showing it — the author would see `@@@ 4bhif, ]kaputt` as a heading naming 4bhif alone and never learn that they wrote something the server throws away. So every entry gets a chip; a discarded one carries a chip class that says the server does not read it.

**A directive nothing can be read from gets a heading of its own**, in the style of `permission-withheld`, stating that no reader sees the block. Not a name, because a name would claim the opposite; not nothing, because that is the line that would disappear without trace.

**The file-level form gets the same heading in a frame with no lower edge.** No second widget for one case, and both views give the same answer.

### In the editor, only the directive line is replaced

`##fragment` and the three block markers keep the markings they have.

**Why:** the source proposal's summary says the tags disappear in both views, but everything it specifies afterwards is about the directive line — the requirement it dictates names the directive line, the "only the edit view" section is about the directive line unfolding, and the list of checks it says must be rewritten contains the directive checks and none of the six fragment checks. It also says of the reading view that a fragment vanishes *without a trace*, and that "you can see in the edit view that a fragment sits there" — which is the marking it already has. Replacing fragments too would silently invalidate six checks the proposal does not mention.

Recorded as a decision rather than absorbed: if fragments are meant to be replaced as well, that is a second change with its own checks, not a line in this one.

### The replacement is not atomic, and that is what makes it editable

CodeMirror can declare a replaced range atomic so the cursor steps over it. This one does not.

A range the cursor cannot enter would have to be lifted by something else — a click handler, a key binding — and each of those is a way for the line to become uneditable when it fails. Left non-atomic, moving the cursor into the line is what lifts the replacement: the next rebuild sees a selection touching the line and emits no replacement for it, so the characters are simply there. Clicking the heading places the cursor in the range and does the same thing.

The line that carries a replacement emits no entry marks — they would sit inside hidden text. When the replacement is lifted, the marks are emitted as they are today. So the two states are exactly "the heading" and "what `plugin-edit-tag-support` already shows", with nothing in between to specify.

**Lifted by a cursor in the line or a selection touching it.** A selection running across the block shows the line, because otherwise a person copies text they cannot see. The lines above and below do nothing, so scrolling through with the cursor does not make the document flicker.

**The widget compares equal on its own text**, so a rebuild that changes nothing hands back a widget CodeMirror can keep. Without that, every cursor move in the document would rebuild every heading on screen.

### `resolveBlocks` stops taking CodeMirror's `Text`

It takes a line source — a count and a function from line number to text — so the editor passes an adapter over `doc` and the reading view one over the lines of `info.text`. One walk, one rule, and the reading view cannot develop a second opinion about where a block ends.

## Risks / Trade-offs

- **The heading hides a line a person has to be able to edit** → it is lifted by the cursor and by a touching selection, and the replacement is not atomic, so nothing has to work for the line to be reachable. A check moves the cursor in and asserts the characters are there and the document text unchanged.
- **`getSectionInfo` returns null more often than expected, and the reading view silently does almost nothing** → the fallback is stated as behavior rather than left implicit, and the reading-view checks assert the full result on a real file, where section info is what Obsidian provides.
- **Rendering the columns ourselves diverges from what the server produces** → the split is taken from `preprocessSideBySide` and read at implementation time rather than reproduced from memory, and the checks compare against a document whose corpus form the server suite already renders.
- **The rewritten checks are adjusted until green rather than restated** → each one is rewritten to say what the new behavior is *before* the code produces it, in the file where the reasoning is already written down, and the one that contradicts the change outright is named in the proposal so it cannot be quietly relaxed.
- **A rebuild per cursor move now constructs widgets as well as decorations** → widgets compare equal on their text, and decorations are still emitted for visible lines only. The whole-document block walk remains the larger cost, and its trade-off is already recorded in `AI/architecture.md` §9.
- **Two renderers for one block's content in the reading view** → accepted for side-by-side, where there is no alternative that does not reach into Obsidian's container; refused for permission blocks, which are drawn with a frame instead.
