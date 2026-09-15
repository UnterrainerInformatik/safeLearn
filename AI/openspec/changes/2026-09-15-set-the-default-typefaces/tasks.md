## 1. Nominate the two typefaces

- [x] 1.1 Add the nomination to `obsidian.js` beside the `typefaces` table — main `Open Sans`, nav `Inter` — as named constants, and verify by reading the rendered page source that nothing else in the file still derives a default from an array position.
- [x] 1.2 Carry the nomination to the page through `initFonts()`, alongside the existing `typefaceTable` argument, and verify in the browser console that the page receives both names.
- [x] 1.3 Give `chosenTypeface()` in `obsidian-page.js` the nominated name as its last resort, keeping `offered[0]` behind it for a nomination the deployment does not ship, and verify a reader whose stored choice names a deleted font lands on the nominated face rather than on EB Garamond.
- [x] 1.4 Remove the `?? 2` and `?? 1` defaults from `init()` so `t`/`nt` are read only when genuinely stored, and verify that a session with no `config` attribute renders prose in Open Sans and the chrome in Inter.
- [x] 1.5 Point the two icon buttons in `getTopdownMenu()` (`obsidian.js:2233`, `obsidian.js:2241`) at the nominated names instead of `4` and `0`, and verify that clicking each stores a typeface name in `ntf`/`tf` and that the picker beside it moves to that entry.

## 2. Guard it

- [x] 2.1 Add a check to `test/checks/legibility.js` that a reader with no stored preference is served the nominated pair, and verify it fails against the pre-change behaviour (Inter for prose).
- [x] 2.2 Add a check that each nominated typeface is offered by the directory it is nominated for — Open Sans in `main-fonts`, Inter in `nav-fonts` — and verify it fails when the nomination names a font that is not shipped.
- [x] 2.3 Add a check that a stored preference recorded as a string rather than a number still resolves to the typeface it denotes, or is deliberately ignored, and verify it reproduces what the 20 string-typed accounts see today.
- [x] 2.4 Update `test/coverage-map.json` for what the legibility check now guards, and verify `npm test` reports the new checks as covered.
- [ ] 2.5 Run `npm test` in full and verify the browser harness and the corpus checks both pass.

## 3. Say so in the documentation

- [x] 3.1 Update the font section of `docs-development.md` to describe the nomination and the resolution order, replacing what it says about a stored choice falling to the first offered font, and verify by reading it that no numeric default is described any more.
- [x] 3.2 Update the preferences row of `AI/architecture.md`, and verify it names the nominated pair rather than an index.

## 4. Prepare the reset

- [ ] 4.1 Write `babylon5_reset_config.py` beside the existing realm scripts on babylon5 — reads account ids from a census, fetches each carrying `config`, writes the old value to a `chmod 600` snapshot, then `PUT`s the representation back with `config` removed and everything else including `lastVisitedUrl` intact. Verify it runs end to end in `--dry-run`, reporting counts only.
- [ ] 4.2 Write the reverse mode that replays a snapshot, and verify in `--dry-run` that it reconstructs each recorded value.
The `safeLearn` demo realm on `auth.unterrainer.info` is out of scope and is not censused, reset or otherwise touched.

## 5. Run the reset

- [ ] 5.1 Take a fresh census of `unterrainer` and verify the count of accounts carrying `config` against the 77 recorded on 2026-09-13, so the reset acts on what is there now rather than on a three-day-old picture.
- [ ] 5.2 Run the snapshot and verify the file holds one entry per account carrying `config`, reporting the count only.
- [ ] 5.3 Rehearse against a single account — Gerald's own — and verify by signing in that the page comes up in Open Sans and Inter with the menu at its defaults.
- [ ] 5.4 Run the reset across `unterrainer` and verify by re-censusing that no account carries `config` and that the `lastVisitedUrl` count is unchanged at 175.
- [ ] 5.5 Run `npm test` after the reset and verify the browser harness still signs in and that no check depended on a stored preference.

## 6. Give the role back

- [ ] 6.1 Revoke `manage-users` from the bot on `unterrainer` using the existing `revoke_admin_roles.py`, and verify by decoding a fresh token that `realm-management` carries only the nine view/query roles it held before.
- [ ] 6.2 Record in the change where the snapshots live on babylon5 and that they hold preference data, so they are deleted deliberately rather than forgotten.
