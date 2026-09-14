## 1. Stop softening the text

- [x] 1.1 In `css/body.css`, remove `text-shadow`, `-webkit-font-smoothing`, `-moz-osx-font-smoothing`, and the duplicated `text-rendering` declaration, leaving one.
- [x] 1.2 Replace `font-family: Inter` in `css/body.css` with the system sans stack from design.md — `Inter` resolves to nothing, and `body` is the floor under everything that is neither the content nor a `.nav-font` element.

## 2. Let a page lay itself out at the device's width

- [x] 2.1 Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to the `<head>` in `wrapInPage` in `obsidian.js`.
- [x] 2.2 Add the same tag to `wrapAsDocument`. Leave `wrapInReveal` alone — its scale pinning is what lets a deck size itself.
- [x] 2.3 Open a page at ~390px wide and walk it: the sidebar behind the burger, the content column, the top bar, a table, a code block, an image. Fix what the narrow-screen rules get wrong — they have never actually run, so anything found here belongs to this change.

## 3. Make every named font resolve

- [x] 3.1 In `css/markdown.css`, change `.shiki`'s family from `Fira-Code` to `"main FiraCode"` with the monospace fallback chain from design.md.
- [x] 3.2 Add the `#markdown-content :not(pre) > code` rule with the same chain and `font-size: 0.9em`. Verify against a corpus page that an inline span and a block span do not compound to `0.81em`.
- [x] 3.3 Give `#topbar` `class="nav-font"` in `wrapInPage` in `obsidian.js`, so it follows the reader's navigation font like the sidebar and the menu.
- [x] 3.4 Replace `word-break: break-all` with `overflow-wrap: anywhere` on `.shiki` in `css/markdown.css` and on `.topbar-title` in `css/topbar.css`.

## 4. Soften the dark theme and settle the link states

- [x] 4.1 In `css/fixes.css`, move `.dark-mode` to `#e2e2e2` on `#1e1e1e`. Leave the `color` declaration without `!important`: the link colours in `css/movement.css` are set at `.dark-mode a:link` and win over `.dark-mode` on specificity alone, but an `!important` here would beat them and turn every link on the page into body text. The existing `!important` is on the background only, and stays that way.
- [x] 4.2 In `css/movement.css`, scope the two rules that currently carry a bare `a:visited` alongside scoped `a:link` selectors, so the navigation colour and the missing underline stop reaching content links.
- [x] 4.3 Give content links one appearance in both states: `#0000EE` and underlined for `:link` and `:visited` alike.
- [x] 4.4 Write the dark-theme link rules at specificity matching or above the content rules — `#markdown-content a` outranks `.dark-mode a`, and getting this wrong paints `#0000EE` on the near-black page at about 1.3:1.
- [x] 4.5 Read the dark link's computed colour off a rendered page rather than off the selectors. Two different cascade mistakes reached a picture during planning and neither was visible in the stylesheet: the ID outranking in 4.4, and an `!important` on `.dark-mode { color }` swallowing the link rule as in 4.1. Both produced links indistinguishable from prose, and both were caught by looking.
- [x] 4.6 Change the dark-mode hover from `rgb(115,115,255)` to `#d4d4ff` — the current value measures 4.47:1 and is darker than its own resting state, which is backwards on a dark ground.

## 5. Guard it

- [x] 5.1 Write `test/checks/legibility.js` against the existing harness, asserting on computed styles from a rendered corpus page: no text shadow and no smoothing override on the prose; the viewport tag present in the page and document views and pinning no scale; inline and block code proportional to the reader's chosen size; the dark pairing measured as a contrast ratio rather than string-compared; a content link identical in `:link` and `:visited`, measured in both themes.
- [x] 5.2 Add the families check: read the font-family names `css/` declares and the `@font-face` names the renderer emits, and fail on any name that resolves to neither a declared family nor a generic keyword. This is the part that guards against the next occurrence rather than recording this one.
- [x] 5.3 Import the new check from `test/content.test.js` alongside the others.
- [x] 5.4 Add the check to `test/coverage-map.json` with `css/body.css`, `css/markdown.css`, `css/movement.css` and `css/fixes.css` as the files it guards, and add it to `test/content.test.js`'s own guards list.
- [x] 5.5 Run `npm test` and confirm the suite passes, including `test/coverage.test.js`.

## 6. Write the naming rule down

- [x] 6.1 Record in `docs-development.md` that a shipped font is named `main <basename>` or `nav <basename>` after `getFontImports()`, and that every family declaration carries a fallback chain ending in a generic family.
- [x] 6.2 Point `docs-render-pipeline.md` at that section rather than restating it, per `source-conventions`.

## 7. Hand it over

- [x] 7.1 Compare the page before and after, in both themes, at desktop and narrow width — the same comparison that motivated the change.
- [x] 7.2 Look at the result once on macOS if a machine is reachable: removing the smoothing is the one change that trades one appearance for another rather than fixing something broken. **No machine is reachable, and none is expected to be** (Gerald, 2026-09-14), so the condition does not hold and the comparison is not made.
- [x] 7.3 Sync downstream in the established order — safeLearn first, then merge public/master in secureLectures.
