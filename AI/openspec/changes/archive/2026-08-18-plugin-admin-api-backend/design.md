## Context

See `proposal.md` — Why. Two existing pieces this design builds on:

- `getLdapGroups` (`middlewares/keycloak-middleware.js`) parses `OU=…` entries out of the `ldap` claim on the *current session's* token into a flat role/group map (`{5bhif: true, teacher: true, ...}`). It never talks to Keycloak itself — the claim is already in the token the session holds.
- `keycloak.json` holds the one confidential client (`safeLearn`) the app authenticates its own OIDC flow with, including its secret. Tokens from that flow are decoded, not signature-verified — acceptable there because the token arrives via a direct, TLS-authenticated exchange with Keycloak, not from an arbitrary bearer.

Neither piece can serve a directory-wide, teacher/admin-only search: `getLdapGroups` only ever sees one person's claim, and there is no existing path where a bearer token arrives from outside the session flow and must be checked on its own merits.

## Goals / Non-Goals

**Goals:**
- Define the one new endpoint, its two distinct Keycloak relationships (verifying the caller; querying the directory), and how they stay separate.
- Keep the new outbound Keycloak identity as narrow as the existing deployment-surface philosophy demands.

**Non-Goals:**
- The plugin-side login UX (loopback redirect, token storage, settings fields) — that belongs to `plugin-admin-directory-ui`.
- Any change to how the browser session itself authenticates or to `getLdapGroups`'s existing behavior for session-based role checks.
- Pagination or rate-limiting of directory results — the realm's expected size (a single school) does not warrant it yet; revisit if it does.

## Decisions

### One search endpoint over three enumerated ones

The original proposal sketched "list classes," "list students of a class," "list teachers" as three endpoints. Folding these into one `GET /api/admin/directory/search?q=` that matches name-or-role by substring is simpler to gate, simpler to check in `deployment-surface`, and does not need to know the closed set of role kinds a class, `teacher`, or something like `ExamParticipant` belong to — any of them is just a value in the same role/group map `getLdapGroups` already produces. The cost is that the client (the plugin) does its own filtering by role-vs-name if it wants a distinct "browse classes" affordance; that's a UI concern, not a reason to add server-side endpoints back.

### Authorization Code + PKCE at the plugin, introspection at the backend — not password-based grants

Considered and rejected: Resource Owner Password Credentials (the plugin collects a password and this backend or the plugin exchanges it directly). Keycloak itself deprecates ROPC; it bypasses MFA and any identity-provider federation the realm might add later, and it means either the plugin or this backend touches a raw password. Instead, the plugin performs a full Authorization Code + PKCE login directly against Keycloak (design detail of `plugin-admin-directory-ui`) and this endpoint only ever sees a bearer access token.

