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
- [x] 2.5 Run `npm test` in full and verify the browser harness and the corpus checks both pass. (2026-10-10: 233/239; the legibility checks, the browser harness and the corpus all pass. The six failures are all in `directory-search` and come from the local directory-service credentials answering `invalid_client`, which is unrelated to this change.)

## 3. Say so in the documentation

- [x] 3.1 Update the font section of `docs-development.md` to describe the nomination and the resolution order, replacing what it says about a stored choice falling to the first offered font, and verify by reading it that no numeric default is described any more.
- [x] 3.2 Update the preferences row of `AI/architecture.md`, and verify it names the nominated pair rather than an index.

## 4. Prepare the reset

- [x] 4.1 Write `babylon5_reset_config.py` beside the existing realm scripts on babylon5 — reads account ids from a census, fetches each carrying `config`, writes the old value to a `chmod 600` snapshot, then `PUT`s the representation back with `config` removed and everything else including `lastVisitedUrl` intact. Verify it runs end to end in `--dry-run`, reporting counts only.
- [x] 4.2 Write the reverse mode that replays a snapshot, and verify in `--dry-run` that it reconstructs each recorded value.
The `safeLearn` demo realm on `auth.unterrainer.info` is out of scope and is not censused, reset or otherwise touched.

## 5. Run the reset

- [x] 5.1 Take a fresh census of `unterrainer` and verify the count of accounts carrying `config` against the 77 recorded on 2026-09-13, so the reset acts on what is there now rather than on a three-day-old picture. (2026-10-10: the count is now 109; `lastVisitedUrl` is on 268 accounts rather than 175. The census reads the ids recorded on 2026-09-13. Accounts imported since then are left out, which is fine: Gerald confirms they have never signed in and so carry no preferences.)
- [x] 5.2 Run the snapshot and verify the file holds one entry per account carrying `config`, reporting the count only. (2026-10-10: `config_snapshot_20261010.jsonl` holds 109 entries, mode 600. It supersedes the 77-entry `config_snapshot_20260915.jsonl`, which can no longer serve as a rollback.)
- [x] 5.3 Rehearse against a single account — Gerald's own — and verify by signing in that the page comes up in Open Sans and Inter with the menu at its defaults. (2026-10-10: confirmed by Gerald. The view also reset from teacher to student, which is expected because that toggle lives in `config` too. `lastVisitedUrl` survived.)
- [x] 5.4 Run the reset across `unterrainer` and verify by re-censusing that no account carries `config` and that the `lastVisitedUrl` count is unchanged (175 on 2026-09-13, 268 in the census of 2026-10-10; 268 is the figure to check). (2026-10-10: 109/109 removed; the re-census counts 0 carrying `config` and 268 carrying `lastVisitedUrl`.)
- [x] 5.5 Run `npm test` after the reset and verify the browser harness still signs in and that no check depended on a stored preference. (2026-10-10: 233/239, identical to the run before the reset; the same six `directory-search` failures caused by the local credentials.)

## 6. Give the role back

- [x] 6.1 Revoke `manage-users` from the bot on `unterrainer` using the existing `revoke_admin_roles.py`, and verify by decoding a fresh token that `realm-management` carries only the nine view/query roles it held before. (2026-10-10: the bot is a user rather than a service account, so its id was passed with `--sa-user-id`. Six direct mappings remain, and a fresh token carries nine roles: `query-clients`, `query-groups` and `query-users` arrive as composites of the `view-*` roles.)
- [x] 6.2 Record in the change where the snapshots live on babylon5 and that they hold preference data, so they are deleted deliberately rather than forgotten. (Recorded below.)

## Snapshots left on babylon5

Both files are in `~/scripts/realm-directory-cleanup/` on babylon5, mode 600. Each holds one line per account (`id`, `username`, `config`), so they are personal preference data from the `unterrainer` realm. Delete them deliberately once the rollback window is no longer needed. They are not temporary files that can be left lying around.

- `config_snapshot_20261010.jsonl`: 109 accounts. This is the rollback for the reset that actually ran: `babylon5_reset_config.py restore --snapshot config_snapshot_20261010.jsonl [--only <username>] --write`.
- `config_snapshot_20260915.jsonl`: 77 accounts. It is stale and was never used for a reset, so it can be deleted now.
