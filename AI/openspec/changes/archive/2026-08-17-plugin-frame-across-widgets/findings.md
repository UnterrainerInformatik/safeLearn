# What the live preview builds, measured

A document holding one of every block-level element inside a single permission
block, opened in a running Obsidian 1.13.7, read back as the children of
`.cm-content`. This is the list the repair is measured against; it is written
into the vault the run assembles rather than into `md/`, which is what the
authenticated suite asserts against.

## The children, and whether the frame reaches them

`left`/`right` are relative to `.cm-content`, whose line elements run 0 to 380.

| Written inside the block | Child of `.cm-content` | A line? | Carries `permission-block` | Box |
| --- | --- | --- | --- | --- |
| Ordinary text | `div.cm-line` | yes | yes | 0…380 |
| A table | `div.cm-embed-block.cm-table-widget.markdown-rendered` | no | **no** | **−16…396** |
| A callout | `div.cm-embed-block.cm-callout` | no | **no** | 0…380 |
| A ` ```mermaid ` block | `div.cm-preview-code-block.cm-embed-block.cm-lang-mermaid` | no | **no** | 0…380 |
| A `$$…$$` block | `div.math.math-block.cm-embed-block` | no | **no** | 0…380 |
| An embedded note `![[…]]` | `div.internal-embed.markdown-embed.inline-embed` | no | **no** | 0…380 |
| An ordinary fenced code block | `div.cm-line.HyperMD-codeblock` | yes | yes | 0…380 |

The fenced code block is the control case: it stays a line, it is already
framed, and nothing here has to reach it.

## Three things the proposal did not have

**`div.cm-gap` is a child too, and it is not a line.** It stands for the whole
region the editor has scrolled away and has not built elements for — one element
covering many lines. `posAtDOM` answers for it with a real position (line 1 of
the document in the pass taken at the end of it), so a pass that framed every
non-line child by the line it resolves to would paint a block's frame across an
arbitrary stretch of document. It has to be skipped by name, not by whether it
resolves.

**Only the table widget is laid out wider than a line.** It has
`margin-inline: -16px; padding-inline: 16px`, so its border box runs −16…396 and
its *content* box runs 0…380 — exactly the line width. The callout, the math
block, the diagram and the embedded note are all 0…380 already and need the
class and nothing else. So the width rule is about the content box, not the
padding box: the padding box of the table widget is its border box (it draws no
border) and is 16px too wide on each side.

**Nothing carries a block margin, and no two children are separated by a gap.**
Every consecutive pair measured `gap=0`, the table widget included. The framed
run is geometrically unbroken as soon as the elements are tinted; what has to be
watched is only that the *paint* reaches the whole element, and the table widget
does have `padding-block: 16px` for the paint to cross.

## What that settles for the stylesheet

An inset `box-shadow` is clipped to the padding box and would therefore sit
16px too far out on the table widget. A background layer with
`background-origin: content-box` is positioned at exactly 0…380 for every
element in the table above, whatever its own padding is, and
`background-clip: padding-box` with `background-repeat: repeat-y` lets that same
layer cross the widget's vertical padding so the tint does not stop short of the
neighbouring line.

The `padding: 0 8px` the frame gives a line must not reach a widget: it would
replace Obsidian's own `padding-inline`, move the widget's content box, and take
the frame with it. The padding belongs to the line rule alone.
