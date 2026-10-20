## 0. Preconditions

- [x] 0.1 Confirm that `attachment-access-control` has been applied and archived. Its full decision and `grantEpoch` are what 3.6 builds on. If it has not, stop and raise it with Gerald
- [x] 0.2 Settle the remaining open questions with Gerald and record the outcome in design.md D4a. Settled on 2026-10-17: `?q` and `?context` are render parameters, the server-written `lastVisitedUrl` cookie is accepted, and stray cookies in `keycloak` mode are only ignored, never cleared
- [x] 0.3 Check whether `remove-convert-route` has been applied. If not, raise it with Gerald before shipping tier 1, since `/convert` would otherwise be reachable anonymously

## 1. Pure move: route registration

- [x] 1.1 Move the body of `initKeycloak(app).then(...)` in `app.js` into `registerRoutes(app, identity)`, with `identity` carrying `checkAuthenticated`, the preference store and `offersLogin`. Build it from the existing middleware only. No behaviour change (design D2)
- [x] 1.2 Run the full `npm test` and `npm run test:obsidian`. Both must be green before anything below is started

## 2. Mode selection and start-up checks

- [x] 2.1 Add `auth-mode.js`: normalize `AUTH` (unset → `keycloak`), refuse unknown values, parse `READER_ROLES` with `normalizeRole`, refuse `AUTH=none` combined with any entry of `identityRequiringSwitches` (initially `EXAM_MODULE=on`). Each refusal exits with a message naming the variables (design D1)
- [x] 2.2 Extend the missing-`keycloak.json` path in `initKeycloak` with a message naming `AUTH=none` as the deliberate alternative. Missing configuration still ends the start
- [x] 2.3 Log one start-up warning when `AUTH=none` and the reader roles include `teacher` or `admin` (design, Risks)
- [x] 2.4 Wire `app.js` to run `auth-mode.js` first. In `keycloak` mode call `initKeycloak` and `registerRoutes` as before. In `none` mode call `registerRoutes` with a pass-through `checkAuthenticated` and `offersLogin: false`, without `initKeycloak`, `express-session`, passport or the `SESSION_SECRET` check
- [x] 2.5 Register the directory search/status routes only in `keycloak` mode (design D2). `/convert` is handled by `remove-convert-route`

## 3. Roles and preferences

- [x] 3.1 In `permission-context.js` `buildRoleViews`, add the reader roles as a source above the canonicalization block in `none` mode, reading no `req.user` (design D3)
- [x] 3.2 Add the cookie read/write helpers (`safelearn_config`, `safelearn_last`; HttpOnly, SameSite=Lax, Path=/, one year, Secure over HTTPS) without a new dependency (design D4)
- [x] 3.3 In `none` mode, build the context's `account` from the two cookies. In `keycloak` mode, read only `fetchAccount` and never look at those cookies (preference-source rule, design D4)
- [x] 3.4 `/userattributes` in `none` mode: `GET` answers `{ accessTokenDecoded: { config } }` from the cookie, `POST` validates JSON, refuses blocks over 3 KB, and answers with `Set-Cookie`. `keycloak` mode stays unchanged and ignores any such cookie
- [x] 3.5 `rememberLastVisited` in `none` mode sets `safelearn_last` before `res.send` at all three call sites. In `keycloak` mode it keeps its current behaviour
- [x] 3.6 Attachments in `none` mode: skip grant recording (no `req.session`) and decide through `attachment-access-control`'s full decision, memoized process-wide by `(path, vt, ve, va, grantEpoch)`, dropped on an epoch bump (design D4b)
- [x] 3.7 Audit every `req.query`/body read on content routes against the inventory in design D4a. No render parameter may reach `buildRoleViews`, the view gates or the downgrade
- [x] 3.8 `getTopdownMenu` (`obsidian.js`) renders the logout button only when `offersLogin` (design D5)

## 4. Deployment and templates

- [x] 4.1 `deploy/docker-compose.yml`: add `AUTH=keycloak` as a literal in `environment:`
- [x] 4.2 `test/deployment-config.test.js`: assert that the deployed container receives exactly `AUTH=keycloak`, and list `READER_ROLES` in `optionalWithDefault` ("absent grants no role")
- [x] 4.3 Both WYSIWYG templates: `.env` with `AUTH=none` and `READER_ROLES=teacher` (with a comment), `SESSION_SECRET` commented out for the Keycloak variant. `docker-compose.yml` passes `AUTH`/`READER_ROLES`, and the `keycloak.json` mount is commented out (design D6)

## 5. Verification

- [x] 5.1 `test/harness.js`: `startAnonymous({ readerRoles, env })` on its own port, opening the start page directly. Add `expectRefusedStart(env)` (design D7)
- [x] 5.2 `test/anonymous.test.js`: without reader roles, every restricted block and file of the test corpus is absent and unrestricted pages are reachable. The login paths and directory endpoints answer as unserved, and no logout control is rendered
- [x] 5.3 `test/anonymous.test.js`: with `READER_ROLES=teacher`, teacher content is shown. The teacher toggle hides it on the next page, and the exam toggle switches exam/practice. A second browser context keeps its own preferences, and "start with last page" redirects
- [x] 5.4 `test/anonymous.test.js`: a reader without `teacher` sending a cookie with the exam view on still sees the practice variant. A malformed cookie renders with defaults
- [x] 5.5 `test/anonymous.test.js`: attachments. One referenced only inside `@@@ teacher` is refused without reader roles and served with `READER_ROLES=teacher`, and refused again after the teacher view is switched off
- [x] 5.6 Render-parameter invariant in both modes: a page with an `@@@ teacher` block, rendered as page, `?reveal=true`, `?document=true` and print, shows the same permitted content. `?ve=1&vt=1` in the query does not change a Keycloak session's render. A `?reveal=true` URL opened in a fresh browser context without cookies shows the presentation view
- [x] 5.7 `test/anonymous.test.js`: refused starts for `AUTH=off`, `AUTH=none` + `EXAM_MODULE=on`, and no `AUTH` without `keycloak.json`
- [x] 5.8 Keycloak-backed check (`test/checks/permissions.js` or `views.js`): a `teacher` session with the stored exam view off plus a forged `safelearn_config` cookie with the exam view on renders the practice variant, a forged `safelearn_last` does not change the `/` redirect, and the stored preferences are unchanged afterwards. The response carries no `Set-Cookie` for `safelearn_config`/`safelearn_last`
- [x] 5.9 Run `npm test` (both modes) and `npm run test:obsidian`, all green

## 6. Documentation

- [x] 6.1 `docs-wysiwyg.md`: both variants, with `AUTH=none` as the default, what `READER_ROLES` does, and that deleting it hides restricted content
- [x] 6.2 `docs-keycloak.md`, `docs-permissions.md`: the `AUTH` variable, the reader roles as a role source, and the preference-source rule
- [x] 6.3 `AI/architecture.md`: overview (Keycloak no longer mandatory), permission model (reader roles), configuration table (`AUTH`, `READER_ROLES`), and the route table (routes absent in `none` mode)
- [x] 6.4 `AI/exam-module-plan.md` section 3: mark tier 1 as specified by this change
