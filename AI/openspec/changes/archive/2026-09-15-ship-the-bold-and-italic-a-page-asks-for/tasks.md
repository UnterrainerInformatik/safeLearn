## 1. Capture what the running instances enumerate, before anything moves

- [x] 1.1 Fetch a rendered page from the safeLearn instance and read `mainFontsArray` / `navFontsArray` out of its `initFonts('…', '…')` call. This is the order today's stored indices are positions in, and it stops being recoverable the moment a file lands in either directory.
- [x] 1.2 Do the same against the secureLectures production instance, and record both. If the two orders differ, the constant is per deployment; if they agree, one constant serves both. Verify by diffing the two captured arrays.

## 2. Teach the scanner the convention, with the font set unchanged

- [x] 2.1 Replace `pickerFontName()` in `obsidian.js` with a parse that returns, for a `.ttf`, the typeface it belongs to plus its weight and style: `Inter.ttf` → 400/normal, `Inter-700.ttf` → 700/normal, `Inter-italic.ttf` → 400/italic, `Inter-700italic.ttf` → 700/italic. A name with a `-<ddd>` suffix and no matching typeface file (`Lato-300.ttf`) stays a cut, as today. Verify by unit-exercising the parse over the current directory listing plus the names from task 4 and confirming exactly the 11 main and 8 nav typefaces come back as picker entries.
- [x] 2.2 Rework both scan sites — `scanFonts()` and the font branch of the general scan — so `mainFonts`/`navFonts` hold, per typeface, the set of cuts found rather than one path. Both sites parse the same filenames today and must keep doing the same thing; verify the two produce identical structures for the same directory.
- [x] 2.3 Sort `mainFontsArray` and `navFontsArray` by typeface name at the end of each scan, so the offered order is the deployment's and not the filesystem's. Verify the picker offers the same order after `touch`-ing and re-adding a file to one of the directories.
- [x] 2.4 Add the typeface table from design.md beside the parse: generic family per typeface, and the note recording which have no italic upstream. Verify every typeface the scan finds has a row and no row lacks a typeface.

## 3. Emit faces, store names, fall back on purpose

- [x] 3.1 Rewrite `getFontImports()` to emit one `@font-face` per cut, all cuts of a typeface sharing one family name and carrying explicit `font-weight` and `font-style` — the regular included. Verify from a rendered page's `<head>` that the emitted block names 19 faces before task 4 and 56 after it, and that `main Inter` appears once per cut rather than once per file under distinct names.
- [x] 3.2 Pass the typeface table to the client through `initFonts(...)` alongside the two arrays. Verify it arrives by reading it off a rendered page.
- [x] 3.3 In `applyAttributes()` in `obsidian-page.js`, write both inline `font-family` declarations with the generic family from the table behind them — `"main EB Garamond", serif`, `"main FiraCode", monospace`, `"nav Inter", sans-serif`. Verify by computing the style of `#markdown-content` and of a `.nav-font` element on a rendered page for a serif, a monospace and a sans choice.
- [x] 3.4 Store the reader's choice by typeface name under new keys beside `t`/`nt`, preferring the name on read and writing it back on the next save. Verify a reader whose stored object has only `t` still gets their font, and that their object carries the name after they change anything.
- [x] 3.5 Add `LEGACY_FONT_ORDER` from task 1 as a literal, used only to turn an old numeric value into a name. Verify each captured index maps to the typeface it denoted on the running instance.
- [x] 3.6 Fall back to the first offered typeface when a stored name matches nothing, which is what the index path does today when the array has shrunk. Verify with a stored name that no longer exists.

## 4. Fetch the cuts

