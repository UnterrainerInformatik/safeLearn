## Context

See `proposal.md — Why` for the motivation. What shapes the approach is the shape of what is
already there:

- The result list is rebuilt whole on every answer. `showSearchResults` (`obsidian-page.js:289`)
  calls `list.replaceChildren()` and then builds every node with `createElement` and `textContent`.
  Nothing survives a rebuild.
- The two node kinds the reader can follow are already anchors: `a.sl-search-name` for the document
  and `a.sl-search-heading` for a heading. They carry the URL that opening them needs, including
  the `?heading=&occurrence=` pair.
- Expanded-or-not already exists as DOM state: `.sl-search-expand.expanded` on the chevron and
  `.sl-search-headings.collapsed` on the container, toggled together by one `click` listener
  (`obsidian-page.js:319-322`). `css/search.css:63-76` styles both.
- There is one other `keydown` listener on the page: the Ctrl+Alt print shortcut
  (`obsidian-page.js:16-35`), registered on `window` in the capture phase. It returns unless both
  Ctrl and Alt are held, and it honours `defaultPrevented`.
- `.highlight` (`css/fixes.css:1`) is the project's existing mark for *this is where you are*, and
  `a.dark-mode.highlight` (`css/fixes.css:12`) is its dark-mode form. `showSearchResults` already
  adds `dark-mode` to every `a` in the list after building it (`obsidian-page.js:361-364`).
- The list scrolls inside itself: `.sl-search-results` is `max-height: 40vh; overflow-y: auto`
  (`css/search.css:41-48`).

## Goals / Non-Goals

**Goals:**

- One source of truth for expanded-or-not, shared by pointer and key.
- A walk order that cannot disagree with what the reader sees, because it is read from the same
  nodes the reader is looking at.
- No new state that has to be invalidated on a rebuild beyond the one thing that genuinely is new.
- A touch session that executes no new code path at all.

**Non-Goals:**

- Opening a result in a new tab by key (Ctrl+Enter, Shift+Enter). The pointer has the browser's own
  gestures for that; adding key equivalents means reimplementing modifier semantics the anchor gets
  for free.
- Keeping the selection across a rebuild by matching paths. The specs give the selection up on a
  rebuild, and re-finding a node the reader has not looked at yet would be a guess wearing the
  appearance of continuity.

## Decisions

### The DOM is the state; the selection is the only new variable

Everything the keyboard needs to know is already in the DOM, and is already what the reader sees.
So nothing parallel is built:

- **The walk order** is `list.querySelectorAll("a.sl-search-name, a.sl-search-heading")` in document
  order, minus every heading whose `.sl-search-headings` container carries `collapsed`. That is
  exactly "results, with an expanded result's headings spliced in beneath it", derived rather than
  maintained, and a node that is not displayed cannot be in it.
- **Expanded-or-not** stays the `expanded`/`collapsed` class pair. The keyboard calls the same
  toggle the chevron's listener calls, extracted into a small function taking the entry and the
  desired state. One state, two callers — which is what makes the shared-with-the-pointer
  requirement true by construction rather than by care.
- **The selection** is one module-level reference to the selected anchor element, or `null`. It is
  set to `null` at the top of `showSearchResults`, before `replaceChildren()` detaches the node it
  pointed at. That single line is the whole of "a new answer gives the selection up".

*Alternative considered:* an index into an array of result objects kept beside the DOM. Rejected —
it has to be recomputed on every expand and collapse, and the failure mode when it drifts is a
selection marked on one node while Enter opens another.

### The field keeps the focus; the mark is a class

Focus never leaves the search field. The selected anchor is marked by adding `highlight` to it and
removing it from the previous one. Because the mark lands on the `<a>` and `showSearchResults`
already puts `dark-mode` on every `a` in the list, `a.dark-mode.highlight` matches without anything
further being written for dark mode.

