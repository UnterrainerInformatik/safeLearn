## Context

See `proposal.md` — Why. What the plugin brings to this:

- The tag spellings and the recognition rules sit in one block at the top of `main.ts`, each rule returned from a function. A command writes the same constants the recognition reads, so a command cannot insert a marker the plugin does not recognize.
- `isMarkerLine` is the plugin's rule for a block marker, and it is deliberately stricter than the renderer's: the line must be nothing but the marker. That divergence is recorded in `AI/architecture.md` §9, and it decides the shape of what these commands write.

On the server side, `preprocessSideBySide` (`obsidian.js:885`) matches from `##side-by-side-start` to `##side-by-side-end` as one expression, removes both markers, trims what is left, splits it on `##separator`, trims each part and wraps it with a blank line on either side. The blank lines are the renderer's own doing and are added where the columns are built — the document does not need them, and a command that wrote them would be writing something the renderer then trims away.

## Goals / Non-Goals

**Goals:**

- What is inserted is well-formed for the renderer and for the plugin's own recognition, both.
- A command never guesses where a person's content divides.
- One registry, so the palette and the context menu cannot come to hold different things.
- Room for `plugin-section-authoring` without a second menu.

**Non-Goals:**

- Reformatting or repairing tags that are already in the document. A command writes; it does not go looking.
- A command for three columns of its own. Settled in the source proposal: it would be an entry in the palette that a person reads past every time.
- Anything about permission directives. That is `plugin-section-authoring`, which adds to the registry this change builds.

## Decisions

### The separators go after the content, and the content is not divided

For a block of *n* columns the command writes:

```
##side-by-side-start
<the selection, unchanged, or one empty line>
##separator
<one empty line>
… n − 2 more times
##side-by-side-end
```

**Why after and not inside:** a selection is what a person pointed at, and the only place a command could put a separator inside it is a place it guessed. Written after the content, the separator is a line to move rather than a division to undo, and the block is immediately well-formed — *n* columns, the first holding the selection and the rest empty.

**Why one empty line per remaining column:** a `##separator` directly above `##side-by-side-end` gives the renderer an empty column, and a person then has to make room before they can type in it. The empty line is that room.

### Each marker stands alone on its line, and the insertion begins on one

The renderer would accept a marker in the middle of a sentence; the plugin would not mark it, and a block whose boundary sits inside running text has no marking to draw around it. So the command writes each marker on a line of its own, and where the cursor sits mid-line the insertion starts by breaking the line.

This is the part the source proposal says to establish by reading `preprocessSideBySide` rather than guessing, and the reading is above: the blank lines around a column are the renderer's, added while it builds the columns, so the command writes none. What the command must get right is the line structure, because that is what both the plugin's `isMarkerLine` and the split depend on.

### The fragment marker goes above the block, which is the run of lines the cursor is in

`##fragment` on its own line before the block — the source proposal's words. A "block" here is the run of non-blank lines the cursor stands in, and the marker goes above its first line. With a selection, above the selection's first line.

**Why not simply above the cursor's own line:** in the middle of a paragraph that splits the paragraph in two and makes a fragment of its second half, which is not what the person asked for and is invisible until the deck is opened. Walking up to the blank line above is one loop and says what "before the block" means.

### Nothing is written above a directive that gates the file

Found while reviewing rather than planned for, and it belongs in the design because it is the only thing here that can change who reads a document.

A directive on line one gates the whole file, and it does so by *being* line one — `resolveBlocks` and the renderer both decide it by position. An insertion at the very top pushes it to line two, where it opens a block instead of gating anything, and the document becomes readable by everyone. Silently, through a command somebody ran to add a column.

So an insertion whose point is the start of the document goes below that line instead, and the fragment command's walk upward stops below it rather than at line one. Two conditions, one check.

Where such a line is inside what a person *selected*, this does not apply. A selection names what it covers, and the plugin's marking stops saying the file is gated, which is visible — whereas a cursor at the top of a document is not a statement about the line below it.

### One registry, two ways to reach it

A list of authoring actions — an id, a name, and what it does to an editor. `onload` registers one Obsidian command per entry and subscribes to `editor-menu` once, building the menu items from the same list.

**Why:** two lists would be free to disagree, and the way that failure shows is a command that exists in the palette and not in the menu — which reads as the menu being broken rather than as an entry having been forgotten. It is also what `plugin-section-authoring` needs: one more entry rather than a second menu beside this one.

The context-menu entries stand together as a section of their own rather than loose among the entries of other plugins. A submenu was the first shape considered — one item that opens into the plugin's commands — and `MenuItem.setSubmenu` is not part of Obsidian's published API while `setSection` is. A section keeps them together without depending on something that is not promised.

### The column count is asked with a modal, and the answer is bounded below

A modal with a number, defaulting to three — two has its own command and does not need to be asked for. Fewer than two columns is not a side-by-side block, so the modal does not accept it; there is no upper bound, because the renderer has none and a person writing six columns knows what they are doing.

**Alternative considered:** a suggester offering two through six. Rejected — it makes the common case of this command (three) exactly as many keystrokes as the uncommon ones, and puts a ceiling in the interface that does not exist in the renderer.

## Risks / Trade-offs

- **A command writes a well-formed block into a place where it is not well-formed — inside a list item, inside a fenced code block** → not guarded, and said here rather than discovered: the command writes lines where the cursor is, and a person who put the cursor inside a code fence gets tags inside a code fence. The plugin marks nothing there and the renderer acts on nothing there, so what they get is visibly inert rather than silently wrong.
- **The separators land after the content and a person does not notice they have to move them** → the block is well-formed either way, and the plugin's own marking shows the empty column as a column. This is the source proposal's settled decision, and the alternative it rejected is worse: a division at a guessed place has to be undone before anything else can happen.
- **The harness cannot invoke a command, so the checks would assert on the plugin's own functions instead of on a document** → the harness gains the ability to run a command by id and to open the editor's context menu, and the checks read the document text afterwards. What a command inserts is a statement about a person's file, and it is checked as one.
- **The context menu is added to a menu Obsidian and other plugins also fill** → one submenu, one item, nothing reordered.
