---
name: directory-admin-events-enabled
description: Admin Events are on (30 days) on the unterrainer realm; directory-service client now also holds view-events
metadata: 
  node_type: memory
  type: project
  originSessionId: 609068fe-3304-44ba-be09-06fb9f3e165a
  modified: 2026-09-11T20:02:53.836Z
---

As of 2026-09-11, Gerald enabled Admin Events on the `unterrainer` realm (`auth.htl-leonding.ac.at`) with a 30-day expiration, and granted the `directory-service` confidential client's service account the `view-events` realm-management client role (in addition to its existing `view-users`). Documented in `docs-keycloak.md` under "Directory search client".

**Why:** Unblocks the directory cache's change-detection design in `middlewares/directory-service.js` — `GET .../admin-events?resourceTypes=USER&max=1` lets the disk-cache reuse check ask "has anything changed since caching" instead of only comparing `GET /users/count`, which misses a role/class reassignment on an existing user. See [[realm-directory-cleanup-investigation]] for why LDAP-side changes still won't show up here (no periodic sync).

**How to apply:** When implementing or debugging that admin-events check against the real `unterrainer` realm, assume this config is already in place — don't re-ask Gerald to enable it. A different realm (e.g. a local dev Keycloak) likely does NOT have this configured; the code must fall back gracefully to count+TTL when the admin-events call fails or is forbidden.
