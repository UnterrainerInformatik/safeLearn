## Why

`verifyCallerIdentity` (`middlewares/directory-service.js`) merges the caller's `resource_access[<server client id>].roles` into its role map without applying the `teachers` → `teacher` (and `students` → `student`) plural aliasing that every other role check in the codebase already applies — `utils.js`'s `hasRoles` (the session/content-permission path) and the plugin's own client-side `hasDirectoryRole()` (`main.ts`) both do this canonicalization already. An account whose teacher grant is the plural Keycloak client role `teachers` therefore passes the normal session login and the plugin's own directory-role check — both report "you have access" — but is refused (403) by `GET /api/admin/directory/search`, which the plugin's picker renders as total silence, because a refusal is deliberately indistinguishable from "not logged in" there. Confirmed as the live cause of a reported bug: `g.unterrainer` on the `secureLectures` deployment (realm `unterrainer`, `auth.htl-leonding.ac.at`) sees a normal, working login but every directory-backed list (the picker, "List classes") comes back empty with no error surfaced anywhere.

## What Changes

- `verifyCallerIdentity` applies the same `teachers` → `teacher` / `students` → `student` canonicalization to the roles it reads from `resource_access[client.client_id]` before deciding `isTeacher`/`isAdmin`, matching `deriveRoles` (`keycloak-middleware.js`) and the canonicalization block in `hasRoles` (`utils.js`).
- The `directory-search` spec gains an explicit requirement that the teacher/admin determination it authorizes on canonicalizes the plural client-role spelling the same way the rest of the system does, so this cannot silently drift apart again.
- Test coverage in `test/checks/directory-search.js` (or `test/directory-service.test.js`) exercises a caller whose only teacher grant is the plural client role `teachers`, asserting the search succeeds rather than 403.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `directory-search`: the teacher/admin determination the search endpoint's auth gate performs SHALL canonicalize the plural client-role spelling (`teachers` → `teacher`, `students` → `student`) the same way the rest of the system's role resolution does, so a caller recognized as a teacher/admin everywhere else in the system is never refused here.

## Impact

- `middlewares/directory-service.js` — `verifyCallerIdentity`'s role merge.
- `test/checks/directory-search.js` / `test/directory-service.test.js` — new coverage for the plural client role.
- No change to the plugin, to `utils.js`, or to any other role-check path — those already canonicalize correctly; this closes the one path that didn't.
