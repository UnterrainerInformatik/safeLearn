## 1. The permission context

- [x] 1.1 Add `permission-context.js` next to `utils.js`, exporting `getPermissionContext(req)`. It stores the *promise* on `req.permissionContext` before its first `await` and returns that same promise to every later caller, so the concurrent fan-out in `removeForbiddenContent` resolves one build rather than one per block.
- [x] 1.2 Move the role assembly out of `hasRoles` into the builder, rule for rule and in the same order: `rolesCalculated` from the session, the display name with the reserved-name guard and its existing warning, the client roles from the access token, then the plural canonicalization and the `teacher`/`teachers`, `student`/`students` aliasing.
- [x] 1.3 Build the role sets as `Set`s rather than plain objects, so `constructor` and `__proto__` stop being truthy role names — a directive naming either currently grants every session.
- [x] 1.4 Have the builder produce both role sets up front: the full one, and the student-view one with `teacher`, `teachers` and `admin` removed when `vt == 0`. Record `isAdmin` and `isTeacher` per set, since the exam gate reads them after the downgrade.
- [x] 1.5 Have the builder make the single `/account` call and keep both the raw response and the parsed `ve`, `vt`, `va`, plus one `Date` as the request's reference time.
- [x] 1.6 On a failed lookup, resolve to a context carrying `{ve: 0, vt: 0, va: 0}` with the roles intact, and log the failure once for the request.
- [x] 1.7 Export the parsed `keycloak.json` from `initKeycloak` and read `resource` from that export in `getClientRoles`, removing the per-check `fs.readFileSync` from the event loop.

## 2. The check becomes a decision against the context

- [x] 2.1 Rewrite `hasRoles` to `await getPermissionContext(req)` and perform no I/O of its own. `hasSomeRoles(req, roles, allowOverride)` keeps its signature, and no call site in `obsidian.js` changes.
- [x] 2.2 Implement the student-view downgrade as a selection between the two precomputed sets — never a deletion from a shared one, which is the mutation that would reintroduce order dependence across a request.
- [x] 2.3 Decide the `#exam`, `#practice` and `#answer` pseudo-roles against the context's preferences, keeping `#practice` the exact complement of `#exam` and the exam gate hardcoded to teacher-or-admin after the downgrade.
- [x] 2.4 Leave the `catch` in `hasRoles` refusing: a context that fails to build is a different failure from a lookup that returned nothing, and `role-resolution` already requires the refusal.

## 3. One reference time per request

- [x] 3.1 Pass the context's reference time into `getActivePermissionRoles` from `resolveFileVisibility`, using the parameter it already has instead of letting it default to `new Date()`.
- [x] 3.2 Do the same in `removeForbiddenContent`, so a window cannot close between the first block of a page and the last.

## 4. The callers that fetched for themselves

- [x] 4.1 Have `getUserAttributes` derive both of its shapes — the full one and the one stripped of `userProfileMetadata`, `id`, `username`, `emailVerified` — from the context instead of fetching, keeping its two-argument signature.
- [x] 4.2 Have `setUserAttribute` merge from `req.permissionContext` when one is present (falling back to its current fetch when it is not), and update the context with what it wrote, so the request stays consistent with itself afterwards.
- [x] 4.3 Settle the contradiction between `utils.js:78` reading `attributes?.attributes?.config` and `app.js:355` reading `attributes.config`: give the context one canonical shape, point the `/` redirect route at it, and confirm by hand that `sl == 1` now resolves `/` to the stored `lastVisitedUrl` — the harness pins `sl: 0`, so no check covers it.
- [x] 4.4 Point the two `lastVisitedUrl` writes and the `POST /userattributes` handler in `app.js` at the context-backed `setUserAttribute`.

## 5. Invalidation

- [x] 5.1 Clear `req.permissionContext` at the end of `refreshAccessToken`, so a context built before the token was replaced is never reused after it.

## 6. Verification

- [x] 6.1 Add `test/permission-context.test.js` — no browser, stubbed `fetch`, in the shape of `test/directory-service.test.js`. Assert: many checks in one request cause one lookup; a request that asks nothing causes none; concurrent checks started before the first resolves still cause one.
- [x] 6.2 Assert in that file that a check with `allowOverride` leaves the context unchanged for a check that follows it, in both orders — the regression the shared role set makes possible.
- [x] 6.3 Assert that `@@@ constructor` and `@@@ __proto__` are granted to no session.
- [x] 6.4 Assert the failed-lookup path: the context resolves with default preferences and the session's roles intact, every check of that request sees the same values, and the failure is logged once.
- [x] 6.5 Assert that every directive of one request is evaluated against the same reference time, by stubbing the clock across a build that spans a window boundary.
- [x] 6.6 Add an assertion to `test/checks/permissions.js` on the *number* of `/account` requests a rendered page causes — at most one, so an added route that asks no question does not break it. This is the property the change buys, and nothing else stops it from regressing.
- [x] 6.7 Record the new check file and its guarded files in `test/coverage-map.json`, and extend the `what` of `test/checks/permissions.js` for the lookup-count assertion. `test/coverage.test.js` fails on an unrecorded check file.
- [x] 6.8 Run `npm test` and confirm the Puppeteer harness is unchanged against the demo realm: the teacher/student toggle, the exam and practice variants, the answer view, the hidden files and the navigation tree all behave exactly as before.

## 7. Documentation

- [x] 7.1 In `docs-keycloak.md`, where the two `/realms/{{realm}}/account` endpoints are listed, state that a request reads them at most once and that a request asking no permission question reads them not at all.
- [x] 7.2 In `docs-development.md`, update the description of how `hasRoles` compares roles to say that the role set is resolved once per request, and that a request answers every directive from the same context.
