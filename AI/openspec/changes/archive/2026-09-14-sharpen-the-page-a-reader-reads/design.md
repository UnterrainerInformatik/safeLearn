## Context

See proposal.md — Why. What shapes the approach here is where the defects live and what already exists around them.

Fonts are declared at render time, not in a stylesheet: `getFontImports()` in `obsidian.js` walks `assets/main-fonts/` and `assets/nav-fonts/` and emits one `@font-face` per file, naming each family `main <basename>` or `nav <basename>`. Nothing in `css/` can name a shipped font without that prefix, and two declarations currently get it wrong. The prefix is the reason the mistake is easy to make and will be made again, which is why this change writes it down.

Two of the reader's preferences are applied as inline styles by `applyAttributes()` in `obsidian-page.js`: text size and line height land on `#markdown-content`, and the chosen navigation font lands on every `.nav-font` element. An inline style beats any stylesheet rule, so anything this change adds has to sit either below those (relative units that scale with them) or outside the elements they touch.

The reading surface has no stylesheet of its own. `css/markdown.css` holds the column, images and tables; `css/body.css`, `css/fixes.css` and `css/movement.css` each hold one of the defects. No check guards any of those three.

## Goals / Non-Goals

**Goals:**

- Each fix lands in the stylesheet that already owns the rule, so the change reads as a correction rather than as a restructuring.
- The corrected font names come with the naming rule written down, so the next stylesheet does not reintroduce an unresolvable name.
- The reader's stored preferences keep meaning exactly what they meant before: no preference is reinterpreted, migrated or reset.

**Non-Goals:**

- No new stylesheet and no typography layer. The heading scale, the reading measure and the paragraph rhythm are a separate change, and they want a file of their own; putting a partial version of it here would have that change start by undoing this one.
- No new font files. Real bold and italic cuts are the largest item on the list and are deliberately left out.
- No new colour palette. The link work unifies two states that disagree; it does not choose new colours, except where the existing colour fails a threshold.

## Decisions

### Remove the shadow and the smoothing rather than tuning them

`body.css` currently carries `text-shadow: 1px 1px 1px rgba(0,0,0,0.05)`, `-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`, and `text-rendering: optimizeLegibility` twice. All four go.

The shadow has no setting that helps: any non-zero offset is a blurred copy of the glyph, and the alpha only decides how visible the damage is. The smoothing pair is a genuine trade — it is what some designers reach for on macOS — but it works by dropping subpixel positioning, which costs the rasteriser information it cannot get back. Since every family here ships a single 400 upright and every bold on the page is therefore synthesised, the thinning compounds with strokes that are already approximations. The duplicated `text-rendering` buys nothing in current browsers; kerning and standard ligatures are on by default.

*Alternative considered:* keeping the smoothing behind `@media (-webkit-min-device-pixel-ratio: 2)`. Rejected — it would keep a platform-conditional rule alive to preserve an effect nobody asked for, and a future reader would have to relitigate it.

### The viewport declaration goes in the two wrappers that lack one, verbatim

`wrapInPage` and `wrapAsDocument` each gain:

```
<meta name="viewport" content="width=device-width, initial-scale=1">
```

No `maximum-scale`, no `user-scalable=no`. `wrapInReveal` keeps its existing declaration including the scale pinning, because Reveal computes its own scale against the viewport and a reader zooming a deck fights that computation. The difference between the three views is therefore a stated decision, which is the shape `page-bootstrap` already asks of differences between the views.

The consequence to expect: the `max-width: 1024px` and `max-width: 700px` rules in `css/media.css` begin to apply on devices where they never did. They were written for this and hide the sidebar behind the burger, but they have not run on a real phone, so the narrow layout needs looking at once rather than assuming.

### `body` gets a system stack, and the top bar gets the navigation-font class

`body { font-family: Inter }` names nothing. Rather than pointing `body` at `nav Inter` — which would pin it to one family and ignore the reader's choice — `body` becomes a neutral system sans that serves only as the floor beneath everything, and `#topbar` gains `class="nav-font"` so it follows the reader's navigation font the way `#sidebar` and `#topdown-menu` already do.

```
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
```

This is the only part of the change with a visible effect beyond sharpness: the file name in the bar above the page currently renders in the browser's default serif and will start matching the navigation column.

### Inline code is styled separately from the block, and excluded from it

`.shiki` gets the resolvable name and a fallback chain:

```
font-family: "main FiraCode", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

Inline code gets its own rule, and the child combinator is the point of it:

```
#markdown-content :not(pre) > code {
  font-family: "main FiraCode", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
```

`.shiki` already sets `font-size: 0.9em`, and a `code` inside `pre.shiki` would take both and land at `0.81em`. `:not(pre) > code` reaches inline spans only.

Measured on a rendered page rather than assumed: an inline span today computes to the generic `monospace` at 18px, while the block beside it is 16.2px in a different face. Chrome's separate monospace default — the thing that usually shrinks an unstyled span — does not bite here, because `applyAttributes()` writes an explicit pixel size onto `#markdown-content` and the span inherits it. So the size is defensible today for a reason that has nothing to do with code, and the face is not defensible at all. Stating both makes the result true by construction rather than by side effect, and puts inline code and block code in one face at one size.

`word-break: break-all` on `.shiki` becomes `overflow-wrap: anywhere`, so a long token wraps at the edge instead of being cut at an arbitrary character. The same change applies to `.topbar-title`.

*Alternative considered:* styling bare `code` and resetting inside `.shiki`. Rejected — two rules that have to agree, where one rule that cannot overlap will do. `css/search.css` already uses `overflow-wrap: anywhere` for the same reason, so this follows an existing decision rather than making a new one.

