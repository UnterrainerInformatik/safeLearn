## Context

See proposal.md — Why, for the measurement and the motivation. What shapes the approach here is the shape of the existing pipeline, which is worth stating once:

- `scanFonts()` and the font branch of the general scan in `obsidian.js` walk `assets/main-fonts/` and `assets/nav-fonts/`, run each filename through `pickerFontName()`, and fill two maps (`mainFonts`, `navFonts`: name → path) and two arrays (`mainFontsArray`, `navFontsArray`) in `fs.readdirSync()` order, unsorted.
- `getFontImports()` turns each map entry into one `@font-face` with a family name of `"main " + basename` or `"nav " + basename`, a `src` and nothing else.
- `getMainFontsSelection()` / `getNavFontsSelection()` emit `<option value="<array index>">`, and the arrays are serialised into the page through `initFonts('<json>', '<json>')`.
- `applyAttributes()` in `obsidian-page.js` reads `attributes.t` and `attributes.nt` as indices into those arrays and writes `mainContent.style.fontFamily = "main " + font` — an inline style, which beats every stylesheet rule, with no fallback behind it.
- `attributes` is a free-form object persisted per reader; roughly 175 readers have one stored today.

Two consequences follow, and the design turns on them. A family is only ever one face, so weight and style have nothing to select between. And a reader's font choice is a position in a list whose order the filesystem decides.

## Goals / Non-Goals

**Goals:**

- One family per typeface, carrying every cut the deployment ships for it, so the browser selects rather than synthesises.
- A record, in one place, of what each shipped typeface is — its generic family and which cuts exist for it — so nothing has to be kept in step by hand in a second place.
- A reader's stored font choice that survives the arrival of 37 files.

**Non-Goals:**

- Changing which typefaces are offered. The picker's entries are exactly the ones it has today.
- A weight axis for the reader to choose. Body weight stays 400; 700 is what the markup asks for, not what a reader sets.
- Any change to how a deck is themed beyond giving the theme the italic files it already asks for.

## Decisions

### The filename carries the cut, and the scanner reads it

`<Name>-700.ttf`, `<Name>-italic.ttf`, `<Name>-700italic.ttf`, with `<Name>.ttf` staying the regular. This extends what `Lato-300.ttf` and `Lato-700.ttf` already established, and it means the emission is derived from the directory rather than declared beside it: a file that is added is emitted, and a file that is missing cannot be claimed.

`pickerFontName()` excludes a cut from the picker today through `/-\d{3}$/`. That widens to the full convention, so `Inter-italic.ttf` is recognised as a cut of `Inter` rather than as a typeface called "Inter-italic". The parse returns the family it belongs to together with its weight and style, which is what `getFontImports()` then needs anyway.

*Alternative considered:* a manifest file (`assets/fonts.json`) naming every face. Rejected — it is a second list of the same facts, and the failure it introduces is the quiet one: a manifest entry whose file is absent emits an `@font-face` pointing at nothing, and the text falls back without anything failing.

### `getFontImports()` emits faces, not families

Per typeface, one `@font-face` per cut, all four carrying the same `font-family` and differing in `font-weight` and `font-style`:

```css
@font-face { font-family: "main Inter"; font-weight: 400; font-style: normal;  src: url(...Inter.ttf) format("truetype"); }
@font-face { font-family: "main Inter"; font-weight: 700; font-style: normal;  src: url(...Inter-700.ttf) format("truetype"); }
@font-face { font-family: "main Inter"; font-weight: 400; font-style: italic;  src: url(...Inter-italic.ttf) format("truetype"); }
@font-face { font-family: "main Inter"; font-weight: 700; font-style: italic;  src: url(...Inter-700italic.ttf) format("truetype"); }
```

The regular must gain `font-weight: 400; font-style: normal` explicitly. A face with no descriptors defaults to `font-weight: normal`, which is 400, so today's behaviour is unchanged by stating it — but stating it is what stops the browser from treating the regular as a candidate for a 700 request once a 700 face is present.

### One table, keyed by typeface, holding what a filename cannot say

Two facts about a shipped typeface do not follow from its filename: which generic family it belongs to, and whether the absence of a cut is upstream's doing or ours. Both go in one table beside `pickerFontName()`:

| typeface | generic | note |
| --- | --- | --- |
| `EB Garamond` | `serif` | |
| `FiraCode` | `monospace` | no italic upstream |
| `Ubuntu Mono` | `monospace` | |
| `Oswald` | `sans-serif` | no italic upstream |
| `PT Sans Narrow` | `sans-serif` | no italic upstream |
| …the rest | `sans-serif` | |

This is the table the backlog entry asked for, and putting the italic exceptions in it is the reason it is one table rather than two. `applyAttributes()` reads the generic from it to write `"main Inter", sans-serif` instead of `"main Inter"`; the check reads the exception column to know which missing italic is expected.

The table has to reach the client, because `applyAttributes()` runs there. It travels the way the font arrays already do — through the `initFonts(...)` call the page is rendered with — rather than through a second channel.

*Alternative considered:* deriving the generic from the font file (`OS/2` `panose` serif class, `post.isFixedPitch`). Rejected — PANOSE is frequently unset or wrong in free fonts, and the answer here is eleven rows written once.

### A reader's choice is stored by name, and an existing numeric choice is migrated through a captured order

Sorting the arrays is necessary but not sufficient: sorting *is itself* a reordering, so a stored index means something different the moment it lands. The fix is to stop storing a position.

