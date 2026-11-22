## Context

See proposal.md for why. Current state that shapes the approach:

- `utils.js` `hasRoles` takes every `#`-prefixed entry out of the role test and then resolves exactly `exam`, `practice` and `answer` in a `switch`. An unknown name falls through the `switch` and leaves `clientAccess` untouched, so it restricts nobody. Today that is harmless; after a rename without aliases it would turn every leftover `#exam` into "visible to everyone".
- A handout rendering fixes the views per request through `req[handoutViews] = { exam, answer }` (`permission-context.js`), set in `app.js` and `exam/handout.js`, read only by `hasRoles`.
- `exam/handout.js` `hasSolution` decides the solution button by looking for blocks whose directive names `#exam` or `#answer`, via the shared block grammar.
- The reader menu (`obsidian.js`) renders two flipswitches: `answersFs` (everyone, labels `app.switch.answers`/`noAnswers`) and `examFs` (teachers only, labels `app.switch.showExam`/`showPractice`), driven by `toggleViewAnswer`/`toggleViewExam` in `obsidian-page.js`, which write the Keycloak-backed preferences `va`/`ve`.
- The plugin mirrors the three names in `VIEW_SWITCHES` (`AI/plugin/main.ts`) and marks a `#` entry outside that list as "resolves to nothing".
- secureLectures content lives in the Nextcloud share at `/mnt/data/nextcloud/secureLectures/` (353 Markdown files). Counted 2026-11-22: 91 files carry directive markers — 138 `#exam`, 82 `#practice`, 80 `#answer` on marker lines, plus two `` `@@@ #exam` `` mentions in running text (the two variants of a POSE3 test handout) and one bare `` `#answer` `` in prose (`test-search-views.md`, a copy of the test page). No other `#` entry occurs, so fail-closed (D1) changes nothing for current content beyond the rename.

## Goals / Non-Goals

**Goals:**
- One set of names in server, plugin, docs, tests and both instances' content, with no transition period in which both are accepted.
- No state in which a leftover or mistyped marker shows content to more readers than intended.
- A migration that can be run, dry and for real, wherever the content happens to be mounted.

**Non-Goals:**
- Changing the preference attributes `ve`/`va` or the cookie/config format that carries them.
- Fixing the silent overwrite between several `#` markers in one fence (separate proposal).
- `#optional-private` or any other new marker.

## Decisions

### D1: Unknown view markers fail closed, for everyone

`hasRoles` resolves the three known names; any other `#` entry sets the result to `false` and ends the decision. That includes admins, who otherwise short-circuit to `true` before the view loop: an admin is not meant to read through a broken directive any more than a student is, and the known markers already override the admin short-circuit today (an admin with `ve` off does not see `#exam`).

*Alternatives:* (a) keep "restricts nobody" and rely on the corpus check. Rejected: secureLectures content is outside the test suite, so a leftover `#exam` there would leak the exam variant to every student. (b) Accept the old names as aliases for a while. Rejected by decision of 2026-11-22: only two instances, both migrated together. (c) Deny everyone except admins, so an admin can still find broken blocks. Rejected: the plugin already shows the error while writing, and a rule with no exceptions is the one that cannot be argued into a leak.

Fail-closed also makes the deployment order safe: a server that is ahead of its content hides old-named blocks instead of showing them.

### D2: Names compared case-insensitively, as today

Entries are already lower-cased by `normalizeRole` before the `switch`. The known set is `variant-private`, `variant-public`, `optional`; the hyphen is part of the name. No other normalisation (no `_`/space variants).

### D3: Internal names follow the markers

The handout flags become `req[handoutViews] = { variantPrivate, optional }`; `toggleViewExam`/`toggleViewAnswer` become `toggleViewVariant`/`toggleViewOptional`, the element ids `examFs`/`answersFs` become `variantFs`/`optionalCb`. The preference keys `ve`/`va` keep their names (Keycloak attributes, stored per user) and get a comment saying which marker each drives. Keeping the old internal names would preserve exactly the confusion this change removes, for the next person reading `hasRoles`.

