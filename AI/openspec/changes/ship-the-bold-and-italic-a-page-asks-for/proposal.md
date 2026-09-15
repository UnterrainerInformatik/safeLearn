Source: AI/open-proposals.md — "Die Hauptschrift wird ohne Fallback gesetzt"

## Why

Every font this deployment ships is a single file: one static face, weight 400, upright. Measured across all 21 files in `assets/main-fonts/` and `assets/nav-fonts/` — `OS/2.usWeightClass` is 400 on every one, the italic bit in `fsSelection` is clear on every one, and not one of them carries an `fvar` table, so none is a variable font with a weight axis to reach into. `getFontImports()` in `obsidian.js` then emits exactly one `@font-face` per file, carrying no `font-weight` and no `font-style` descriptor.

One face per family means the browser has nothing to switch to. Every bold on a SafeLearn page is therefore a synthetic bold — the outline of the regular smeared outward — and every italic is a synthetic oblique, the upright sheared about twelve degrees. Neither is what a typeface designer drew. A real bold redistributes weight between stems and hairlines and reshapes the counters; a real italic in most of these families is a different construction altogether, with single-storey letterforms and joined strokes.

This is not confined to the occasional emphasised word. `#markdown-content` overrides no heading weight, so `h1`–`h6` fall to the browser's default of 700: **every heading of every page in the corpus is a fake bold today**. So are table headers (`css/markdown.css`), callout titles, and the title in the bar above the page (`css/topbar.css`). On the slides the gap is already written down — the header comment of `css/reveal-theme-moon.css` says, of the three Lato files it declares, "the three files here are upright, so italic Lato is the browser's slant of the upright face" — and there `.reveal em`, a blockquote and `q` are set italic at a base weight of 300.

`sharpen-the-page-a-reader-reads` named this as the work it was deliberately leaving behind: "Not in scope, and deliberately left for later: real bold and italic font cuts (every family in `assets/main-fonts/` ships a single 400 upright, so headings and emphasis are synthesised)." This is that change.

The backlog entry it also retires belongs here rather than anywhere else. `applyAttributes()` writes the reader's chosen main font onto `#markdown-content` as a bare inline `font-family` with no fallback behind it, and the navigation font onto every `.nav-font` element the same way; if the file does not arrive, the text lands on the browser's default, typically a serif. Fixing that needs a table saying which generic family each shipped font belongs to — and that is the same table that has to say which of them has a real italic at all. Two tables in two places, kept in step by hand, is the version of this worth avoiding.

## What Changes

- **Ship the real cuts.** 29 new files in `assets/main-fonts/` and 8 in `assets/nav-fonts/`, named to extend the convention the two existing `Lato-300.ttf`/`Lato-700.ttf` files already set: `<Name>-700.ttf`, `<Name>-italic.ttf`, `<Name>-700italic.ttf`. Static TTFs, taken from the same upstream release as the regular already in the directory so the metrics match, unsubsetted, one licence file per family beside them as `Lato-OFL.txt` already sits there.

- **Declare them as faces of one family.** `getFontImports()` stops emitting one anonymous face per file and instead emits, per family, the faces it has — each carrying the `font-weight` and `font-style` descriptors that let the browser pick between them. `main Inter` becomes four faces rather than four families.

- **Keep the new files out of the picker.** `pickerFontName()` excludes `-700` today through `/-\d{3}$/`, but `Inter-italic.ttf` would match nothing and appear in the font picker as a selectable font named "Inter-italic". The exclusion is widened to the full suffix convention.

- **Make the picker's stored index stable.** **BREAKING if not done.** `getMainFontsSelection()` emits an array index as each `<option value>`, and `applyAttributes()` reads `attributes.t` back as an index into `mainFontsArray`. That array is filled in `fs.readdirSync()` order and never sorted. Adding 37 files to these two directories can reorder the entries already in it, which would silently change the font every reader has chosen. The arrays are sorted before the files land.

- **Give the inline font declarations a fallback.** The chosen main font and navigation font are written with a chain behind them ending in the generic family that font belongs to — a serif behind EB Garamond, a monospace behind FiraCode and Ubuntu Mono, a sans behind the rest. One table per font, in one place, also carrying whether that family has a real italic.

- **Let the deck have its italics.** `css/reveal-theme-moon.css` gains the italic `@font-face` blocks its upstream asked for, including Lato at 300 italic, which is the weight its `em`, `q` and blockquote actually resolve at. The header comment that documents the gap is rewritten to document that it is closed.

- **Three families keep their synthesis, on purpose.** FiraCode, Oswald and PT Sans Narrow have no italic upstream, as far as the research so far shows; this is verified when the files are fetched, and where it holds, those families get a bold and no italic. A CSS request for italic there falls to the browser's oblique, which is the only thing available and is what CSS does on its own.

- **Navigation gets bold only.** No selector under `.nav-font` asks for italic. `css/buttons.css` asks for weight 500, which resolves to the 400 face without synthesis. So the navigation directory gets the eight `-700.ttf` files and nothing else. Seven of them are copies of files fetched for `main-fonts/` — the two directories already hold byte-identical duplicates of the fonts they share — leaving `PT Sans Narrow-700.ttf` as the only download made for the navigation alone.

No corpus file changes. Line breaks within a paragraph may shift where a bold or italic run now has its own metrics instead of the regular's; that is the correction, not a regression.

## Capabilities

### New Capabilities

None. The ground this covers is `reading-legibility`'s.

### Modified Capabilities

- `reading-legibility`: a new requirement that bold and italic on a rendered page are set in cuts the deployment ships rather than synthesised by the browser, and that a family without a real cut is a deliberate, recorded exception. The existing requirement "Every font family a stylesheet names resolves to one the deployment ships" is modified: its fallback-chain obligation is widened from stylesheet declarations to every declaration naming a shipped family, which is what reaches the two inline styles `applyAttributes()` writes.

## Impact

- `assets/main-fonts/`, `assets/nav-fonts/` — 37 new `.ttf` files, roughly 12–15 MB, plus per-family licence files.
- `obsidian.js` — `getFontImports()` (emitting descriptors and grouping faces under one family), `pickerFontName()` (the widened exclusion), and both `scanFonts()` and the font branch of the general scan, which fill `mainFontsArray`/`navFontsArray` and must sort them.
- `obsidian-page.js` — `applyAttributes()`, where the two inline `font-family` writes gain their fallback chains.
- `css/reveal-theme-moon.css` — the italic `@font-face` declarations and the header comment.
- `test/checks/legibility.js` — the fallback-chain check reaches only `css/` today and so cannot see either inline style; and nothing anywhere asserts that a bold on the page is a real face.
- `test/checks/deployment-surface.js` — the list of font references addressed only from a stylesheet, which today names the three Lato files.
- `test/coverage-map.json` — what the legibility check now guards.
- `docs-development.md` — the "Naming a font in a stylesheet" section, which describes the one-face-per-file emission that this change replaces.
- `AI/architecture.md` — wherever it describes the font pipeline.

Not in scope: converting the shipped fonts to `woff2`, which would cut the payload to roughly a quarter but touches the scanner, the emitted `format()` and every path in the deployment surface, and is worth its own change. Also not in scope: the reading measure and the heading scale, left behind by the same earlier change.
