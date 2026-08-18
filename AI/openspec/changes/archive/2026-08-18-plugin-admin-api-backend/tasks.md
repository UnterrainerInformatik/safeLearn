## 1. Keycloak configuration (operator action, not code)

- [x] 1.1 In the `safeLearn` realm, create a new confidential client with service accounts enabled (e.g. `safelearn-directory-service`), standard flow and direct access grants off.
- [x] 1.2 On that client's service account, assign the client role `view-users` from `realm-management`. Do not assign `manage-users`, `view-groups`, `query-groups`, or any realm-admin role.
- [x] 1.3 Record the client id and secret as `DIRECTORY_SERVICE_CLIENT_ID` / `DIRECTORY_SERVICE_CLIENT_SECRET` in every deployment's environment, and in local `.env` for development.
- [x] 1.4 Confirm introspection is reachable and permitted for the existing `safeLearn` confidential client (`{issuer}/protocol/openid-connect/token/introspect`) — most Keycloak setups allow this by default for a confidential client authenticating with its own secret, but verify against the demo realm before relying on it.
- [x] 1.5 Say in `docs-keycloak.md`, alongside the existing client setup, what this second client is for, exactly which single role it holds, and why (mirrors the existing table's level of detail for the `ldap` claim mapper).

## 2. Shared role derivation

- [x] 2.1 Factor the `OU=` parsing `getLdapGroups` performs (`middlewares/keycloak-middleware.js`) into a helper that takes a raw LDAP claim/attribute string and returns the role/group map, independent of `req`. Keep `getLdapGroups` itself as a thin wrapper over it for the session path, so behavior for existing callers is unchanged.
- [x] 2.2 Reuse that helper for both: deriving roles from an introspected token's `ldap` claim, and deriving roles/groups from each directory user's `ldap` attribute returned by the admin user search.

## 3. Token introspection

- [x] 3.1 Add a helper that calls `{issuer}/protocol/openid-connect/token/introspect` with the bearer token from the request and the existing `safeLearn` confidential client's own credentials, and returns whether the token is currently active plus its claims.
- [x] 3.2 From the introspection result, derive the caller's roles with the helper from 2.1, and decide teacher-or-admin the same way `hasRoles`'s admin short-circuit already works, so "admin" means the same thing here as everywhere else.
- [x] 3.3 Treat a missing `Authorization` header, a malformed bearer value, an inactive token, and a token that introspects as active but holds neither role, as the same outcome: refused, no directory data, no distinguishing error detail that would let a caller tell these apart.

## 4. Directory service client

- [x] 4.1 Add a client-credentials token fetch for `DIRECTORY_SERVICE_CLIENT_ID`/`DIRECTORY_SERVICE_CLIENT_SECRET` against the realm's token endpoint, cached until shortly before expiry rather than fetched per search.
- [x] 4.2 Add a directory search function that calls `GET /admin/realms/safeLearn/users?briefRepresentation=false` (unfiltered) with that service token, cached for 10 minutes rather than fetched per search, and matches `query` against both the display name and each user's role/group map (via 2.1's helper on their `ldap` attribute) in this backend — Keycloak's own `search` parameter only covers username/name/email and has no notion of `ldap`, so it cannot answer the role/group half at all; resolved during implementation in favor of one unfiltered, directory-wide fetch matched locally for both halves. See `design.md`.
- [x] 4.3 Merge the two match sets (name-matched, role/group-matched) into one de-duplicated list — naturally satisfied by matching both conditions in a single pass over the same fetched list.
- [x] 4.4 Map each matched user down to `{ name, roles }` — display name and the role/group map from 2.1, merged with the user's `safeLearn` client roles (`GET .../users/{id}/role-mappings`, one call per user, covered by the same 10-minute cache) — discarding every other field the admin API returned. The client-role merge was added during implementation: the demo realm this project tests against has no LDAP federation at all, so `LDAP_ENTRY_DN` is empty for every account and role/group search would otherwise never find anything on it. See `design.md`.

## 5. The route

- [x] 5.1 Add `GET /api/admin/directory/search` wired to: 3.1–3.3 for the caller check, then 4.1–4.4 for the search, returning the mapped list as JSON.
- [x] 5.2 An empty or missing `q` query parameter returns an empty list without calling the directory service client — matches the spec's "matches nothing" scenario without spending a Keycloak round-trip on it.
- [x] 5.3 Do not add this path to any of the existing `checkAuthenticated` / session-based middleware chains in `app.js` — its identity check is 3.1–3.3, independent of the browser session mechanism.

## 6. Deployment surface

- [x] 6.1 Add the new route's mount point to whatever `app.js` structure `test/checks/deployment-surface.js` already reads to know the served surface, so it is not a check that has to be told separately from the code.
- [x] 6.2 Confirm no error path of the new route (introspection failure, directory-service token fetch failure, malformed query) ever includes `DIRECTORY_SERVICE_CLIENT_SECRET`, the service account's own token, or the caller's bearer token in a response body or a log line reachable by a client.

## 7. Test coverage

- [x] 7.0 Add `admin` as a third known role in `test/harness.js` (`accounts`, `knownRoles`), following the existing `student`/`teacher` pattern: `username: process.env.SAFELEARN_TEST_ADMIN_USER || "admin"`, `password: process.env.SAFELEARN_TEST_ADMIN_PASSWORD || "admin"`. The account already exists in the shared demo realm (openly known, same as `teacher`/`teacher`) — this is a harness-only change, no Keycloak setup needed.
- [x] 7.1 Decide how the test suite obtains a valid access token for a demo teacher/admin account to exercise the introspection path: the existing harness deliberately keeps tokens out of test code (`readIdentity` in `test/harness.js` only ever surfaces a username) because no prior feature needed one. This one does. Extend the harness with a token-acquisition path scoped to this need (e.g. driving the same Authorization Code flow headlessly against a public client capable of it, or another mechanism agreed with the demo realm's operator) rather than reusing the browser session's cookie, which never exposes a token to the page.
- [x] 7.2 Add `test/checks/directory-search.js` covering: a teacher token searching by name; a teacher token searching by role/group (including a value that is not a class or `teacher`/`admin`, to exercise the "any role/group" requirement); an admin token succeeding without holding teacher; a student token refused; a missing bearer refused; an expired/revoked token refused; a match's response containing only `name` and `roles`.
- [x] 7.3 Extend `test/checks/deployment-surface.js` with the two new scenarios from the `deployment-surface` delta spec: an unauthenticated request to the search endpoint returns no directory data, and a request carrying only a valid browser session (no bearer proof) also returns none.
- [x] 7.4 Wire `test/checks/directory-search.js` into `test/content.test.js` alongside the other checks.
- [x] 7.5 Add an entry for `test/checks/directory-search.js` to `test/coverage-map.json` (`what`, `guards`, `corpus`), and extend the existing `deployment-surface` entry's `what` to mention the new endpoint.

## 8. Documentation

- [x] 8.1 Record the new route, its two Keycloak relationships, and the new capability in `AI/architecture.md` §5 (Request & Route Surface) and §9 (Observations), following the existing level of detail.

## 9. Close out

- [x] 9.1 Run `npm test`; green, including the new checks.
- [x] 9.2 Manually exercise the endpoint end-to-end against the demo realm with a teacher account and with a student account, confirming the refusal and the result shape by hand once, independent of the automated checks.
