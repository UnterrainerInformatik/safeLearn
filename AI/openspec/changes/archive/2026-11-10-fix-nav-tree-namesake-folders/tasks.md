## 1. Test fixture and failing check

- [x] 1.1 Add `md/folder-tests/namesake-a/shared/Namesake A.md` and `md/folder-tests/namesake-b/shared/Namesake B.md`, each with a line naming its own folder; verify the existing "every folder under md/folder-tests/ is reachable" check still passes (it skips folders without direct files)
- [x] 1.2 Add a check to `test/checks/navigation.js`: on a rendered page, open `namesake-b`, click its `shared`, assert the link to `Namesake B` is visible and `namesake-a/shared` is still closed; click again and assert it closes; then render `/md/folder-tests/namesake-b/shared/Namesake B.md` and assert `namesake-b` and its `shared` are open with the page highlighted and `namesake-a` is closed. Verify the check fails on the current code
- [x] 1.3 Extend the `test/checks/navigation.js` entry in `test/coverage-map.json` with the namesake-folder case and verify `test/coverage.test.js` passes

## 2. Unique folder keys

- [x] 2.1 In `obsidian.js`, derive the folder key from the full folder path (`ff-<hash32(fullPath)>`) and pass that path from `getDirectoryListingInternal` into `insertDirFolder`; keep the bare name as the label. Verify by rendering a page and checking that the four depth-1 folders of a corpus with namesakes carry four distinct keys
- [x] 2.2 Replace the `(name, level)` match in `lookupAndMarkPath` / the `currentLevel` counter with a full-path prefix match against the page's path segments, emitting one `toggleDirList` per folder on the path. Verify the on-load part of check 1.2 passes and the generated `openNavTreeScript` names only the page's own folders
- [x] 2.3 Confirm nothing else depends on the old `ff-<hash>-<depth>` shape (grep `obsidian.js`, `obsidian-page.js`, `css/`, `test/`) and that `toggleDirList` needs no change

## 3. Verification and docs

- [x] 3.1 Run `npm test`; verify the new check and the existing navigation and folder-tests checks pass (re-run known flaky checks once before treating them as failures)
- [x] 3.2 Note in `AI/architecture.md` (component map for `obsidian.js`) that nav-tree folders are keyed by full path; extend the Purpose of `AI/openspec/specs/page-navigation/spec.md` to mention the navigation tree
- [x] 3.3 After the safeLearn push, merge into secureLectures and verify on the deployed instance that `homework/WMC` opens for a teacher
