## 1. One expand state, two callers

- [x] 1.1 Extract the chevron's toggle (`obsidian-page.js:319-322`) into a function that takes a result entry and the state it should be in, and sets `expanded` on the chevron and `collapsed` on the headings container together. The chevron's `click` listener becomes its first caller and nothing about pointer behaviour changes.
- [x] 1.2 Add a reader on the same pair: given a result entry, whether it has headings at all and whether they are currently shown. Nothing else in the change may ask this question a second way.

## 2. The nodes the selection walks

- [x] 2.1 In `showSearchResults`, give every `a.sl-search-name` and `a.sl-search-heading` an id from a counter within that render. It names a node for the current list only; the list is rebuilt whole, so it must not be treated as an identity that outlives the render.
- [x] 2.2 Add the walk order as a derived function: the anchors of both classes in document order, minus every heading sitting in a container that carries `collapsed`. Derive it on each key press rather than caching it — an expand and a collapse must not have to remember to invalidate anything.
- [x] 2.3 Add the selection as one module-level reference to the selected anchor, or `null`, with a setter that moves the `highlight` class from the previous node to the new one and calls `scrollIntoView({ block: "nearest" })` on it.
- [x] 2.4 Null the selection at the top of `showSearchResults`, before `replaceChildren()`, so a new answer gives it up in one line rather than by cleanup afterwards.
- [x] 2.5 Add the second reference beside it: the node the selection was last handed back from. Clear it in `onSearchInput` (`obsidian-page.js:241`) on every keystroke that changes the query, ahead of the debounce and of the minimum-length check — not when a new answer arrives. The rule is *as long as nothing is typed*, and clearing it there is also what stops it ever outliving the list it points into.
- [x] 2.6 Confirm the mark is visible in dark mode without new CSS: it lands on an `<a>`, and `showSearchResults` already adds `dark-mode` to every `a` in the list, so `a.dark-mode.highlight` (`css/fixes.css:12`) applies. Only add to `css/search.css` if looking at it says the sidebar needs more contrast than `.highlight` gives — design.md's open question.

## 3. The key handler

- [x] 3.1 Add a `keydown` listener on the search field, in the bubble phase, that returns immediately for any event carrying `ctrlKey`, `altKey` or `metaKey`, so the window-level Ctrl+Alt shortcut (`obsidian-page.js:16-35`) keeps its keys.
- [x] 3.2 Implement the decision table in design.md — ArrowDown, ArrowUp, ArrowRight, ArrowLeft and Enter, each against the three positions the selection can hold. The cells marked "not handled" must return without touching the event, which is what leaves arrow-left and arrow-right as caret movement while the caret is in the field.
- [x] 3.3 Call `preventDefault()` on every key press the handler acts on, and on none that it does not.
- [x] 3.4 Open a selection with `anchor.click()`, so a result and a heading are opened by the same code that opens them for the pointer.
- [x] 3.5 Do not wrap at either end: at the last node ArrowDown leaves the selection where it is, and ArrowUp at the first result gives it up rather than jumping to the last.
- [x] 3.6 When the selection is handed back, put the caret at the end of the query and store the node it stood on. The caret position is not cosmetic: it is the position from which ArrowRight means the list.
- [x] 3.7 Implement ArrowRight in the field as one condition — the caret collapsed at the end of the query (`selectionStart === selectionEnd === value.length`). False means the event is left alone, so a selected query collapses natively and a caret inside the query moves one character. True and results displayed means the stored node, or the first result when nothing is stored. True with no results means nothing.

## 4. Focusing the field

- [x] 4.1 Record `event.pointerType` on `pointerdown` on the field, together with the coordinates of the press. Clear the record on `pointerup` and on `blur`.
- [x] 4.2 In a `focus` listener, read that record and clear it: `touch` returns without doing anything; anything else, and an absent record, calls `field.select()`.
- [x] 4.3 Add the `mouseup` guard that keeps the selection the focus handler made: `preventDefault()` only for the mouseup of the press that caused the focus, and only when the pointer moved no more than a few pixels. A press that moved is a drag and must keep the browser's own selection.
- [x] 4.4 Verify by hand that the touch path executes nothing beyond the early return in 4.2 — no selection, no mark, no suppressed default.

## 5. What the mark means to assistive technology