- [x] 4.1 For each of the 11 main typefaces, fetch the cuts from that typeface's own upstream release — the same release as the regular already in the directory — unsubsetted, and record the version beside the licence file. Verify each family's regular from upstream is byte-comparable in metrics to the one already shipped; a regular that differs means the wrong release was taken.
- [x] 4.2 Land in `assets/main-fonts/`: `EB Garamond-700/-italic/-700italic`, `FiraCode-700`, `Inter-700/-italic/-700italic`, `Lato-italic/-700italic`, `Montserrat-700/-italic/-700italic`, `NotoSans-700/-italic/-700italic`, `NotoSans Condensed-700/-italic/-700italic`, `Open Sans-700/-italic/-700italic`, `OpenDyslexic3-Regular-700/-italic/-700italic`, `Oswald-700`, `Ubuntu Mono-700/-italic/-700italic` — 28 files. Verify the count and that no filename gained or lost a space relative to the regular beside it.
- [x] 4.3 Land `Lato-300italic.ttf` in `assets/main-fonts/` for the deck theme, whose `em`, `q` and blockquote resolve at weight 300, not 400.
- [x] 4.4 Land the eight `-700.ttf` files in `assets/nav-fonts/`: `FiraCode`, `Inter`, `Lato`, `NotoSans`, `NotoSans Condensed`, `OpenDyslexic3-Regular`, `Oswald`, `PT Sans Narrow`. Seven are copies of files from 4.2 — verify they are byte-identical to their `main-fonts/` counterparts, as the regulars already are.
- [x] 4.5 Settle the three open italic questions against the upstream releases — Fira Code, Oswald, PT Sans Narrow — and either fetch the italic or record the exception in the table from 2.4. Verify the table's exception rows and the files on disk agree.
- [x] 4.6 Add the per-family licence files, as `Lato-OFL.txt` already sits there. Verify every family that gained a file has its licence beside it.

## 5. Let the deck have its italics

- [x] 5.1 Add `@font-face` blocks to `css/reveal-theme-moon.css` for Lato italic at 300, 400 and 700, matching the three upright blocks already there.
- [x] 5.2 Rewrite the header comment so it records that the gap is closed rather than that it exists, and says what a reveal.js upgrade has to carry over. Verify by reading it against the file as it now stands.
- [x] 5.3 Open a deck and confirm an emphasised word, a blockquote and a `q` render from the shipped italic rather than a slant.

## 6. Guard it

- [x] 6.1 Extend `test/checks/legibility.js` with an on-disk check: every file the convention claims is present, and its `OS/2.usWeightClass` and the italic bit of `fsSelection` agree with what its name says. Parse the sfnt table directory directly; add no dependency. Verify it fails when a file is renamed to claim a cut it is not.
- [x] 6.2 Add the page-level half, reading the emitted `@font-face` rules the way that file already reads them: every declared family has a 700 face and an italic face, except the typefaces the table records as having none. Verify it fails when a cut is removed from a directory.
- [x] 6.3 Widen the existing fallback-chain assertion past `css/` to the two inline declarations `applyAttributes()` writes, which it cannot reach today. Verify it fails when either is written without its generic.
- [x] 6.4 Add the Lato italics to the stylesheet-only font references in `test/checks/deployment-surface.js`, beside the three upright Lato files already listed.
- [x] 6.5 Update `test/coverage-map.json` for what the legibility check now guards, including the two font directories.
- [x] 6.6 Run `npm test` and confirm the suite passes, `test/coverage.test.js` included.

## 7. Write it down

- [x] 7.1 Rewrite the "Naming a font in a stylesheet" section of `docs-development.md`: the filename convention, one family per typeface with its cuts as faces, the typeface table and what belongs in it, and that a declaration naming a shipped family carries that typeface's generic behind it rather than a blanket `sans-serif`.
- [x] 7.2 Record in the same place that a reader's font choice is stored by name, and what `LEGACY_FONT_ORDER` is for, so it is recognisable as removable once stored values have turned over.
- [x] 7.3 Update the font pipeline description in `AI/architecture.md`.

## 8. Ship it

- [x] 8.1 Verify in a browser, in both themes: a heading, a bold run, an italic run, a bold-italic run, and one of the typefaces that keeps its synthesised italic — so the exception is seen rather than assumed.
- [x] 8.2 Confirm a reader with an existing stored preference still reads in the font they chose, against a real account rather than a fresh one.
- [x] 8.3 Sync to secureLectures in the established order: push safeLearn, then merge and push `public`/`master` there.
