Source: AI/open-proposals.md

## Why

safeLearn cannot start without a reachable Keycloak: `initKeycloak` reads `keycloak.json`, discovers the issuer and only then registers a single route, and `checkAuthenticated` stands in front of every one of them. That makes the smallest useful installation — a container that publishes a Markdown corpus and nothing else — impossible, and it makes the WYSIWYG container that authors run locally depend on access to a Keycloak client for no reason other than seeing their own pages. This change introduces operating tier 1 of the three tiers recorded in `AI/exam-module-plan.md`, section 3: publishing without an identity provider.

## What Changes

- A new authentication mode, selected by `AUTH`. `AUTH=keycloak` is today's behaviour. `AUTH=none` starts the application without an identity provider: no login, no session, no Keycloak call of any kind.
- `AUTH=none` is **opt-in only and never a fallback.** An instance that sets neither `AUTH=none` nor a working Keycloak configuration refuses to start, as it does today when `keycloak.json` is missing. A value of `AUTH` that is neither of the two refuses to start as well.
- Without an identity provider, every reader holds exactly the roles listed in `READER_ROLES` (comma-separated, e.g. `teacher,examParticipant,4bhif`). Without the variable a reader holds no role at all, so every restricted section and every restricted file stays hidden. The value is trusted: whatever it lists, every reader of that instance gets.
- The role rules stay as they are: aliases, the admin short-circuit, the student-view downgrade and the exam gate apply to the reader roles exactly as they apply to a session's roles. With `teacher` among them the teacher, exam and answer toggles appear and work.
- Parameters fall into two classes (design.md D4a): **config parameters** (persisted per-user preferences, including everything that affects visibility) and **render parameters** (presentation of one request, e.g. `?reveal`, `?document`, print). A render parameter never changes what a reader may see. Render parameters stay in the URL in every mode and are never moved into cookies or browser storage, so a presentation or print view remains bookmarkable.
- Preferences (`config`) and the last visited page live in the reader's browser instead of in Keycloak user attributes. Because the server needs the view preferences while it renders, they travel as cookies rather than through `localStorage`.
- Preferences are taken from the request **only** without an identity provider. Under `AUTH=keycloak` (and later with the database) the server reads them solely from the identity's own store and ignores whatever the request carries. Otherwise a request-supplied block would be a side channel past that store. A stray preference cookie under `AUTH=keycloak` is only ignored, never actively deleted. The remaining details are listed in design.md, D4.
- Without an identity provider, the login and logout surfaces are absent (the logout button, `/test`, `/auth/callback`, `/logout`, `/logout/callback`), and the directory routes `/api/admin/directory/search` and `/api/admin/directory/status` are not registered. `/convert` is not part of this change: the separate change `remove-convert-route` removes it from the application in every mode.
- `SESSION_SECRET` is no longer required in `AUTH=none`, because there is no session to sign.
- A switch that needs an identity cannot be combined with `AUTH=none`: `EXAM_MODULE=on` together with `AUTH=none` aborts the start with a message naming both. The check holds whether or not the exam module is present in the code base yet.
- The WYSIWYG templates (`wysiwyg-container-linux`, `wysiwyg-container-windows`) switch to `AUTH=none` with `READER_ROLES=teacher`, and their `keycloak.json` becomes optional. `docs-wysiwyg.md` describes both ways to run them.
- The deployed instance is pinned to `AUTH=keycloak`: `deploy/docker-compose.yml` passes it on explicitly, and the deployment tests fail if it does not.
- The test harness runs the application in both modes.

## Capabilities

### New Capabilities

- `anonymous-publishing`: running safeLearn without an identity provider — how the mode is selected and when the start is refused, the reader roles every reader holds, where preferences and the last visited page are kept, and which surfaces are absent.

### Modified Capabilities

- `role-resolution`: the requirement "A session's roles come from the session alone" gains its counterpart for an instance without an identity provider, where the role set comes from the deployment's reader roles and from nothing a request carries.
- `deployment-surface`: the session secret is required only where there are sessions; a new requirement fixes how a deployment states its authentication mode and that the deployed instance states `keycloak`.
- `browser-verification`: a new requirement for verification runs against an instance without an identity provider.

## Impact

- **Code:** `app.js` (start-up validation, route registration with and without the identity provider, `rememberLastVisited`, the `/` redirect, `/userattributes`), `middlewares/keycloak-middleware.js` (`initKeycloak`, `checkAuthenticated`, `getUserAttributes`/`setUserAttribute`), `permission-context.js` (role views and preferences from the reader roles and cookies), `obsidian.js` (`getTopdownMenu` without logout), `obsidian-page.js` (how it reads and writes preferences).
- **Deployment:** `deploy/docker-compose.yml` gains `AUTH=keycloak`. secureLectures receives the same through the usual sync; its behaviour does not change.
- **Templates and docs:** both WYSIWYG templates, `docs-wysiwyg.md`, `docs-keycloak.md`, `docs-permissions.md`, `AI/architecture.md`.
- **Tests:** `test/deployment-config.test.js` (`AUTH` must reach the deployed instance, `READER_ROLES` is optional with a default), `test/harness.js` and a check file for the anonymous mode.
- **Dependency:** `attachment-access-control` (`openspec/changes/attachment-access-control/`) must land first. Without it, attachments under `/md` are served without a permission check, and in `AUTH=none` every attachment would be public, including those referenced only from restricted sections. Tier 1 uses that change's full decision without a session, memoized process-wide (design.md D4b), not its session grants.
- **Ordering with the exam module:** the exam module introduces `EXAM_MODULE`. This change adds only the cross-check against `AUTH=none` and does not depend on the module being present.
