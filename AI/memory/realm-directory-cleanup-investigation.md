---
name: realm-directory-cleanup-investigation
description: "Outcome of the unterrainer realm cleanup investigation (OpenSpec change realm-directory-cleanup, archived 2026-09-12): the realm is 84% synthetic test data, not stale people"
metadata:
  node_type: memory
  type: project
---

The OpenSpec change `realm-directory-cleanup` investigated why the `unterrainer` Keycloak realm (`auth.htl-leonding.ac.at`, HTL Leonding's production identity source) held 14,289 accounts against an expected ~1,530. **Closed and archived 2026-09-12** under `AI/openspec/changes/archive/2026-09-12-realm-directory-cleanup/`; the invariants it produced live on as the `realm-directory-integrity` capability.

**Answer**: 84% of the realm (12,060 accounts) is a synthetic `OU=TestUsers` fixture — see [[keycloak-testusers-ou-discovery]]. The real population is 2,228. Both of the change's original hypotheses were wrong: zero duplicate accounts exist by any signal (`LDAP_ID`, `LDAP_ENTRY_DN`, email, and same-person-different-id via name grouping), and the retention gap is one un-retired cohort (+317 students, +110 teachers), not thousands of stale accounts.

**Two earlier readings were retracted on the way** — worth knowing, because both were confidently written up before the OU distribution was ever aggregated: the `createTimestamp` spikes in 2017/2021/2023 read as "AD bulk migration events" are 88–97% test accounts, and the "frozen 2017 pre-mapper snapshot, ~40% of the realm" was the same fixture measured a second way. Aggregating the DN's OU segments would have answered the question on day one.

**Why the remedy moved**: no Keycloak-side cleanup can hold, because enumerating the admin API re-imports from LDAP on demand — see [[keycloak-import-on-demand]]. The fix is narrowing the federation's `usersDn`, which is the still-open LDAP-split entry in `AI/open-proposals.md` (blocked on the AD bind password). The recurrence guards the change asked for shipped along the way in the directory fetch: enumeration capped at `users/count` (`0072059`) and count-based change detection (`8b3231e`).

**How to apply**: this is the closed summary — for the full evidence read `investigation-findings.md` in the archived change, whose final "Correction (2026-09-12)" section supersedes everything above it. Export artifacts with real PII stayed on Gerald's own server, see [[babylon5-server]] and [[pii-handling-real-data]].