### The dark theme moves to `#e2e2e2` on `#1e1e1e`

Measured: today's `#ffffff` on `#1c1c1c` is 17.04:1. The replacement is 12.87:1 — still nearly double the WCAG AAA threshold of 7:1 for body text, and out of the range where light glyphs bloom into the dark. The background moves by two points at the same time so the pair is chosen together rather than one being left where it was.

Both values live in `css/fixes.css` under `.dark-mode`, which is applied to the body, the content, the sidebar, the top bar and the menu alike, so the whole surface moves together.

*Alternative considered:* leaving `#1c1c1c` and lowering only the foreground. Rejected for no reason stronger than that a pairing is easier to reason about, and to reconsider later, when both halves were set deliberately.

### Link states are unified by fixing the selectors, not by choosing colours

`css/movement.css` today reads, in two places, `.sidebar-menu a:link, .folder-files a:link, a:visited` — the third selector is unqualified where the first two are scoped, so *every* visited link on the page takes the sidebar's colour and loses its underline. That is almost certainly a slipped qualifier rather than an intent.

Both states get the same treatment, in both places:

- Navigation and file list: `:link` and `:visited` both `blue`, both without underline. A list of links is not prose.
- Running text: `:link` and `:visited` both `#0000EE` — the colour an unvisited content link already has — both underlined. Colour alone is not enough to mark a link, and content links are underlined today until they are followed.

One colour does change. The dark-mode hover is `rgb(115,115,255)`, which measures 4.47:1 against the new background — below AA, and darker than its own resting state, which is backwards on a dark ground. It becomes `#d4d4ff` (11.64:1), lighter than the resting `#b4b4ff` (8.66:1). The light-mode hover `darkblue` is 15.30:1 and stays.

**The dark rule has to outrank the content rule, and by default it does not.** Scoping content links as `#markdown-content a:link` gives them an ID's specificity, which beats `.dark-mode a:link` — so the light-theme colour would win in the dark theme and paint `#0000EE` on a near-black page, around 1.3:1 and effectively unreadable. This was not reasoned out; it was produced by injecting a first draft of this change into a running page and photographing the result, where the dark link came out dark blue. The dark rule is therefore written at matching or higher specificity — `#markdown-content.dark-mode a:link, #markdown-content.dark-mode a:visited` — and the check asserts the dark link's colour rather than only the light one's.

### The naming rule gets written down

The `main `/`nav ` prefix exists only in `getFontImports()`, and two stylesheets have already guessed wrong. The rule and the fallback-chain requirement go into `docs-development.md` beside the other things a contributor is told before touching the source, with `docs-render-pipeline.md` pointing at it rather than restating it — the shape `source-conventions` asks for when a rule is recorded in more than one place.

### One new check, guarding four unguarded stylesheets

`test/checks/legibility.js`, imported by `test/content.test.js` like the others, asserting against computed styles on a rendered page through the existing harness: no text shadow and no smoothing override on the prose; the viewport tag present in both wrappers and pinning no scale; every family named in `css/` resolving to a declared or generic name; inline and block code proportional to the reader's chosen size; the dark pairing measured rather than string-compared; and a content link identical in both states.

The families check reads `css/` and the emitted `@font-face` names and compares the two sets, so it fails on a name that resolves to nothing whether or not anyone thought to assert that particular declaration. That is what makes it a guard against the next occurrence rather than a record of this one.

`test/coverage-map.json` gains the check with `css/body.css`, `css/markdown.css`, `css/movement.css` and `css/fixes.css` as the files it guards — none of which any check claims today.

## Risks / Trade-offs

- **Removing the smoothing makes text heavier on macOS Retina, where it currently applies.** → It is the platform's own rasterisation, and with every bold on the page synthesised from a 400 upright, more stroke rather than less is the right direction here. Worth a look on a Mac before merging, since it is the one change that trades one appearance for another rather than fixing something broken.
- **The viewport declaration activates narrow-screen rules that have never run in anger.** → The media queries were written for this path and hide the sidebar behind the burger, but they have not faced a real phone. Check the page at ~390px once, and treat any breakage found as belonging to this change rather than deferring it — the declaration is what made it reachable.
- **The top bar changing font is visible to every reader on the first load after deploy.** → It is a correction toward the rest of the chrome, not away from it, and it is named in the proposal so it does not arrive as a surprise.
- **`:not(pre) > code` misses code nested one level deeper inside a `pre` wrapper.** → It is written against what the pipeline emits, and the check asserts on a rendered page from the corpus rather than on a fixture, so a future wrapper that breaks the assumption fails the check instead of silently shrinking code.
- **A theme rule can be outranked by a scoping rule added in the same change.** → This already happened once in a draft, and the mitigation is in the decision above: the dark rules are written at matching or higher specificity and the check measures the dark link, not just the light one.
- **Four stylesheets and one renderer file change at once with no behavioural test today.** → The check lands in the same change, and the coverage map entry means the hook naming covering checks will point at it the next time any of those files is edited.

## Migration Plan

Nothing to migrate. No stored preference changes meaning, no corpus file changes, no route or payload changes. Deploy is the ordinary one; rollback is a revert, and a reverted deployment renders exactly what it rendered before.

The one ordering note: `secureLectures` is downstream and takes these as app decisions, so the sync order applies — safeLearn first, then merge public/master downstream.

## Open Questions

- Whether the light-mode content link should eventually move off `#0000EE` to something less saturated. Deferrable: this change makes the two states agree, and whatever colour is chosen later replaces one value in one rule without touching the specs, the approach or the task breakdown.