That token is validated by calling Keycloak's introspection endpoint (`{issuer}/protocol/openid-connect/token/introspect`), authenticated with the existing `safeLearn` confidential client's own credentials from `keycloak.json` — no new secret needed for this half. Introspection was chosen over local JWT signature verification (fetching and caching Keycloak's JWKS) because it also answers "is this token still active" — a token revoked or expired since issuance fails introspection immediately, where a locally-verified signature would still check out until the token's own `exp`. Given this endpoint hands out personal data, checking liveness on every call is worth the extra round-trip; the existing session flow doesn't need this because it never accepts a bearer token from outside its own exchange.

The introspection response's roles/LDAP claim are run through the same role logic `getLdapGroups` applies today (factored out so both call sites share it), so "teacher" and "admin" mean the same thing here as everywhere else in safeLearn, including admin's existing short-circuit.

### A dedicated, `view-users`-only service account for the directory query

The endpoint's own outbound identity toward Keycloak's Admin REST API is a second, separate confidential client — service accounts enabled, holding only the `view-users` client role from `realm-management` in the `safeLearn` realm. Deliberately not `manage-users`, not `view-groups`/`query-groups` (native Keycloak Groups aren't used here), and not the caller's own token — a teacher's identity is checked, then set aside; it never reaches Keycloak's Admin API itself. Two identities, two purposes, matches the proposal's explicit requirement that the directory query "geht übers Verzeichnis, nicht über den, der gerade eingeloggt ist."

### A directory user's role/group map merges LDAP and Keycloak client roles, not just LDAP

The proposal described directory role/group data as "the same values `getLdapGroups` already derives from `OU=` entries." Verified against the live demo realm this project tests against: none of its accounts carry an `LDAP_ENTRY_DN` attribute at all — there is no LDAP federation on it — yet the same accounts demonstrably hold `teacher`, `admin`, a class, and an `examParticipant` marker, because this realm grants those as Keycloak client roles on the `safeLearn` client directly. `utils.js`'s `hasRoles` already treats an LDAP-derived group and a client role as interchangeable for the session path; `directoryUserRoles` (`middlewares/directory-service.js`) now does the same for each directory user, adding one Admin API call per user (`GET /admin/realms/safeLearn/users/{id}/role-mappings`, readable under `view-users`) to `attributes.LDAP_ENTRY_DN` parsing, and merging both into one map with the same `teachers`/`students` canonicalization. A production deployment with real LDAP federation (per `docs-keycloak.md`) populates the first source; a realm that grants roles directly, as this demo realm does, populates the second — either way the search works. Both calls are covered by the same 10-minute cache below, so this does not multiply the per-search cost.

New environment variables, following the existing plain-name style of `SESSION_SECRET` (not the legacy `NEXT_PUBLIC_` prefix, which signals client-exposed values and would be wrong for a secret): `DIRECTORY_SERVICE_CLIENT_ID`, `DIRECTORY_SERVICE_CLIENT_SECRET`.

### Response shape: name + roles/groups, computed server-side

Keycloak's admin user search returns considerably more than this endpoint should ever hand back (email, arbitrary attributes). The route maps each matched user down to `{ name, roles }` before responding — the minimization happens in this backend, not by asking Keycloak for less, since the admin API doesn't support attribute projection.

### Both halves of the match run against a full, unfiltered fetch of the realm

Keycloak's own `search` query parameter on `GET /admin/realms/safeLearn/users` only matches username, name and email — it has no notion of a user's `ldap` attribute at all. Restricting the admin-API call to `search=<query>` would therefore return nothing for a role/group query such as a class name, making the role/group half of the requirement unreachable. Instead the backend fetches the realm's user list unfiltered (`briefRepresentation=false`, no `search`) and matches `query` against both the constructed display name and the `ldap`-derived role/group map locally, in one pass — "directory-wide," not scoped to whatever Keycloak's own search would have already filtered down to.

### The full user list is cached, not fetched per search

Fetching every user on every keystroke-paced search is unnecessary cost for data that moves slowly: the directory's shape changes roughly once a year in bulk (a new school year) and by single-user edits (a role or class reassignment) at most a few times a month. The backend caches the realm's full user list in-process for 10 minutes and reuses it across searches that land inside that window, rather than treating "no caching" as a fixed constraint. The caller's own identity is not covered by this cache — introspection still runs on every request, per the requirement that it be checked "verified at the time of the request rather than accepted on trust." A role or class change therefore reaches the caller-identity check immediately and the directory data within 10 minutes.

## Risks / Trade-offs

- **A directory change (a new user, a reassigned class) is invisible to this endpoint for up to 10 minutes.** Accepted: the realm's directory does not change at that pace, and the caller-identity check is unaffected — it is not cached and reflects a revoked or newly-granted role immediately. If a deployment needs directory changes to appear sooner, lower the cache window rather than removing it.
- **Every search still costs one introspection round-trip**, whether or not the directory fetch is served from cache. For a single-school deployment and human-paced typing (not a live-as-you-type autocomplete hitting the network per keystroke) this is acceptable; if the plugin later wants keystroke-level live search, add client-side debouncing there.
- **`view-users` still exposes more per user than this endpoint returns** (the Admin API call itself receives full user objects, including attributes beyond `ldap`). → Mitigated by the response-shape minimization above happening before anything leaves this backend; the risk is confined to what this backend's own process holds transiently, not to what it exposes.
- **Two new confidential clients to provision in Keycloak** (this backend's service account, per this proposal; the plugin's public PKCE client, per `plugin-admin-directory-ui`) — operator setup work outside this repo's automation. → `tasks.md` calls out exactly what to configure and with which role, so it's a checklist rather than a rediscovery.
- **Introspection depends on the realm's introspection endpoint staying reachable from the server.** Already true of every other Keycloak call this app makes (login, refresh); no new failure class.

## Migration Plan

Purely additive: a new route, two new Keycloak clients, two new environment variables. No existing route, session behavior, or stored data changes. Rollback is deleting the route and the two Keycloak clients; nothing to migrate back.
