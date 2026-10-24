---
name: directory-service-write-rights
description: "Since 2026-10-24 the directory-service client on the unterrainer realm can write (manage-users, manage-clients) for the examparticipant role toggle"
metadata:
  node_type: memory
  type: project
  originSessionId: d2eb55f9-160a-499d-a882-51b2a0b8f50f
  modified: 2026-10-24T13:04:21.359Z
---

On 2026-10-24 Gerald gave `service-account-safelearn-directory-service` on the `unterrainer` realm the `realm-management` roles `manage-users` and `manage-clients`, on top of `view-users`, `view-events` (and a `view-realm` that the app does not need). This is for the change `exam-participant-role`: the gradebook toggles the client role `examparticipant-<subject>` (lower case) on the `safeLearn` client and creates it when missing.

**Why:** Gerald chose to extend the existing read-only client instead of adding a separate write client.

**How to apply:** Grants and creates against `unterrainer` will now succeed for real. The shared demo realm that `npm test` uses got the same two roles the same day, so a 403 from a write points to a code or config problem, not missing rights. Related: [[directory-admin-events-enabled]], [[keycloak-bot-account]].
