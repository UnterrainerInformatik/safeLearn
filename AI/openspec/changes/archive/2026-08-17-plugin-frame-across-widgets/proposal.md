## Why

A permission block is drawn in the editor as a tinted rectangle with a left edge, a lid and a floor — the one thing that says, while a teacher writes, *this text is not for everybody*. Put a table in that block and the rectangle falls apart: the table stands outside it, the tint stops above it and starts again below it, and the block reads as two boxes that do not close.

The cause is not a defect in the drawing. The frame is a `Decoration.line` per line, so it can only reach lines the editor renders as lines — and Obsidian's live preview does not render a table as lines. It replaces the whole range with a widget element, a sibling of the `cm-line` elements and not one of them, which no line decoration can address. Every block element Obsidian renders that way is affected. Measured in a running Obsidian, on a document written for it:

| Written inside the block | Element live preview builds | Carries the frame |
| --- | --- | --- |
| A table | `div.cm-embed-block.cm-table-widget` | no |
| A callout | `div.cm-embed-block.cm-callout` | no |
| A ` ```mermaid ` block | `div.cm-preview-code-block.cm-embed-block` | no |
| A `$$…$$` math block | `div.math.math-block.cm-embed-block` | no |
| An embedded note `![[…]]` | `div.internal-embed.markdown-embed` | no |
| An ordinary fenced code block | `div.cm-line.HyperMD-codeblock` | yes |
| Ordinary text, headings, lists | `div.cm-line` | yes |

The side-by-side block is drawn the same way and breaks the same way: a table between `##side-by-side-start` and `##separator` leaves the region open exactly across the table's height.

The reading view is not affected and needs no repair — there the frame is put on rendered sections, and a table is a section like any other (`div.el-table.safelearn-read-block`, verified in the same run). This is a live-preview defect only, and it is worth repairing rather than recording: a teacher writes in live preview, and a block whose boundary is invisible around a table is a block whose boundary they will get wrong.

## What Changes

- **The frame reaches every line of the block, including the lines the editor renders as a widget.** What the plugin has already decided — which lines a block covers, and which of them are its first and its last — stays the answer; what changes is that the answer is applied to the elements a line decoration cannot reach.
- **The block's ends stay where the document puts them.** A widget standing at the top or the bottom of a block takes the lid or the floor, and a block that both opens and closes around a single widget is one closed rectangle.
- **The frame is one rectangle across differing element widths.** Obsidian's widget elements are wider than its line elements — a measured fact, not a guess — so a side edge drawn on both without a rule for it steps in and out at every table. The stylesheet has to hold the edges in one vertical line for both.
- **What the plugin does not own it does not restyle.** A callout keeps its own colours, a table its own borders; the block adds its frame around them and nothing else.
- **The reading view is untouched**, and the checks that establish it stays untouched are what says so.

## Capabilities

### Modified Capabilities

- `plugin-editor-decorations`: gains the requirement that the block frame covers the block — today the capability speaks of decorations covering the *tag* they mark and of markings staying correct through edits, and neither says anything about a region drawn around lines that the editor may not render as lines. The existing requirement *The set of decorations is always well-formed* stays as it is; whatever mechanism reaches the widget elements must not put anything into the decoration set that breaks its ordering rules.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` symlink): `buildDecorations` keeps deciding what each line carries; reaching the widget elements is new work beside it. A probe in a running Obsidian establishes that the connection is available — `view.posAtDOM(widget)` answered with the document position of the line the widget was built from, for the table and for the callout alike, and putting the block class on those elements by hand closed the rectangle with no vertical gap. What the change still has to settle is *when* that runs: Obsidian builds some of these widgets asynchronously, and a pass that runs once per update will not see a Mermaid diagram that arrives afterwards.
- **`styles.css`**: the frame's rules currently assume they sit on a `cm-line`. They will apply to elements with a different width and different margins, which is where the side edges step in and out.
- **`test/obsidian/plugin.test.js`**: new checks. They must read the laid-out boxes rather than the class list — a class that is present while the edge is not drawn is exactly the state this defect would leave behind, and `columnsAreSideBySide` already establishes the pattern for asserting about geometry rather than markup.
- **`test/obsidian/harness.js`**: the frozen `markerClasses` list, if any new class is introduced, and whatever a check needs to ask for the geometry of a block's elements.
- **No server file is read or changed.** Nothing here is about what the server does with the document; it is about what the editor draws around it.