*Alternative considered:* roving `tabindex`, moving real focus onto each anchor. Rejected — typing
would then have to be routed back to the field by hand, Enter and the anchors' own activation would
need reconciling, and the Tab order through the sidebar would grow by the number of results.

### The key handler sits on the field, acts only unmodified, and consumes what it uses

A `keydown` listener on the field itself, in the bubble phase. The window-level Ctrl+Alt listener
is capture-phase and therefore runs first; it acts only on Ctrl+Alt and the field's handler ignores
any event carrying `ctrlKey`, `altKey` or `metaKey`, so the two cannot meet.

The handler is a decision table over (key, where the selection is):

| Key | No selection (caret in field) | On a result | On a heading |
| --- | --- | --- | --- |
| ArrowDown | select the first node, if any | next node in walk order | next node in walk order |
| ArrowUp | not handled | previous node; from the first, give the selection up | previous node |
| ArrowRight | caret at the end of the query → the remembered node, else the first; otherwise not handled | collapsed and has headings → expand, stay; expanded → first heading; no headings → nothing | not handled |
| ArrowLeft | not handled | expanded → collapse, stay; otherwise give the selection up | collapse the parent, select the parent |
| Enter | not handled | `click()` the anchor | `click()` the anchor |

"Not handled" means the event is left alone entirely, which is what keeps arrow-left and
arrow-right working as caret movement while the caret is in the field — the behaviour the reader
needs in order to extend a query instead of replacing it. Everything else calls `preventDefault()`,
so a walk never moves the caret and never scrolls the page.

The one cell that reads a condition rather than a position is arrow-right in the field. It is
`selectionStart === selectionEnd === value.length` — the caret collapsed and at the end. With the
whole query selected after a focus the test is false, so the press collapses the selection natively;
with the caret inside the query it is false, so the caret moves; only when there is no text left to
the right does the key mean the list. `selectionStart` and `selectionEnd` are available on
`type="search"`, which is what makes the test one line rather than a tracked state.

Enter goes through `anchor.click()` rather than assigning `location.href`, so a result and a
heading are opened by exactly the code that opens them for the pointer, `href` and all.

*Note on the two asymmetric cells:* arrow-right on a result with no headings does nothing and stays
where it is, while arrow-left on the same result gives the selection up. They are not symmetrical
because the directions do not mean symmetrical things: left is "one level up", carried through to
the field, and right is "one level down", which from a leaf is nowhere. Handing the selection back
on a rightwards key would move the reader further from the list they were walking into.

### The way out is remembered, and dies with the query

Handing the selection back stores the anchor it stood on in a second reference beside the selection
itself, and puts the caret at the end of the query — the position from which arrow-right means the
list. The store is cleared in the `input` handler, on every keystroke that changes the query, before
anything is debounced or asked. Clearing it there rather than when a new answer arrives is what
makes the rule the reader's own words: *as long as nothing is typed*, the way out is the way back
in. It also means the reference can never outlive the list it points into, because the list is only
ever replaced by an answer to a query that was typed.

A direct element reference is enough, for the same reason it is enough for the selection: the list
is not rebuilt while the query stands, and the store is empty before it is.

Arrow-down is deliberately not given the same treatment. It keeps meaning "the node below where I
am", and from the field that is the first result whatever happened earlier — which is also the only
way back to the top of the list without walking up it.

*Alternative considered:* remembering the node by its path and re-finding it in the new list after a
query change. Rejected — it would put the reader back on a document they had selected in a list
they can no longer see, and a re-find that misses would have to guess between "gone" and "moved".

### Select-on-focus is decided by the pointer that caused the focus

`pointerdown` on the field records `event.pointerType`. The `focus` handler reads that record and
clears it, so it is only ever used by the focus immediately following the press:

- record says `touch` → do nothing at all. This is the whole of the touch path, and it is a
  branch that returns.
- record is absent (Tab, or a script focus) or says `mouse`/`pen` → `field.select()`.

