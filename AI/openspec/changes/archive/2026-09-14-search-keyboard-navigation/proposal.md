## Why

The search shipped on 2026-09-14 can be driven by exactly one thing: a pointer. The field is an
`<input>` with an `oninput` handler (`obsidian.js:2178-2191`), and the affordance that expands a
result to its headings is a `<span>` with a `click` listener and nothing else
(`obsidian-page.js:313-323`). There is no `keydown` handling anywhere near it — the only key
listener on the page is the Ctrl+Alt print shortcut (`obsidian-page.js:16-35`), which acts on
Ctrl+Alt combinations and returns.

So a reader at a computer, whose hands are on the keyboard because they have just typed a query,
has to go back to the mouse for every remaining step: drag-select the old query before retyping,
click the chevron to see which headings a document matched under, click the heading. Each of those
is a decision the reader has already made and now has to aim at.

Touch has to keep carrying this feature on its own, and it does. Nothing below is removed, nothing
becomes reachable only by key, and every gesture that works today works unchanged afterwards. The
change is additive, and the one place where it is *not* purely additive — selecting the field's
text on focus — is held to the case where the focus did not come from a finger.

## What Changes

**The reader gains a selection that walks the result list.** It is the list's own two-level shape:
results, and under an expanded result its headings. One position at a time is marked, and the
arrow keys move it.

- **Focusing the field selects what is in it.** The next query is usually a new one, so the old
  text is selected and the first character typed replaces it. Arrow-right gives that up and puts
  the caret at the end, which is how a reader who wanted to *extend* the old query carries on.
  A drag inside the field still selects what was dragged: a plain click selects everything, a drag
  selects the drag.
- **Arrow-down and arrow-up move the selection through the results.** The selected result is marked
  visually. Arrow-down from the field enters the list at the first result.
- **Enter follows the selection** — the same thing a click on it does. On a result that is the
  document at its beginning; on a heading, the document at that heading.
- **Arrow-right on a selected result opens its heading list**, and arrow-down and arrow-up then
  walk into that list as well: the flattened list is results with an expanded result's headings
  spliced in beneath it. On a result that is already open, arrow-right steps into its first heading.
- **Arrow-left closes the heading list again.** Pressed while the selection stood inside that list,
  it leaves the selection on the parent node — the result the list belongs to.
- **Arrow-up at the topmost result and arrow-left on a result that is not open both hand the
  selection back**, and the caret returns to the field, at the end of the query. One level up,
  carried through to the field itself. There is no wrap-around: the bottom of the list is the
  bottom.
- **Arrow-right at the end of the query goes back into the list, onto the node it was left on.**
  Handing the selection back is not losing it: as long as nothing is typed, the way out is also the
  way back in. With nothing remembered — the first entry into a list — it selects the first result,
  and typing anything at all forgets the node, so the memory can never point into a list the reader
  is no longer looking at.

Decisions taken here, so the specs and the design need not re-argue them:

- **The field keeps the focus the whole time; the selection is a mark, not a focus ring.** Typing
  has to keep refining the query while a result is selected, and that is only true if the field is
  still the focused element. The consequence is the reason arrow-up and arrow-left both lead home:
  while something is selected, left and right mean tree navigation and not caret movement, so the
  reader needs a way back to a caret they can move, and it has to be one of the keys their hand is
  already on.
- **Arrow-right means the same thing everywhere: one step right, and when there is nothing left to
  the right, one level in.** That single rule settles what would otherwise be a conflict between two
  wishes. With the whole query selected, the thing to the right is the end of the text, so
  arrow-right collapses the selection and the reader carries on typing. With the caret inside the
  query it moves one character. With the caret at the end there is no more text, so the next thing
  to the right is the result list — and the list is entered where the reader left it. Editing the
  query rightwards and stepping into the results therefore never contend for the key; they are the
  same gesture continued.
- **Arrow-down and arrow-right are two doors with two meanings.** Arrow-down enters the list at the
  first result — it is the node below the field, and that stays true whatever happened earlier.
  Arrow-right resumes. A reader who wants the top of the list after wandering off it has a key that
  gives it without walking back up.
- **Select-on-focus is held to a fine pointer.** The decision is made per interaction, not per
  device: the `pointerType` of the `pointerdown` that preceded the focus. A tap leaves the field
  exactly as it behaves today — no selection, no selection handles. A focus that arrives with no
  pointer at all (Tab) selects, because a keyboard focus is by definition not a finger. A laptop
  with a touchscreen therefore gets the convenience from its trackpad and the old behaviour from
  its screen, without either being asked which kind of machine it is.
