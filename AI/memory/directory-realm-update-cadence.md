---
name: directory-realm-update-cadence
description: "How often the unterrainer/HTL-Leonding realm's directory data actually changes, and who triggers it"
metadata: 
  node_type: memory
  type: project
  originSessionId: 609068fe-3304-44ba-be09-06fb9f3e165a
  modified: 2026-09-11T20:02:42.805Z
---

The `unterrainer` realm's directory data (see [[realm-directory-cleanup-investigation]]) only changes when Gerald manually triggers an update — roughly 3-4 times a year, not on any automatic schedule (consistent with `fullSyncPeriod=-1`, no periodic LDAP sync). He does this by hand and may forget to also do any accompanying step (e.g. bust a cache) at the same time.

**Why:** He said this while reviewing the directory-search cache design (count + Keycloak admin-events based staleness detection in `middlewares/directory-service.js`), to explain why he cares about automated staleness detection catching a change even when he forgets to signal it himself, rather than assuming he'd always remember to invalidate a cache manually.

**How to apply:** Real directory changes are rare and manual, so a cache that's stale for hours (or even the current 24h disk-cache bound) is not itself a practical problem — the risk this project should optimize for is Gerald forgetting to trigger any manual invalidation after his 3-4x/year update, not rapid churn. Favor automated detection (count, admin-events) that works without him remembering to do anything, over designs that rely on him signaling a change.