- The arrays are sorted, so the offered order is the deployment's and not the filesystem's.
- The reader's choice is stored as the typeface's name, under new keys alongside `t`/`nt`.
- A reader who has only the old numeric value has it interpreted through `LEGACY_FONT_ORDER` — a literal array of the names in the order the deployment enumerates them **today** — and the name is written back on the next save. The legacy arrays are captured from the running instance before anything else in this change is deployed; they are already serialised into every rendered page by `initFonts(...)`, so capturing them is reading one line of the served HTML.
- A stored name that matches no offered typeface falls to the first offered one, which is what the index path does today when the array has shrunk.

*Alternative considered:* sort, and accept that some readers' font silently changes once. Cheaper by about twenty lines, and the damage is small and self-correcting — a reader re-picks their font. Rejected because the requirement written for this change says a stored choice keeps its meaning, and because the captured-order constant makes the correct version small. The constant is dead weight afterwards and can be removed in a later change, once the stored values have turned over.

### Navigation gets bold, and no italic

Nothing under `.nav-font` sets `font-style: italic` — the only `italic` declarations in `css/` are the three in the derived deck theme. `.topbar-title` sets 700 and `css/buttons.css` sets 500; 500 resolves to the 400 face without synthesis, 700 is synthesised today. So the navigation directory gets eight `-700.ttf` files and nothing more. If an italic is ever wanted there, the same convention already covers it.

### The deck theme gets the italics its upstream asked for

`css/reveal-theme-moon.css` declares Lato at 300, 400 and 700, all upright, where upstream's `@import` asked Google for 400, 700 and both italics. `.reveal` sets `font-weight: 300`, so `.reveal em`, a blockquote and `q` resolve to *300 italic*, not 400 italic — which is why `Lato-300italic.ttf` is fetched although 300 is not a weight the page view ever asks for. The header comment that currently documents the gap is rewritten to document that it is closed, and to say what an upgrade of reveal.js has to preserve.

### What the checks assert, and where

Detecting synthesis from inside the page is not reliable — `document.fonts.check()` answers the font-matching question, not the synthesis question, and a synthesised bold and a real one both differ from the regular in advance width. So the assertion is split, and neither half is a measurement of pixels:

- **On disk**, in `test/checks/legibility.js`: every file the naming convention claims exists, and its `OS/2.usWeightClass` and the italic bit of its `fsSelection` agree with what its name says. A `Inter-700.ttf` that is really a 400 upright is caught here, and it is the mistake most likely to be made while fetching 37 files by hand. The header parse is a few dozen lines against the sfnt table directory; no dependency is added for it.
- **On the page**, in the same check, reading the emitted `@font-face` rules the way that file already reads them: every declared family has a 700 face and an italic face, except the typefaces the table records as having none.

`test/checks/deployment-surface.js` names the font files that are addressed only from a stylesheet — today the three Lato files of the deck theme. Lato's italics join that list; the rest are reached through the emitted `@font-face` block and are already walked.

## Risks / Trade-offs

- **A cut fetched from a different upstream release than the regular beside it has different metrics** → the bold of a family drawn against a different regular shifts spacing in a way nothing here would fail on. Mitigation: fetch every cut of a family in one go from that family's own release, and record the version alongside the licence file, so the next person fetching one knows what to match.
- **The repository grows by 12–15 MB, and the Docker image with it** → accepted. `woff2` would cut it to roughly a quarter but changes the scanner, the emitted `format()` and the deployment surface; it is named as out of scope in the proposal and is worth its own change.
- **`LEGACY_FONT_ORDER` is captured from one instance, and a different deployment enumerated its directories differently** → a reader on that other instance is migrated to the wrong name once. Mitigation: the capture is done per deployment where more than one exists; safeLearn and secureLectures build from the same directory contents but not necessarily the same filesystem, so the secureLectures instance is read too.
- **`getFontImports()` grows from 19 emitted faces to 56, which is 56 `@font-face` rules in every page's `<head>`** (the two Lato files the deck theme declares for itself are not among them, then or now) → no measurable cost. A declared face is not fetched until something on the page selects it, so a page that sets no italic never requests one.
- **Three typefaces keep synthesised italics** → visible, and deliberate. The table records it and the spec has a scenario for it, so it is a known state rather than an oversight. If Fira Code's or Oswald's upstream turns out to ship an italic after all, the file drops in and nothing else changes.

## Migration Plan

1. Capture `mainFontsArray` and `navFontsArray` from the running instances, out of the `initFonts(...)` call in the served HTML. This has to happen **before** any file is added to the two directories.
2. Land the code changes — sorting, name-based storage with the captured legacy order, the table, the emission, the fallback chains — with the font set unchanged. At this point every family still has one face and the page renders exactly as before; only the stored preference changes shape.
3. Fetch and land the font files.
4. `npm test`, which is the browser harness against the demo accounts as well as the corpus checks.
5. Sync to secureLectures in the established order: push safeLearn first, then merge and push `public`/`master` there.

Rollback is per step: step 2 reverted alone leaves stored names unread and the numeric values still present, because step 2 writes the name alongside `t` rather than replacing it.

## Open Questions

- Whether Fira Code, Oswald and PT Sans Narrow really have no italic upstream. Current research says none of the three does, but it is settled by looking at the release when the files are fetched, and it changes only which rows carry the exception note.
- Whether OpenDyslexic ships its cuts under names that fit the convention without renaming. It is the one family here whose regular is already shipped under an unusual basename (`OpenDyslexic3-Regular.ttf`), so its cuts become `OpenDyslexic3-Regular-700.ttf` and so on. Ugly, and left ugly: renaming the regular would change the picker's label and is not what this change is for.