- [x] 5.1 In `obsidian.js:2178-2191`, give the field `role="combobox"`, `aria-controls` naming `searchResults`, and `aria-expanded`. Keep `autocomplete="off"` and note in the markup's comment why it is now load-bearing: ArrowDown must enter the result list, never the browser's own list of earlier queries.
- [x] 5.2 Set `aria-activedescendant` on the field to the id of the selected node, and remove it when the selection is given up — from the same setter as 2.3, so the mark and the announcement cannot disagree.
- [x] 5.3 Give the list `role="listbox"`, every anchor in it `role="option"`, and every expandable result's row `aria-expanded`, kept in step by the toggle from 1.1.

## 6. Verification

- [x] 6.1 Add `test/checks/search-keyboard.js` and import it from `test/content.test.js`, so it runs in the same process and on the same logins as the rest of the content suite.
- [x] 6.2 Drive the walk with the two fixtures the corpus already holds: `search` for a list several results long, and `Absatz` for the single result in `md/test-search-jump.md` that expands to the four headings a student session may see. Assert first that each query really does return that shape, so a later corpus edit fails the fixture rather than quietly weakening the checks.
- [x] 6.3 Assert the selection: ArrowDown from the field marks the first result, exactly one node is marked at a time, and ArrowDown at the last node leaves it where it is.
- [x] 6.4 Assert the expand path: ArrowRight opens a result and leaves the mark on it, ArrowRight again marks its first heading, ArrowDown walks the headings and steps out to the next result, and ArrowUp from a result steps back into the heading list above it.
- [x] 6.5 Assert the way back: ArrowLeft on a heading closes the list and marks the result; ArrowLeft on a result that is not open, and ArrowUp on the first result, both leave nothing marked with the caret at the end of the query — and an ArrowLeft after either of them moves the caret within the query instead of selecting anything.
- [x] 6.6 Assert the way back in: after handing the selection back from the third result, ArrowRight with nothing typed in between marks the third result again; ArrowDown in the same position marks the first, because the two keys mean different things. Assert both against a list long enough for third and first to differ.
- [x] 6.7 Assert the three field positions ArrowRight distinguishes: whole query selected → the text selection collapses to the end and nothing is marked; caret inside the query → the caret moves one character and nothing is marked; caret at the end with no results → nothing is marked.
- [x] 6.8 Assert that typing forgets the stored node: hand the selection back from the third result, type one further character, and ArrowRight marks the first result of the new answer.
- [x] 6.9 Assert Enter on a result opens the document at its beginning, and Enter on a heading opens it at that heading — compared against what clicking the same node does, not against a rebuilt expectation.
- [x] 6.10 Assert focus behaviour: a click into a field holding a query selects the whole query; ArrowRight then leaves the caret at the end and a typed character appends; a `pointerdown` carrying `pointerType: "touch"` before the focus leaves nothing selected.
- [x] 6.11 Assert that entering the list, walking it and leaving it make no request to `/search`, counted over the session rather than reasoned about, and that the query in the field is unchanged throughout.
- [x] 6.12 Assert the shared state in both directions: a result expanded with the chevron can be walked into by key, and one expanded by key is closed by the chevron.
- [x] 6.13 Assert that a new answer gives the selection up — narrow the query while a node is marked, and again until it falls below the minimum length.
- [x] 6.14 Assert that ArrowDown while a node is marked neither moves the caret within the query nor scrolls the page, and that the Ctrl+Alt print shortcut still works while the caret is in the field.
- [x] 6.15 Record the new check in `test/coverage-map.json` with its guarded files — `obsidian-page.js`, `obsidian.js`, `css/search.css`, `css/fixes.css` and `test/harness.js` — and its corpus file. `test/coverage.test.js` fails on a check file that is not recorded.
- [x] 6.16 Run `npm test` and confirm the existing search and rendering checks are untouched: nothing in this change may alter a result, a snippet, a heading list or a rendered page.

## 7. Documentation

- [x] 7.1 Write the keys down where a reader of the application finds them rather than only in a comment, alongside the existing description of the search, and say there that touch alone still operates everything.
- [x] 7.2 Note in `AI/architecture.md`'s observations what this change decided and why — that focus stays in the field, and that select-on-focus is decided by the pointer of the press rather than by the device.
