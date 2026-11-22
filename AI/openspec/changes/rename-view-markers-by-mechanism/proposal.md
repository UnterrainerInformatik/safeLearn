Source: AI/open-proposals.md — "View-Marker nach Mechanismus benennen"

## Why

The view markers `#exam`, `#practice` and `#answer` are named after their *content*, so their behaviour cannot be read off the name. That has already caused a leak-shaped mistake: a colleague put an offline test handout's real solutions into `#answer` blocks because they are answers. On the handout and on the solution page that behaves exactly like `#exam`, but as soon as the file becomes readable to the class, every student can switch the solutions on. The correct marker today would have been `#exam`. Renaming the markers after their mechanism first and their audience second (decided 2026-11-22) makes that mistake visible at the point of writing.

## What Changes

- **BREAKING** `#exam` becomes `#variant-private`: one side of an either-or, shown only to teachers and admins with the variant view on (`ve`), never to a student; hidden on a handout, shown on its solution page.
- **BREAKING** `#practice` becomes `#variant-public`: the other side of that either-or. Every session sees exactly one of the two variants.
- **BREAKING** `#answer` becomes `#optional`: a block any reader can show or hide (`va`), not a switch between two versions.
- **No aliases.** The old names stop working on the day the new ones start. The only other instance (secureLectures) is migrated in the same step.
- **BREAKING** A view marker the server does not know (an old name left behind, a typo such as `#variant-privat`) now hides the block from everyone instead of restricting nobody. Without this, every `#exam` that survives the migration would show the exam variant to every student. Fail-closed is the only safe default for a rename without aliases.
- The corpus verification suite gains a check that no directive in `md/` names an unknown view marker.
- A one-off migration tool rewrites the markers in a content directory (dry run by default), so the secureLectures content in the Nextcloud share (`/mnt/data/nextcloud/secureLectures`, 300 markers in 91 files) can be converted and the remaining mentions counted.
- Reader menu: the variant switch keeps its two positions but is labelled by audience (private / public variant); the answer flipswitch becomes a checkbox "show optional blocks". The Keycloak attributes `ve`/`va` stay as they are.
- Obsidian plugin: highlighting and the "resolves to nothing" marking follow the new names and the new fail-closed meaning; a new plugin release follows.
- The exam module's solution-button check looks for `#variant-private` or `#optional`.
- Docs (`docs-permissions.md`, `docs-exam-module.md`, `docs-testing.md`), `AI/architecture.md`, the test corpus `md/test-*.md` and all tests move to the new names.

Out of scope: a teacher-only revealable block (`#optional-private`), and the silent overwrite when several view markers share one fence (proposal "Fences verschachteln oder kombinieren"). The rename does not change that behaviour.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `role-resolution`: the exam/practice/answer requirements are restated for `#variant-private`/`#variant-public`/`#optional`; a new requirement makes an unknown view marker hide its block from every session.
- `exam-handout`: the handout, attachment and solution-button requirements name the new markers.
- `permission-block-grammar`: the scenarios that use `#exam` as their example marker use `#variant-private`; the "every reader uses the one grammar" requirement names the solution check's new markers.
- `plugin-editor-decorations`: the view-switch requirement lists the new names, and an unknown switch is marked as hiding the block from everyone rather than as restricting nobody; scenarios use the new names.
- `content-verification`: the view pseudo-role requirement names the new markers; a new requirement checks the corpus for unknown view markers.
- `attachment-access`: the handout scenario names `#variant-private`.
- `anonymous-publishing`: the reader-roles requirement and its scenario name the variant gate and `#variant-private`.

## Impact

- Server: `utils.js` (`hasRoles`), `permission-context.js` (handout view flags), `app.js`, `exam/handout.js`, `exam/routes-handout.js`, `obsidian.js` (reader menu, comments), `obsidian-page.js` (toggle functions), `i18n/de.json`, `i18n/en.json`.
- Tooling: new `tools/rename-view-markers.mjs`; `tools/obsidian-screenshots.mjs`.
- Tests: `test/directive-grammar.test.js`, `test/block-grammar.test.js`, `test/permission-context.test.js`, `test/exam-offline.test.js`, `test/attachments.test.js`, `test/anonymous.test.js`, `test/checks/search.js`, `test/checks/views.js`, `test/obsidian/plugin.test.js`, `test/obsidian-syntax.test.js`, `test/coverage-map.json`, plus the new unknown-marker corpus check.
- Content: `md/test-attachments.md`, `md/test-exam-handout.md`, `md/test-exam-practice-question.md`, `md/test-search-views.md`; secureLectures content in `/mnt/data/nextcloud/secureLectures` (91 files).
- Plugin: `AI/plugin/main.ts` (switch names, error marking), then a release.
- Deployment: server and content must change together. Thanks to fail-closed, a server that is ahead of its content hides the old-named blocks rather than leaking them.
