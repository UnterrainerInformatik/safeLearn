## Why

A student using SafeLearn reads, for hours, and what a glyph looks like on their screen is therefore not a cosmetic concern. Four things currently work against that, and three of them are the stylesheets not doing what they say they do: `body.css` names a font family that does not exist, `markdown.css` names a second one that does not exist, and inline code is left unstyled and so falls out of the reader's chosen size entirely. The fourth is deliberate and works backwards — a `text-shadow` on the body puts a blurred copy of every letter one pixel below and to the right of itself, which is the opposite of sharp.

Alongside those, a page carries no viewport declaration, so a phone or tablet lays it out at 980px and scales the result down: the text arrives both smaller and softened by the downscale. And the dark theme sets pure white on near-black, a contrast high enough that the glyphs bloom into the background over a long reading session.

None of this needs new fonts or a new design. It is a set of stylesheet defects with a `<meta>` tag beside them, and it is worth doing on its own, before the larger typographic work that would follow it.

Measured before and after on a rendered corpus page, the items are not of one size. The missing viewport is by far the largest: a phone lays the page out at 980px and scales it to 0.398, so 18px prose arrives as roughly 7px, and 28% of the pixels on screen change when the declaration is added. The dark-theme pairing and the top bar's font are visible at a glance. The shadow and the smoothing are real but small — they move 7.9% of the pixels in a line of prose, by at most 4.7% of full brightness. They are worth removing because they are defects with no upside, not because a reader will gasp at the difference.

## What Changes

- **Stop blurring the text.** Remove the `text-shadow` from `body`, and remove the `-webkit-font-smoothing`/`-moz-osx-font-smoothing` overrides that thin the glyphs on the platforms where they apply. Remove the duplicated `text-rendering` declaration while the rule is open.
- **Declare a viewport** in the page view and the document view, so a small screen lays the page out at its own width and the existing media queries reach it. Zoom stays available — the declaration does not pin the scale. The presentation view keeps the declaration it already has, including its scale pinning, because a deck sizes itself.
- **Name fonts that exist.** `body` currently asks for `Inter`, a family no `@font-face` declares — the declared names are `main Inter` and `nav Inter`. `.shiki` asks for `Fira-Code`, where the declared name is `main FiraCode`. Both get a name that resolves, and `body` gets a real fallback stack so a miss degrades to a system sans rather than to a serif. The top bar is brought under the reader's navigation font, as the sidebar and the drop-down menu already are.
- **Style inline code.** With no `code` rule anywhere, an inline span falls to the browser's generic monospace. Measured on a rendered page: it comes out in the system monospace at 18px, beside a code block on the same page at 16.2px in a different face. Both the family and the size are accidents rather than choices. An explicit rule puts inline code in the same face as the block and in fixed proportion to the prose.
- **Soften the dark theme.** Replace pure `#ffffff` on `#1c1c1c` with a pairing that still clears WCAG AAA by a wide margin but does not halate.
- **Unify the link states.** `a:visited` is currently styled unqualified while `a:link` in content is not, so a link in the text changes both colour and underline once it has been followed. Both states get the same treatment, and a link in running text keeps an underline so it is not distinguished by colour alone.

No corpus file changes, and no reader's stored preferences change meaning.

## Capabilities

### New Capabilities

- `reading-legibility`: What a rendered page must present to the person reading it — glyphs rendered without anything softening them, a layout that adapts to the device rather than being scaled down onto it, fonts that resolve to the files this deployment ships, code that sits at the size of the text around it, a dark theme readable over a long session, and a link that looks the same before and after it has been followed. `page-bootstrap` governs *when* a page becomes visible; this governs what it looks like once it is.

### Modified Capabilities

None. No existing requirement changes meaning; this capability covers ground no spec currently describes.

## Impact

- `css/body.css` — the shadow, the smoothing overrides, the duplicated `text-rendering`, and the unresolvable family name with its fallback stack.
- `css/markdown.css` — the `.shiki` family name, and a new rule for inline `code`.
- `css/fixes.css` — the dark-mode foreground and background pairing.
- `css/movement.css` — the link states, which today qualify `a:visited` and `a:link` asymmetrically.
- `obsidian.js` — `wrapInPage` and `wrapAsDocument` gain the viewport declaration; `#topbar` gains the navigation-font class.
- `test/checks/` — a new check, because none of `css/body.css`, `css/markdown.css` or `css/movement.css` is guarded by any check today, and `css/fixes.css` is guarded only for its highlight colour.
- `test/coverage-map.json` — the new check and the files it guards.
- `docs-render-pipeline.md` or `docs-development.md` — wherever the fallback stack and the `main `/`nav ` family-name prefix should be written down, so the next stylesheet does not reintroduce a name that cannot resolve.

Not in scope, and deliberately left for later: real bold and italic font cuts (every family in `assets/main-fonts/` ships a single 400 upright, so headings and emphasis are synthesised), the reading measure and the heading scale, and the downscaling of corpus screenshots.
