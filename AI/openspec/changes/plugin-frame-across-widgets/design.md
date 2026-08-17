## Context

See `proposal.md` — Why for the defect and the measurements behind it. What matters here is the mechanism.

The frame is built in `buildDecorations` (`main.ts`): `resolveBlocks` walks the whole document, every line of a block is given `permission-block` — plus `permission-block-start` or `permission-block-end` at its ends — and each of those becomes a `Decoration.line`. CodeMirror applies a line decoration to the element it renders for that line, and Obsidian's live preview renders some ranges as something else: a `div.cm-embed-block` that is a sibling of the `cm-line` elements, not a line. A line decoration has nothing to attach to there, and the frame stops.

`styles.css` draws the frame one line element at a time: `.permission-block` carries `border-left`, `border-right` and the tint, `.permission-block-start` adds the lid, `.permission-block-end` the floor. `.side-by-side-block` and its two ends are the same shape with a different colour.

Two measurements from a running Obsidian shape everything below:

- `view.posAtDOM(widgetElement)` answers with the document position of the first line the widget was built from — the table widget answered with line 6, the callout with line 11, both correct. The connection from a widget element back to the block it stands in is therefore available and does not have to be reconstructed by counting.
- Widget elements are not laid out to the width of line elements. Relative to `.cm-content`, every `cm-line` runs from 0 to 380. The table widget runs from **−16 to 396**: `margin-inline: -16px` with `padding-inline: 16px`. The callout runs 0 to 380 like a line. So the line width is exactly the table widget's *padding box*, and a frame edge drawn on the widget's border box sits 16px too far out on both sides.

## Goals / Non-Goals

**Goals:**

- The frame covers what the block covers, in live preview, for every element Obsidian renders in place of lines.
- One mechanism for both block kinds. The permission block and the side-by-side block are drawn by the same rule and must not acquire two.
- The block's ends stay the document's ends, including where a widget is the first or last thing in the block.
- Checks that read the laid-out boxes, not the class list.

**Non-Goals:**

- The reading view. It puts the frame on rendered sections, a table is a section like any other, and it is verified to be intact.
- Restyling what Obsidian renders. A callout keeps its colours; a table keeps its borders and its horizontal scrolling.
- Making the frame survive a theme that lays widgets out differently from what was measured here. The rule below is written not to depend on the number 16, but a theme that moves the *content* somewhere else is out of scope.

## Decisions

### The frame reaches widget elements as a class put on them, not as a decoration

CodeMirror offers no decoration that addresses a widget Obsidian created; `Decoration.line` needs a line and `Decoration.replace` would replace the widget rather than frame it. What is available is the element itself, and `posAtDOM` maps it back to a line the existing walk has already classified. So the block classes are put on those elements directly, out of the same `lineClasses` map that produces the decorations — one source of truth for what a line carries, two ways of applying it.

*Alternative considered — draw the frame as an overlay layer.* One absolutely positioned rectangle per visible block, computed from `coordsAtPos`, is immune to how any element is laid out and would make the width question disappear. It also replaces a rule that is currently five lines of CSS with geometry that has to be recomputed on every scroll, resize, font change and late-arriving widget, and it puts a painted rectangle behind text that the editor is free to move underneath it. The defect does not justify that; if the class approach turns out to fight the layout on more themes than it fits, this is the fallback.

*Alternative considered — pure CSS with `:has()`.* `.permission-block-start ~ *:has(~ .permission-block-end)` selects the siblings between the two ends and needs no JavaScript at all. It is wrong for a document with two blocks: everything after the first block's start that has *any* later end after it matches, which includes the text between the blocks. Rejected as incorrect rather than as inelegant.

### The pass runs where the decorations are applied, and again when the DOM changes underneath

`buildDecorations` runs on document changes, cursor moves and viewport changes. The widget elements exist only after CodeMirror has written the DOM, and some of Obsidian's are filled in later still — a Mermaid diagram and an embedded note both arrive after the update that produced their range. Two triggers, therefore:

- after each update, in the write phase of `view.requestMeasure`, so nothing is read or written mid-update;
- a `MutationObserver` on `.cm-content`'s child list, which is what catches the late arrivals.

Both call the same idempotent function: for each child of `.cm-content` that is not a `cm-line`, resolve its line, add the classes that line carries and **remove the ones it does not**. Removal is what keeps a stale frame off an element after a block's closing marker moves above it; the observer must not react to its own writes, which a class-list mutation on a child does not trigger under a `childList` observer, but the guard is worth stating rather than assuming.

### The edges are held at the padding box, not at a fixed inset

The measured widget has `margin-inline: -16px; padding-inline: 16px`, which puts the text at exactly the line width. Neutralising the margin would narrow the table and take away the horizontal room Obsidian gave it; hard-coding a 16px inset would encode one theme's spacing into the plugin. The rule instead draws the block's side edges at the widget's padding box — an inset shadow or a pseudo-element positioned against the element's own padding — so the edges line up with the edges drawn on the line elements whatever that padding is.

The lid and the floor need no such treatment: they are horizontal, and a horizontal line 16px wider on each side is a visible defect only if it is drawn on the wrong element, which is what the `-start`/`-end` classes already decide.

### The checks read boxes

`the columns of a side-by-side block stand beside one another` already establishes the pattern: `columnsAreSideBySide` reads `getBoundingClientRect` rather than trusting a class, because a class that is present while the rule never applied is exactly the failure being ruled out. The checks here do the same — that the framed elements of a block form one unbroken vertical run with no gap, and that their side edges share one x-coordinate.

## Risks / Trade-offs

- **A theme lays a widget out differently than measured.** → The edge rule is written against the element's own padding rather than a constant, and the checks read geometry, so a theme that breaks it fails a check rather than shipping a broken frame quietly. Obsidian's default theme is what the harness runs, and it is what is verified.
- **The `MutationObserver` fires on documents that have no block at all.** → The callback returns immediately when the document holds no blocks; the walk is over the children of one element, which is the same order of work the existing per-update walk already does.
- **`posAtDOM` throws for an element the editor does not own.** → It is already handled that way in the harness (`markers()` catches it and reports no position); the pass skips such an element rather than failing the update.
- **Two mechanisms now decide what a line carries.** → They do not: `lineClasses` decides, and the decoration set and the DOM pass both read it. A third answer would be a defect, and the check that a framed run is unbroken is what would catch it.

## Open Questions

- Whether an embedded note (`![[…]]`) should be framed at all, or whether framing a rendering of *another* document inside this block misstates what the block governs. It is inside the block's line range and the server treats its transclusion no differently, so the specs say it is framed; if it looks wrong in practice, it is a presentation decision that changes no requirement.
