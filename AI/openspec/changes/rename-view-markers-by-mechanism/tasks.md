## 1. Migration tool

- [x] 1.1 Write `tools/rename-view-markers.mjs <dir> [--write]`: rewrite `#exam`→`#variant-private`, `#practice`→`#variant-public`, `#answer`→`#optional` only in directive entries that follow `@@@` on the same line (marker lines and `@@@ …` mentions in running text or inline code); leave bare `#exam` tags alone (design D6)
- [x] 1.2 Dry run by default: per-file counts and a total per old name; `--write` applies; after either, list every remaining occurrence of the old names with file and line
- [x] 1.3 Unit test for the tool: marker line, indented marker, marker in a fence, inline-code mention, bare tag, mixed directive `@@@ 4ahif #exam`, case variants

## 2. Server

- [x] 2.1 `utils.js` `hasRoles`: resolve `variant-private`, `variant-public`, `optional`; any other `#` entry sets the result to `false` for every session, admin included, and ends the decision (design D1, `role-resolution` "The view markers are exactly three and carry no aliases"); update the comments
- [x] 2.2 `permission-context.js`: handout flags become `{ variantPrivate, optional }`; document which of `ve`/`va` drives which marker
- [x] 2.3 `app.js`, `exam/handout.js`, `exam/routes-handout.js`: set the renamed handout flags
- [x] 2.4 `exam/handout.js` `hasSolution`: look for `#variant-private` or `#optional`; update its comment
- [x] 2.5 `obsidian.js` reader menu: variant flipswitch (`variantFs`, teachers only) with labels `app.switch.variantPrivate`/`variantPublic`; optional checkbox (`optionalCb`, everyone) labelled `app.menu.showOptional`; update the comments mentioning `@@@ #exam` (design D4)
- [x] 2.6 `obsidian-page.js`: rename `toggleViewExam`/`toggleViewAnswer` to `toggleViewVariant`/`toggleViewOptional`, adapt the element lookups and the checkbox's checked state
- [x] 2.7 `i18n/de.json`, `i18n/en.json`: add `app.switch.variantPrivate`, `app.switch.variantPublic`, `app.menu.showOptional`; remove `app.switch.answers`, `noAnswers`, `showExam`, `showPractice`; same keys in both files

## 3. Content and tests

- [x] 3.1 Run the tool on `md/` (dry, then `--write`); review `md/test-search-views.md` prose by hand
- [x] 3.2 Rename markers and helper names in `test/directive-grammar.test.js`, `test/block-grammar.test.js`, `test/permission-context.test.js`, `test/exam-offline.test.js`, `test/attachments.test.js`, `test/anonymous.test.js`, `test/checks/search.js`, `test/checks/views.js`, `test/obsidian-syntax.test.js`, `test/coverage-map.json`, `tools/obsidian-screenshots.mjs`
- [x] 3.3 Add tests for fail-closed: retired name for student/teacher with `ve`/admin, misspelled marker, unknown marker beside a role, unknown marker as whole-file directive, mixed case of a known marker, retired name on a solution page
- [x] 3.4 Add the corpus check "no unknown view marker" (design D5, `content-verification`), including its two scenarios
- [x] 3.5 Run the affected checks, fix, then the full `npm test` once

## 4. Docs

- [x] 4.1 `docs-permissions.md`: new names, the mechanism-then-audience rule, the old→new table, fail-closed for unknown markers
- [x] 4.2 `docs-exam-module.md`, `docs-testing.md`: new names
- [x] 4.3 `AI/architecture.md`: new names, the fail-closed rule, the migration tool, the plugin mirror of the names

## 5. Plugin

- [x] 5.1 `AI/plugin/main.ts`: `VIEW_SWITCHES = ["variant-private", "variant-public", "optional"]`; unknown switch marked as an error that hides the block from everyone (design D7, `plugin-editor-decorations`); update comments
- [x] 5.2 `test/obsidian/plugin.test.js`: new names, retired name marked as the error; run `test:obsidian` (with `SAFELEARN_OBSIDIAN_APP` and `AI/plugin` on origin/master)
- [x] 5.3 Release the plugin (version in three places, push, tag, GitHub release with `main.js`, `manifest.json`, `styles.css`), noting the breaking rename in the release text

## 6. secureLectures content

- [x] 6.1 Dry run of the tool on `/mnt/data/nextcloud/secureLectures`; expect 91 files, 140 `#exam` (138 marker lines + 2 running-text mentions), 82 `#practice`, 80 `#answer` (baseline of 2026-11-22; differences mean the content changed since)
- [x] 6.2 Run with `--write`, re-run dry to confirm zero old directive names; the remaining-occurrences list should hold only the prose `` `#answer` `` in `test-search-views.md`, fix that by hand
- [ ] 6.3 After pushing safeLearn and merging into secureLectures, open a page with variants on secureLectures as teacher (both switch positions) and as student, and confirm the deploy run started for HEAD

## 7. Wrap-up

- [ ] 7.1 Remove the entry "View-Marker nach Mechanismus benennen" from `AI/open-proposals.md` when archiving; leave the related "Fences verschachteln oder kombinieren" entry in place
