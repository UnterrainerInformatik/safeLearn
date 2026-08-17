## Context

Two ways to take ten characters off the screen, and they differ in what happens when a person wants them back.

## Decisions

### The tag is replaced, not shrunk

A stylesheet can do this on its own: leave the mark where it is, set the text to size zero and draw the icon from `::before`. It touches one file and no check that reads a marking's text breaks, because the text is still in the DOM.

That is also what is wrong with it. The characters are never on screen — not when the cursor is in them, not while they are being deleted — so removing a fragment means backspacing through ten characters nobody can see, and a check asserting "the tag is visible" would read the DOM and pass while the screen showed nothing. The plugin already has the honest form of this: a directive line stands as its heading while nothing is in it, and as its own characters while something is. A `Decoration.replace` carrying a widget, lifted by `isTouched`, is that same rule.

It is asked per tag rather than per line. The directive line asks about the whole line because the whole line is what it replaces; a fragment is a range inside a line of prose, and a person editing one fragment has no reason to be shown the other one on the same line.

### The icon is a character in the widget, not `content` in the stylesheet

Every other icon this plugin draws — the chip's `👤`, the broken window's `⚠`, the withheld note's `🚫` — is `content` in `styles.css`, and belongs there: each decorates text that is on screen either way. This one *is* what is on screen in the tag's place. A stylesheet that failed to load would take the tag off the page and leave nothing behind, which is the one outcome a marking must never produce. So `FRAGMENT_ICON` is in `main.ts`, and the stylesheet only sizes and dims it.

It also keeps the icon readable to the harness: `markers()` reports an element's `textContent`, and an empty span would report an empty string for every fragment in the document.

### `eq()` is always true

Every fragment is shown the same way, so no rebuild ever needs to replace an icon element that is already there. That matters more than it looks: since `plugin-fix-editor-decorations` the decoration set is rebuilt on every cursor move, not only on every edit.

### One colour, held in one pair of variables

The file-level frame's colour variables are removed rather than set to the block's values. Two names holding one value is an invitation to change one of them, and the whole point is that these two frames are the same colour. What distinguishes them is `.permission-file`'s two-pixel edges and its missing floor, which is a shape and not a hue.

The yellow is `#f5c842`, which the block's own tint already was; what changed is that the edges are drawn in it too, and that both are more transparent than either frame was. Amber at full-frame width reads as orange, and orange in this palette is close enough to the red of `permission-withheld` — the block no reader sees — to be worth staying away from.

## Risks / Trade-offs

- **A tag that is not on screen is a tag a person may not know they wrote.** Mitigated by the icon being present at all: something stands there, at the exact position, and it comes back as text on contact. The reading view, which shows nothing at all for a fragment, is the state this is measured against, and it was settled in `plugin-hide-tags`.
- **A replaced range can swallow what is next to it.** A replacement one character too long takes the space after the tag with it, and a check reading the marking's own text can no longer see that. So the extent is asserted where it became visible instead: the corpus writes `- ##fragment two`, and what must stand there is the icon, a space, and the word.
- **A cursor resting where a document opens.** A fragment at offset zero of a freshly opened document is touched by the cursor that sits there, so it shows its characters. That is the rule working, not an exception to it — but a check written for the resting state has to put the cursor somewhere first, or it asserts against the wrong one of the two.
