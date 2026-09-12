## Why

`DirectoryInfoModal` ("Directory info") lists every teacher, every class, and every user, but only as scrollable lists. Sanity-checking that the directory looks right overall - roughly the expected number of classes, roughly the expected number of users - currently means scrolling and counting by hand. A person should be able to tell at a glance, the moment the modal opens, whether the totals look right.

## What Changes

- Add a summary line to `DirectoryInfoModal`, visible as soon as the one `searchDirectory("")` fetch resolves, stating the total number of users and the total number of classes the directory reported.
- The summary is omitted (not shown as `0 users, 0 classes`) when that fetch does not complete with an `ok` outcome, consistent with how the Teachers and Classes lists already treat a failed fetch - the existing status line already explains the failure.

## Capabilities

### Modified Capabilities

- `plugin-directory-info-view`: adds a requirement that the view shows the total user count and total class count up front, distinct from a failed fetch.

## Impact

- `AI/plugin/main.ts` - `DirectoryInfoModal.onOpen()`.
- `AI/plugin/styles.css` - one new rule for the summary line.
- `AI/plugin/main.js` - rebuilt from `main.ts` (`npm run build`).
