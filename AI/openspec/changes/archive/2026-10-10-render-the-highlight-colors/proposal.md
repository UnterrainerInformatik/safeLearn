## Why

Obsidian 1.14 (desktop, 2026-09-02; announced 2026-10-05) gave highlights six colours: a colour emoji directly after the opening `==` picks one — `==🔴Important==` — and the editor writes that syntax itself, from the formatting submenu and from the suggestions that appear on typing `==` ([changelog](https://obsidian.md/changelog/), [syntax help](https://obsidian.md/help/syntax)). Authors of the corpus colour text in their vault and expect to see it on the page.

SafeLearn did not render a highlight at all, coloured or not. `marked` with `gfm: true` knows no `==`, and none of the passes in `preParse` or `manipulateHtml` rewrote it, so `==Important==` reached the reader as the literal text with its equals signs — and since 1.14, with a red circle in front of it.

## What Changes

- **`==text==` renders as a highlight**, in the page, the document view and the presentation view, in the tint Obsidian uses when no colour is chosen.
- **A colour emoji directly after the opening `==` picks one of six tints** — 🔴 red, 🟠 orange, 🟡 yellow, 🟢 green, 🔵 blue, 🟣 purple — and is not shown. The tints are Obsidian's own base colours, laid under the text at a fraction of their strength, with dark-mode variants.
- **The highlighted text keeps the colour and the contrast of the text around it.** A browser's default `<mark>` paints its text black, which in dark mode would be black on dark grey.
- **Inline formatting inside a highlight keeps working**, and a highlight is never formed inside a code span or a fenced block, nor out of a run of three equals signs (`a === b`).

## Capabilities

### New Capabilities

- `highlight-rendering`: how SafeLearn renders Obsidian's highlight syntax — the plain form, the six colours and the emoji that selects them, legibility in both themes and in the deck, and the places a `==` must be left alone.

### Modified Capabilities

None. `content-verification` already requires a check per rendered feature against the corpus page; this change adds a feature and a check under that rule rather than changing it.

## Impact

- `obsidian.js` — new `highlightColors` and `highlightExtension` (a `marked` inline extension); `wrapInReveal` links one more stylesheet.
- `app.js` — `highlightExtension` registered on `markedLight` and `markedDark`.
- `css/highlights.css` (new), `@import`ed by `css/main.css`.
- `md/test-md-file.md` — a "Test Highlights" section; `test/checks/rendering.js` — one check; `test/coverage-map.json` — the new stylesheet under the rendering check.
- `docs-obsidian.md` — a section for authors; `AI/architecture.md` — feature table, pipeline, stylesheet inventory.
- No dependency, no preference, no route. The Obsidian plugin is untouched: Obsidian renders the syntax in the editor itself.
- Downstream: `secureLectures` picks it up through the usual sync from safeLearn.