- **Open and closed is one state, shared with the pointer.** Expanding with arrow-right and
  clicking the chevron are the same act on the same node; a result opened by one is open for the
  other. There is no second, keyboard-only notion of "expanded".
- **The mark reuses `.highlight`.** `css/fixes.css:1` already defines it, and the sidebar's table of
  contents already uses it to say *this is where you are* — including in dark mode, through
  `a.dark-mode.highlight`. A second colour for a second meaning of the same word would be a second
  thing to keep in step.
- **`autocomplete="off"` stays on the field, and now has a second reason.** Arrow-down in a text
  input is also the key that opens the browser's own list of previously submitted values. On a
  machine several readers share, that list is other readers' queries. The attribute is already
  there (`obsidian.js:2185`); this change makes it load-bearing and says so.
- **Escape is not bound.** `type="search"` clears the field natively, and that is a useful thing
  that costs nothing to leave alone. The way out of the list is up and left, which is the way in
  reversed.

**Out of scope**, named so it is not read as an omission:

- The directory search field in the Obsidian plugin (`plugin-directory-search`). Different field,
  different list, its own change.
- A global key that focuses the search from anywhere (`/`, Ctrl+K). Claiming a key across the whole
  page is a decision about the page's key space, not about this field.
- Type-ahead within the list, Home/End, PageUp/PageDown, and any wrap-around.
- Anything on the server. No route changes, no query changes, no permission decision is reached
  differently.

**This change cannot disclose anything, and that is a property worth stating rather than
assuming.** The selection walks nodes that are already rendered, and a rendered node is one that
`corpus-search` already decided this session may see. Navigating issues no query — the debounced
`onSearchInput` path is untouched — so it cannot be used to probe, and holding arrow-down measures
nothing that reading the list does not already show. The one channel the keyboard *does* open is
the browser's own form history, which is why the attribute that closes it is named as a decision
above instead of being left as an incidental.

## Capabilities

### New Capabilities

- `corpus-search-keyboard`: how a reader drives the corpus search and its result list from the
  keyboard — what the field does when it takes focus and from which pointer, the selection that
  walks results and an expanded result's headings, what each arrow key means in each position,
  where the selection is handed back and how it is resumed for as long as the query stands, that
  following a selection does what following the link does, that the open/closed state is shared
  with the pointer, that a touch session is unaffected, and that none of it reaches anything not
  already rendered or issues a query of its own.

### Modified Capabilities

None. `corpus-search` is deliberately left as it stands: it is a contract about what a search may
return and what it may never reveal, and everything here is about operating a list whose contents
that contract has already settled. Its requirement that a result "can be expanded to the headings
within that document under which matches were found" and that "the reader SHALL be able to open the
document itself or to follow one of those headings" continues to hold word for word — this change
adds a second way to do both, and removes neither.

## Impact

**Code**

- `obsidian-page.js` — the selection state and the `keydown` handler, and the parts of
  `showSearchResults` (`obsidian-page.js:289-365`) that have to give each node an identity the
  selection can name. The rebuild-on-every-answer behaviour stays: a new answer is a new list, and
  a selection into the old one means nothing.
- `obsidian.js:2178-2191` — the field gains the attributes that make the selection real for
  assistive technology, and keeps the ones it has.
- `css/search.css` — the selected state, which is `.highlight` applied to an existing node rather
  than a new colour.
- No change to `app.js`, to the `/search` route, to `scanFiles`, or to any permission code.

**Verification**

- A new check module under `test/checks/`, driven through the existing Puppeteer session
  (`test/harness.js`), because a key that must not move the caret is only provably not moving it in
  a real browser. The corpus already holds what it needs: `search` occurs in six of the 23 corpus
  files, which is a list several results long, and `Absatz` occurs in exactly one —
  `md/test-search-jump.md` — under four headings a student session may see, the document's own
  title among them, which is a single result that expands. No new corpus file is required.
- `test/coverage-map.json` gains the new check; `test/coverage.test.js` fails on a check file that
  is not recorded.

**Documentation**

- The keys belong in the same document that describes the search for a reader rather than in a
  comment only the next implementer will find.
