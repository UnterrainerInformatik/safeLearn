## Why

The Obsidian plugin needs to let a teacher pick people and groups by name when authoring `@@@` directives — but today nothing in safeLearn exposes the directory beyond the session's own roles. `getLdapGroups` (`middlewares/keycloak-middleware.js`) only ever answers "what does the current session hold," never "who else is out there." Without a directory-wide read path, the plugin-side proposals (`plugin-admin-directory-ui`, and the list-driven part of `plugin-section-authoring`) have nothing to call.

## What Changes

- **One search endpoint**, not three. A single `GET /api/admin/directory/search?q=<wildcard>` matches the query against either a person's display name or any role/group they hold (the same values `getLdapGroups` already derives from `OU=` entries — class names, `teacher`, and anything else the directory happens to carry, e.g. `ExamParticipant`). There is no separate "list classes" / "list students of a class" / "list teachers" split; a class is just one more role to search for.
- **Caller identity via a full Keycloak login, not a password the plugin or this backend ever holds.** The plugin authenticates itself against Keycloak directly (Authorization Code + PKCE, loopback redirect opened in the system browser — see `plugin-admin-directory-ui`) and calls the search endpoint with `Authorization: Bearer <token>`. This backend validates that token via Keycloak's introspection endpoint using the existing confidential `safeLearn` client from `keycloak.json` — no new secret handling for the caller's credentials.
- **Directory access via a dedicated, narrowly-scoped service account.** A new confidential Keycloak client with service accounts enabled, holding only the `view-users` client role from `realm-management` in the `safeLearn` realm. It is used solely to query the Keycloak Admin REST API for the directory-wide user list; it is never used to act as, or in place of, the calling teacher.
- **Gated to `teacher` and `admin`.** The introspected token's roles are checked with the same role logic `hasRoles` already applies (admin short-circuits); a caller holding neither is refused. Students never reach this endpoint even with a valid session, matching the personal-data sensitivity of class and student lists.
- **Minimal response shape.** Each match returns a display name and the roles/groups it holds — not a full LDAP/directory record (no email, no other attributes). This is deliberately less than Keycloak's admin API would hand back.
- **Deployment surface stays accounted for.** The new endpoint, and the outbound calls it makes to Keycloak (introspection, admin user search), are new server-side surface and must be reflected in the `deployment-surface` capability and its check (`test/checks/deployment-surface.js`), not bolted on afterward.

## Capabilities

### New Capabilities
- `directory-search`: the `/api/admin/directory/search` endpoint — wildcard matching over name and role/group, bearer-token caller authentication via introspection, directory lookup via the dedicated service account, and the minimal response shape.

### Modified Capabilities
- `deployment-surface`: the search endpoint is new HTTP surface and must be unreachable without a valid, introspection-verified bearer token held by a teacher or admin; the service-account credentials it uses outbound must not be reachable or leakable through any response.

## Impact

- **New code**: a route module for `/api/admin/directory/search`; a Keycloak Admin REST client for user search (reusing the `OU=` parsing logic `getLdapGroups` already implements, factored so both call sites share it); a token-introspection helper.
- **New Keycloak configuration** (provisioned by an operator, not by this change): a public client for the plugin's Authorization Code + PKCE flow (tracked under `plugin-admin-directory-ui`, not here), and a confidential service-account client scoped to `view-users` for this backend.
- **New environment variables** for the service-account client's id/secret, named and documented in `design.md`.
- **Existing code touched**: `test/checks/deployment-surface.js` (new endpoint in the checked surface); `AI/architecture.md` (new route, new outbound Keycloak calls, new capability).
- **No change** to the existing session-based `checkAuthenticated` flow, to `getLdapGroups` itself, or to any rendered page.