### D4: Reader menu — a two-position switch and a checkbox

The variant control stays a flipswitch, shown to teachers only, with the two positions labelled by audience: on = `app.switch.variantPrivate` ("private Variante" / "private variant"), off = `app.switch.variantPublic` ("öffentliche Variante" / "public variant"). The optional control becomes a checkbox in the style of "remember last page", labelled `app.menu.showOptional` ("Optionale Blöcke zeigen" / "show optional blocks"), shown to everyone as the answers switch is today. The keys `app.switch.answers`, `noAnswers`, `showExam`, `showPractice` are removed from both i18n files (BabelEdit format, same keys in each).

### D5: A corpus check for unknown markers

A new check in the content-verification suite walks `md/` with `resolveInlineBlocks` (the one block grammar, so code fences and running-text mentions are excluded for free) plus each file's whole-file directive, and fails per unknown `#` entry with file, line and marker. It runs offline (no login), so it is cheap and does not depend on the Keycloak demo realm.

### D6: A migration tool instead of hand edits

`tools/rename-view-markers.mjs <dir> [--write]` walks every `.md` under `<dir>` and rewrites the three old names to the new ones wherever they stand in a directive entry after `@@@` on the same line: marker lines, and `@@@ #exam`-style mentions in running text or inline code, so teacher notes that explain the syntax stay correct. It does **not** touch a bare `#exam` without a preceding `@@@` on that line, because in Obsidian that is a tag. Default is a dry run that prints per-file counts and a total per old name; `--write` applies. Afterwards it lists every remaining occurrence of the old names anywhere (tags, prose), so they can be judged by hand. Written so it runs with plain Node and no dependencies beyond the repo, against any directory, not only `md/`.

*Alternative:* `sed` one-liner in the task list. Rejected: it cannot tell a directive from a tag, and it gives no count to compare before and after.

### D7: Plugin marks unknown switches as an error

`VIEW_SWITCHES` becomes `["variant-private", "variant-public", "optional"]`. The existing "resolves to nothing" marking is restyled and retitled as an error ("hides this block from everyone"), since that is now what the server does. Highlighting for the three known switches stays as is.

## Risks / Trade-offs

- [secureLectures content is migrated late or incompletely] → fail-closed (D1) turns that into missing content, not a leak; the tool's remaining-occurrences list and a post-merge look at a page with variants catch it. Sequence in the migration plan puts the content rewrite before the deploy.
- [A teacher's own vault, outside both instances, still uses old names] → content is hidden until renamed; the plugin flags each line as an error. Communicated in the release notes of the plugin.
- [Old plugin versions keep marking the new names as "resolves to nothing"] → cosmetic only; release the plugin together with the server change.
- [Fail-closed hides content an admin needs to see to debug] → the plugin and the corpus check point at the line; the raw file is still readable in the vault.
- [Search and attachment checks reuse `hasRoles`] → they inherit fail-closed automatically; an attachment referenced only inside an unknown-marker block stops being served, which is the intended direction.

## Migration Plan

1. Implement server, tests, docs and safeLearn `md/` in one commit; run the migration tool on `md/` (dry, then `--write`) and the targeted tests, then the full suite once.
2. Plugin: update `main.ts`, release (per the usual release procedure).
3. Run `tools/rename-view-markers.mjs /mnt/data/nextcloud/secureLectures` (dry run), note the counts, run with `--write`, re-run without it to confirm zero old directive names, check the remaining-occurrences list by hand.
4. Push safeLearn, merge into secureLectures and push (content and code reach production together; secureLectures' content is picked up from the share).
5. Rollback: the tool has no reverse mode. Revert the commit, and the content via the safeLearn git history and Nextcloud's file versions. Only the new code fails closed: the old server reading new content treats `#variant-*` as restricting nobody and would show the private variant to everyone. A rollback must therefore revert the content together with the server, or not happen.

## Open Questions

- Exact German wording of the two switch positions and the checkbox; can be adjusted in BabelEdit without touching specs.
