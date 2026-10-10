## Why

This deployment has never said out loud what a page is set in before a reader chooses anything. The default lives in `init()` as two numbers — `t: a.t ?? 2` and `nt: a.nt ?? 1` — read through `LEGACY_FONT_ORDER`, the directory order captured on the day the picker stopped storing positions. Both happen to land on Inter. A reader who has never opened the font picker therefore reads prose in a typeface nobody chose for prose; it is where index 2 of a `fs.readdirSync()` listing pointed in September 2026, and nothing more.

Inter is a user-interface face: tight spacing, large x-height, drawn to be legible in a label rather than across a paragraph. It is the right choice for the bar, the navigation column and the menu, and it stays there. For the body of a corpus page the deployment should ask for Open Sans, which is drawn for running text and already ships in `assets/main-fonts/`. The nominated pair is nav Inter, main Open Sans — deliberately stated, rather than arrived at through an array index.

Stating it exposes what the indirection has been hiding. `chosenTypeface()` falls, when nothing else matches, to `offered[0]` — today "EB Garamond" for the main font and "FiraCode" for the navigation, both of them alphabetical accidents rather than decisions, and neither of them a face anyone would nominate for a page of prose or a navigation column. And of the 77 accounts in the `unterrainer` realm that carry a `config` attribute, 20 stored their choice as a **string** (`"7"`, `"2"`) rather than a number. `chosenTypeface()` guards the legacy path with `Number.isInteger(index)`, which is false for a string, so those 20 readers fall straight past their own stored choice to `offered[0]`. They have been reading in EB Garamond for some time without having asked for it.

The two icon buttons beside the pickers are broken by the same history. `obsidian.js:2233` and `obsidian.js:2241` still call `navFontChange(4)` and `mainFontChange(0)` with raw positions, from when a position was what a preference was. Since the picker began storing names, clicking either writes a number into `tf` or `ntf`, where every other writer puts a typeface name. They are the affordance a reader reaches for to get back to the deployment's font, and they are the one control that cannot express it.

## What Changes

- **The deployment names its two default typefaces.** One place says main "Open Sans" and navigation "Inter", by name, beside the table that already says what each shipped typeface is. Nothing derives a default from an array position or from a directory listing any more.

- **`chosenTypeface()` falls to that default rather than to `offered[0]`.** The last resort stops being whatever sorts first and becomes what the deployment nominated; `offered[0]` remains behind it for the one case the nominated face is not in the directory it belongs to, so a page is never set in nothing.

- **The numeric defaults go.** `t: a.t ?? 2` and `nt: a.nt ?? 1` become `t: a.t` and `nt: a.nt`. They are not tidying: while they stand, a reader with no stored preference arrives carrying index 2 and index 1, `LEGACY_FONT_ORDER` resolves both to Inter, and the named default is never reached. The legacy path itself stays for a reader who still carries a genuine stored number.

- **The two icon buttons ask for the default by name.** `mainFontChange` and `navFontChange` are called with the nominated typeface instead of `0` and `4`, so the control that means "put this back" writes what every other writer writes.

- **Every stored preference in the production realm is cleared.** A one-off operational reset removes the whole `config` user attribute from each of the 77 accounts in `unterrainer` that carry one, so every reader starts from the nominated pair. The `safeLearn` demo realm on `auth.unterrainer.info` is deliberately left alone: its accounts are shared fixtures the browser harness signs in as, and whatever they carry is the harness's business rather than a reader's. This is the reset as asked for: font size, line spacing, dark mode, start-with-last-page and the three visibility toggles go with it, not only the font keys. `lastVisitedUrl` is a separate attribute and is not touched.

**BREAKING for readers, by intent.** Everyone who had set a preference loses it. That is the point of the reset rather than a cost of it, and it is worth saying plainly: 77 people in the production realm will find their dark mode off and their text back at 18px the next time they open a page.

The reset also settles the string-typed stored values and makes `LEGACY_FONT_ORDER` dead for every account that exists today — it is kept anyway, because it costs nothing and is what a reader created between this change and the reset would still be read through.

## Capabilities

### New Capabilities

None. This is `reading-legibility`'s ground.

### Modified Capabilities

- `reading-legibility`: a new requirement that the deployment nominates the typeface a page and its chrome are set in before a reader has chosen, by name rather than by position. The existing requirement "A reader's chosen font keeps its meaning when the shipped set changes" is modified: its scenario "A reader's stored choice names a font that is gone" resolves today to "the deployment's first offered font", which becomes the nominated default, with the first offered font behind it.

## Impact

- `obsidian.js` — the typeface table gains the two nominations; `getTopdownMenu()`'s two icon `onclick` handlers.
- `obsidian-page.js` — `chosenTypeface()`'s last resort, the `t`/`nt` defaults in `init()`, and whatever carries the nominated names to the page beside `typefaceTable`.
- `test/checks/legibility.js` — nothing asserts today what an unconfigured reader is served; the string-typed legacy value is unguarded too.
- `test/coverage-map.json` — what the legibility check now guards.
- `docs-development.md` — the section describing how a reader's font choice is stored and read.
- `AI/architecture.md` — the preferences row.
- **Operational, outside the repository:** the `config` attribute of every account carrying one in `unterrainer` (auth.htl-leonding.ac.at). Needs admin-API access with `manage-users`, which the bot account did not hold and has now been granted temporarily; nothing else about its access is raised. The `safeLearn` demo realm is out of scope.

Not in scope: removing `LEGACY_FONT_ORDER` and the `t`/`nt` keys, which the reset makes dead for every account that exists today but which is its own change, and worth making once the reset has been seen to hold. Also not in scope: letting a deployment configure its nominated pair from the environment — this change nominates them in source, where the typeface table already is.
