---
name: realm-directory-cleanup-investigation
description: "Status and key findings of the unterrainer realm cleanup investigation (OpenSpec change realm-directory-cleanup), paused 2026-09-10 after Sections 1-2"
metadata: 
  node_type: memory
  type: project
  originSessionId: 31377303-5cea-4e1c-8772-d35a2d6decfc
  modified: 2026-09-10T20:34:06.015Z
---

The OpenSpec change `realm-directory-cleanup` investigates why the `unterrainer` Keycloak realm (`auth.htl-leonding.ac.at`, HTL Leonding's production identity source) holds 14,289 accounts against an expected ~1,530 (~1,400 students + ~130 teachers). Sections 1 (Investigation) and 2 (Retention rule) are fully done and approved by Gerald as of 2026-09-10; Sections 3–5 (dry-run report, apply, prevent recurrence) are not started — paused there deliberately, Gerald said he'd pick it up later.

**Key surprising finding**: the proposal's original hypothesis (duplicate accounts from repeated imports) was wrong — zero duplicates exist by any signal (`LDAP_ID`, `LDAP_ENTRY_DN`, email), confirmed even at a same-person-different-id level (only 3 coincidental name collisions out of 8,608 distinct names, not a re-enrollment pattern). The real cause: the realm's LDAP federation has `fullSyncPeriod`/`changedSyncPeriod` both set to `-1` — no periodic sync runs at all (confirmed by reading the federation component config directly once elevated `view-*` roles were granted). It has never pruned anyone who left since a one-time full sync on 2024-07-10 vacuumed in the entire AD OU tree (`ou=HTL,dc=EDU,dc=HTL-LEONDING,dc=AC,dc=AT`) as it stood, back to 2017. ~40% of the realm (5,699 accounts) is a frozen 2017 snapshot — evidenced by those accounts almost uniformly lacking the `firstName`/`lastName` that a later-added LDAP mapper backfilled onto every account touched since.

**Why**: This reframes the fix from a Keycloak-side heuristic classifier to fixing the federation's sync/reconciliation behavior itself — no native "remove missing users on sync" toggle exists in this Keycloak version's LDAP provider (confirmed from the actual component config schema), so task 5.2 will need either enabling periodic sync (if a version-appropriate removal mechanism exists) or an external reconciliation script.

**How to apply**: Before resuming this change, re-read `AI/openspec/changes/realm-directory-cleanup/investigation-findings.md` and `tasks.md` for full detail — this memory is just a pointer/summary, not the source of truth. Full export artifacts (with real PII) live on Gerald's own server, not in this repo — see [[babylon5-server]]. See also [[pii-handling-real-data]] for how that data was handled during the investigation.