The click that caused the focus still has its `mouseup` to come, and the browser collapses the
selection there. A `mouseup` handler undoes that by calling `preventDefault()` — but only for the
mouseup of the focusing press, and only when the pointer has not moved more than a few pixels from
where it went down. A press that moved is a drag, and a drag must select what was dragged across.
Both the flag and the recorded coordinates are cleared on `blur`.

`mouseup` rather than `pointerup` for the `preventDefault`, because it is the mouse event's default
action that places the caret.

*Alternative considered:* `matchMedia("(pointer: coarse)")`. Rejected — it describes the machine,
not the interaction, so a laptop with a touchscreen would get one behaviour for both of its
pointers. Deciding per press costs one variable.

### Assistive technology is told what the mark means

The field becomes a combobox over the list: `role="combobox"`, `aria-expanded`, `aria-controls`
pointing at `#searchResults`, and `aria-activedescendant` naming the selected node. The list gets
`role="listbox"`, each anchor `role="option"`, and each expandable result's row `aria-expanded`.

This needs ids on the nodes, which `showSearchResults` assigns as it builds them — a counter within
the render, not an identity that means anything outside it. That is the same discipline
`corpus-search` already applies to heading anchors, and for the same reason: the list is rebuilt
whole, so an id from a previous render names nothing.

### Scrolling is `scrollIntoView({ block: "nearest" })`

`nearest` moves the smallest scrollable ancestor by the smallest amount, which for a node already
visible is nothing at all and for one just past the edge is one row. It is also what keeps the page
behind the sidebar still: a node inside a 40vh scroller that needs one row of scrolling gets it
from the scroller.

### The keyboard checks are driven through the existing browser session

A new `test/checks/search-keyboard.js`, imported by `test/content.test.js` like every other check
module, using `sharedSession` and `page.keyboard.press`. A key that must not move the caret is only
provably not moving it in a browser.

The corpus already holds both fixtures the walk needs, so none is added:

- `search` occurs in 6 of the 23 corpus files — several results to walk.
- `Absatz` occurs in exactly one, `md/test-search-jump.md`, under four headings a student session
  may see — the document's own title among them, since a heading is a heading at any level — one
  result that expands, with enough headings to enter, walk and leave.

The touch scenario is driven by dispatching a `PointerEvent` with `pointerType: "touch"` at the
field and then focusing it, rather than by switching the shared session into touch emulation. It
asserts the guard rather than the browser, which is the honest description of it — but the
alternative costs a second page with `hasTouch` set, and the guard is the only thing this change
puts between a finger and the old behaviour.

## Risks / Trade-offs

- **While a node is selected, arrow-left and arrow-right no longer move the caret.** → This is the
  cost of keeping focus in the field, and it is why both of those keys lead back to the field from
  the edges of the list. The reader's hand never has to leave the arrow keys to get a caret back.
- **`preventDefault()` on `mouseup` is a known way to break drag-selection inside a text field.** →
  Guarded twice: only the mouseup belonging to the press that caused the focus, and only when that
  press did not move. Both conditions are in the specs as scenarios.
- **Select-on-focus fires on a script-driven focus too, where no pointer was involved.** → Nothing
  focuses this field from script today. If something ever does, it will select the query, which is
  the same thing Tab does — the harmless direction to be wrong in.
- **The `aria` attributes are a contract nothing in the suite currently exercises.** → The two
  scenarios in the specs check the attributes themselves, which is what can be checked without a
  screen reader in the loop. It is a weaker guarantee than the behavioural checks around it, and
  worth saying so rather than implying parity.
- **`scrollIntoView` can still move an outer scroller if the list is not the nearest scrollable
  ancestor at some viewport size.** → `block: "nearest"` makes this the smallest possible movement
  rather than none; the scenario asserting the page does not scroll is what would catch it.

## Open Questions

- Whether `.highlight`'s `#dfeffc` reads as a selection at the sidebar's 12px against the sidebar's
  own background, or wants a border or a slightly stronger fill. Answerable by looking at it once
  it exists, and it changes nothing about the specs, the approach or the tasks.
