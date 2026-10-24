## Context

The exam module knows a student's roles only through the held directory (`middlewares/directory-service.js`): every user's client roles on the application's client (`clientRoleNames`, read via `GET users/{id}/role-mappings`) merged with the `OU=` parts of `LDAP_ENTRY_DN`, exposed as `heldDirectoryPeople()`. The identity behind it, `DIRECTORY_SERVICE_CLIENT_ID`, has so far been read-only (`view-users`, `view-events`), and `docs-keycloak.md` says so explicitly. The directory is refreshed when the user count or the last user admin event moves (`isDirectoryCacheFresh`), and Gerald edits the realm by hand only a few times a year (see memory `directory-realm-update-cadence`).

The roles are compared in lower case throughout (`normalizeRole`, `directoryUserRoles`), so `examparticipant-wmc` is consistent with every check.

## Goals / Non-Goals

**Goals:**
- One admin-API path for read, create and map of a single client role, reusing the existing token handling.
- Highlight data computed on the server from the held directory and shipped with the answers the views already load, so no view makes a second request.

**Non-Goals:**
- Changing how the role affects document visibility, or refreshing a logged-in student's session: their token carries the role from their next login or token refresh.
- A separate Keycloak client for writes (decided against by Gerald: the directory-service client is extended).
- Highlighting outside the exam module (sidebar, search, plugin).

## Decisions

**D1 – Keycloak calls.** Against `admin/realms/<realm>/`, with the directory-service token:
1. `GET clients?clientId=<resource>` → the client's internal id (cached per process; `resource` from `keycloak.json`, the same one `fetchClientRoleNames` uses).
2. `GET clients/<cid>/roles/<name>`; on 404 and a grant, `POST clients/<cid>/roles {name, description}` and read it again. A 409 from the POST (a concurrent grant created it) is treated as success.
3. `POST` / `DELETE users/<uid>/role-mappings/clients/<cid>` with `[{id, name}]`.

The user id `<uid>` comes from the held directory entry (its Keycloak `id`); only when it is missing is it looked up by `GET users?username=<u>&exact=true`. Never `GET users` with paging (see memory `keycloak-import-on-demand`).
Alternative considered: realm roles. Rejected because the existing markers (`examParticipant`, classes, `teacher`) are client roles on the application's client, and `directoryUserRoles` already reads that client's mappings.

**D2 – Rights.** The directory-service client's service account additionally gets `realm-management` → `manage-users` (map roles) and `manage-clients` (create the client role). A 403 from any write is answered to the teacher as "missing Keycloak write rights" with a pointer to `docs-keycloak.md`, not as a generic error. If an instance prefers not to grant `manage-clients`, roles created by hand beforehand work with `manage-users` alone; the 403 on create then names exactly that.

**D3 – Endpoint.** `PUT /exam/api/courses/:id/participants/:username` with `{ held: true|false }`. Teacher/admin only (the module's existing guard), the course's year not closed, the username on the course's class's current roster. It answers the new state. The course's role name is derived on the server (`examparticipant-` + `subject.toLowerCase()`); the client never sends a role name, so this endpoint cannot be used to grant anything else.

**D4 – Immediate visibility.** After a successful write the held directory entry's `clientRoleNames` is patched in memory and the disk cache rewritten. The write itself is a user admin event, so the next freshness check will start a background refetch; that is harmless (seconds on ~2,000 accounts) and makes the patched entry authoritative again afterwards.

**D5 – Highlight data.** The answers the views already load gain a flag per person: `examParticipant: true` on gradebook rows, the gradebook student page and its neighbours, the tests' participant lists and the live snapshot (and live `change` events); the class roster's entries get `examParticipantIn: ["wmc", …]` for the class's courses. Computed from `heldDirectoryPeople()`; while the directory holds nothing, the flags are absent and the gradebook toggle is disabled with the directory's waiting notice.

**D6 – Presentation.** One CSS class `sl-exam-participant` with tokens `--sl-exam-participant-bg` / `--sl-exam-participant-fg` defined for light and dark mode in `css/exam.css`; on a `td` it colours the background, on inline names the text. The name also gets a visually hidden suffix / `title` "Matura candidate" (i18n `exam.participant.*`, BabelEdit format). The toggle is a `button` with `aria-pressed` in its own narrow column right after the name in the gradebook sheet, so the sticky name column and arrow-key navigation stay unchanged.

## Risks / Trade-offs

- [`manage-clients` is broad: the client could alter other clients] → Documented in `docs-keycloak.md`; the alternative of pre-created roles with `manage-users` only is supported by D2.
- [`manage-users` lets the directory secret write any user] → The secret already never leaves the server's environment (`deploy/.env`, not the image); the endpoint only ever maps one derived role name.
- [Tests write to the shared demo realm] → Each test withdraws what it granted in an `after` hook; the role created for a test subject (`examparticipant-<test subject>`) stays, which is harmless.
- [Subject renamed after roles were granted] → The old role stays with its holders and the course now derives a new name; nobody is highlighted until re-granted. Accepted; renames are rare and visible immediately.

## Migration Plan

1. Gerald grants `manage-users` and `manage-clients` to the directory-service service account on the demo realm and on `unterrainer`.
2. Deploy; without step 1 the toggle answers with the missing-rights message and nothing else changes.
3. Rollback: revert the code; roles already granted stay in Keycloak and keep working for document visibility.
