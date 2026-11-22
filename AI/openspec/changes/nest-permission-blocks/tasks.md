## 0. Prerequisites

- [ ] 0.1 `fail-closed-fence-entries` is applied and archived
- [ ] 0.2 Re-run the nesting/unclosed scan over `md/` and `/mnt/data/nextcloud/secureLectures`; confirm EN `MOB 01`, EN `EAR 03` and `archive/24-25 - 5CHIF - WS.md` are fixed

## 1. Grammar

- [ ] 1.1 `resolveInlineBlocks`: stack, `depth`, `parent`, sorted by `start`, all open blocks run to the end; drop `innerDirectives` (design D1); update the doc comment
- [ ] 1.2 Shared grammar table: rows for two and three levels, inner unclosed, outer unclosed, closer in code within a nested block; update the "opener inside an open block" row
- [ ] 1.3 `test/block-grammar.test.js` follows

## 2. Decision and consumers

- [ ] 2.1 `filterForbiddenSegments`: per-block verdicts, then top-down `shown` (D2); remove the `innerDirectives` cuts
- [ ] 2.2 Attachment check and corpus search use `shown`
- [ ] 2.3 Corpus index shape: carry `depth`/`parent`; `extractInlinePermissionBlocks` and its readers
- [ ] 2.4 `exam/handout.js` `hasSolution` and the module's marker check walk every level (D3)
- [ ] 2.5 Unit tests for every scenario of the `role-resolution` and `permission-block-grammar` deltas

## 3. Corpus and checks

- [ ] 3.1 Test corpus page in `md/` with a class block holding a nested person block and a nested `#optional` block; live browser checks for the person, another class member and an outsider
- [ ] 3.2 Content check: no unclosed inline block in `md/` (D5)
- [ ] 3.3 Run the affected checks, then the full `npm test` once

## 4. Plugin

- [ ] 4.1 `AI/plugin/main.ts`: stack parser, frame per block, alternating shade by `depth % 2`, yellow open marking to the end (D4)
- [ ] 4.2 Plugin tests; run `test:obsidian` (with `SAFELEARN_OBSIDIAN_APP` and `AI/plugin` on origin/master)
- [ ] 4.3 Plugin release

## 5. Docs and rollout

- [ ] 5.1 `docs-permissions.md` "Where a block begins and ends": nesting, AND across levels, the forgotten-closer consequence; `AI/architecture.md`
- [ ] 5.2 Commit, push, merge into secureLectures and push; confirm the deploy run started for HEAD
