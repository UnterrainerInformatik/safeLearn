## 1. Classification and planning (pure functions)

- [x] 1.1 Create `tools/test-run.mjs` with exported `classify(root)` → `{ unit, browser }` (a file goes to browser if it imports `./harness.js`) and verify by hand that `smoke`, `content`, `exam` and `anonymous` land in browser and all others in unit
- [x] 1.2 Add exported `plan(changedPaths, map)` implementing the five planning rules from design.md (module selects itself only, `content.test.js` whole only via a non-module path, unguarded paths reported, empty plan) and verify with `--dry-run` on a few explicit paths
- [x] 1.3 Add change detection (explicit paths after `--`, else `git diff --name-only HEAD` + untracked, else `HEAD~1..HEAD`, nothing to compare against → exit 0) and verify `--dry-run` names the source it used on a dirty and a clean tree
- [x] 1.4 Add `test/test-run.test.js`: partition unit ∪ browser = `test/*.test.js` and disjoint, no unit file imports `puppeteer`, and planning cases (only `test/checks/rendering.js` → content with `rendering` only; `test/harness.js` → whole content plus smoke and the other harness users; an `md/` corpus file → its readers; an unmapped file → unguarded; a changed test file → itself). Verify with `node --test test/test-run.test.js`
- [x] 1.5 Add `test/test-run.test.js` to `test/coverage-map.json` (guards `tools/test-run.mjs`, `test/coverage-map.json`) and verify `node --test test/coverage.test.js` passes

## 2. Content-suite selection

- [x] 2.1 Export `sharedRoles()` from `test/harness.js` (roles a shared session was opened for) and verify `node --test test/smoke.test.js` still passes
- [x] 2.2 Turn the static imports in `test/content.test.js` into an ordered list with top-level dynamic import, honouring `SAFELEARN_TEST_CHECKS` (unknown name fails fast and lists the known modules), and keep `deployment-surface.js` last. Verify with `SAFELEARN_TEST_CHECKS=nosuch` (fails with the list) and `SAFELEARN_TEST_CHECKS=rendering,views node --test test/content.test.js` (passes, only those run)
- [x] 2.3 Make the login assertion selection-aware (full run unchanged; for a selection, `loginCount() === sharedRoles().length + selected own sessions`) and name the selection in the duration line. Verify with `SAFELEARN_TEST_CHECKS=session-lifecycle` and with a single-role module run

## 3. Commands and run

- [x] 3.1 Wire the run mode of `tools/test-run.mjs` (spawn `node --test --test-concurrency=1 <files>` with `SAFELEARN_TEST_CHECKS` when partial, propagate the exit code) and `--group unit|browser`, and verify a deliberately failing selection exits non-zero
- [x] 3.2 Add `test:unit`, `test:browser` and `test:changed` to `package.json`, leaving `test` unchanged, and verify `npm run test:unit` finishes in seconds without a login line and `npm run test:changed -- test/checks/rendering.js` runs only the rendering module

## 4. Hook and documentation

- [x] 4.1 Change `runCommand` in `AI/claude/hooks/name-covering-checks.mjs` to `npm run test:changed`, reword the warning ("may take minutes, may authenticate"), and verify by piping a sample PostToolUse event for `obsidian.js` into the hook
- [x] 4.2 Update `docs-testing.md`: the three commands, the classification rule, `SAFELEARN_TEST_CHECKS`, `--dry-run`, and the convention (unit + targeted during the work, full run once at the end or before the push). Add `test/test-run.test.js` to the coverage table. Verify that the docs mention every new script name

## 5. Final verification

- [x] 5.1 Run the full `npm test` once and verify it passes with the same login count as before. Re-run only checks that fail and are known to be flaky (memory `flaky-content-checks`)
