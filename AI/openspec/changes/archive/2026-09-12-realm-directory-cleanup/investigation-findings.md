## Investigation findings (tasks 1.2–1.6)

Source: live read-only export of the `unterrainer` realm at `auth.htl-leonding.ac.at`, taken 2026-09-10 via a service account (`secureLectures` client, resource-owner-password grant, `view-users` client role only). Full census, 14,289/14,289 accounts (`briefRepresentation=true`, paginated). No raw export (names/emails/DNs) is committed anywhere — aggregate counts only, computed in a local scratchpad and discarded after this write-up.

### 1.2 — Export

Pulled successfully: `id`, `username`, `email`, `enabled`, `createdTimestamp` (Keycloak-side import date) plus the LDAP attributes `LDAP_ENTRY_DN`, `LDAP_ID`, `createTimestamp` (LDAP-side, the AD `whenCreated`-equivalent), `modifyTimestamp` for all 14,289 accounts.

- Total: 14,289 (14,060 enabled / 229 disabled) — matches the live `users/count` census within 1 (ongoing drift since the design-doc snapshot).
- 14,282 accounts (99.95%) are federated (carry `LDAP_ENTRY_DN`/`LDAP_ID`); 7 have neither — these are the manually-created, non-LDAP accounts the retention rule must exempt.

### 1.3 — Stable identity signal: confirmed

`LDAP_ID` (an AD object GUID) and `LDAP_ENTRY_DN` (the distinguished name) are **both fully unique across the realm** — every one of the 14,282 federated accounts has a distinct value for each. Either is usable as the stable external signal required by `realm-directory-integrity`'s "One enabled account per person" requirement. Institutional email is present on only 1,127/14,289 accounts (mostly teachers) — too sparse to be the primary signal, usable only as a fallback for the 7 non-federated accounts if they ever need matching.

The 7 accounts missing both `LDAP_ID` and `LDAP_ENTRY_DN` are exactly the manually-created accounts referenced in the proposal/design — they should never be touched by any LDAP-driven cleanup or reconciliation logic.

### 1.4 — Duplicate accounts: **zero found**

Grouping the full export by `LDAP_ID`, by `LDAP_ENTRY_DN`, and by email independently: **0 duplicate groups on all three signals.** No person holds two enabled accounts in this realm today.

**This overturns the proposal's leading hypothesis.** The ~9.5x gap between the realm's size (14,289) and HTL Leonding's expected active-account count (~1,530: ~1,400 students + ~130 teachers, per Gerald) is not caused by duplicate imports of the same person — it is caused by the realm never retiring anyone. The problem this change needs to solve is retention, not deduplication. (The spec's "One enabled account per person" requirement is still worth keeping as an invariant going forward — it costs nothing and catches a real failure mode if the import process ever changes — but it is not the active problem today.)

### 1.5 — Enrollment-status signal: no clean signal found in Keycloak's own data

Three candidate signals were checked, using only the exported (Keycloak-side) data:

1. **OU / class code in the DN** (e.g. `7ABIF`, `5AHIF`, `Teachers`, `Matura`) — this is a **relative** label (year-in-program + class + department) that is reused every school year. It does not embed an absolute cohort/graduation year, so "delete everyone in OU X" would delete this year's current class, not a specific past one. Not usable alone.
2. **LDAP `createTimestamp`** (AD's real object-creation date, distinct from Keycloak's own import date) — year distribution: 2017: 5,699; 2018: 974; 2019: 212; 2020: 260; 2021: 2,158; 2022: 318; 2023: 4,032; 2024: 312; 2025: 317. The two large spikes (2017 and 2023) are far too big to be one year's intake (~280–300/year, based on Gerald's ~1,400-students-over-5-years estimate) and look like AD-side bulk migration/re-creation events rather than organic enrollment. **Low confidence** as a standalone "when did this person enroll" signal without IT confirming what happened to the AD forest around those two dates.
3. **LDAP `modifyTimestamp`** — hypothesized as "last confirmed present at a sync run," but it does not cluster around Keycloak's known import dates; it also has its own anomalous spike (864 accounts sharing the exact date 2018-03-20). It reflects real AD-side attribute changes, not sync confirmation. **Not usable** for this purpose.

**Conclusion for 1.5**: none of the three signals available from Keycloak's own stored copy reliably distinguishes currently-enrolled from no-longer-enrolled people, because the underlying AD data itself carries unexplained bulk-event artifacts. The only trustworthy source of "is this person still enrolled" is the **live source LDAP directory itself** — which is exactly what Gerald already described wanting: the LDAP federation sync should reconcile against live LDAP on every run (delete anyone no longer present there, except manually-created accounts, which by definition aren't in LDAP to begin with). This isn't a fallback — it's the correct mechanism, and it sidesteps the timestamp data-quality problems entirely because it asks the source of truth directly instead of guessing from historical snapshots.

This could not be verified further with the current credentials: `view-users` does not include `view-realm`, so the LDAP User Federation component config (sync period, whether "remove missing users" is enabled) is not readable via this service account (`GET .../components?type=...UserStorageProvider` → 403). Confirming and changing that configuration needs realm-admin access in the Keycloak console.

### 1.6 — Realm composition summary

- 14,289 total (14,060 enabled / 229 disabled), 14,282 federated / 7 manual.
- Teachers OU: 241 accounts (vs. Gerald's ~130 expectation — includes historical/former staff, not audited further here).
- ~20+ distinct class OUs (`1AHIF`, `5BHIF`, `7ABIF`, etc.), 38–73 accounts each, plus a 99-account `Matura` group (final-exam candidates).
- No account count decays over the 2017–2025 span the way a 5-year program with proper retirement would — accounts persist indefinitely once created.

**Confidence**: high on 1.2/1.3/1.4 (directly measured, zero ambiguity). Low on any Keycloak-side enrollment-date heuristic (1.5) — recommend not building automation on `createTimestamp`/`modifyTimestamp` without IT explaining the 2017/2023/2018-03-20 spikes first.

### Follow-up: name-based re-enrollment test and federation config (2026-09-10, later same day)

After the retention rule was approved (2.1–2.3), Gerald raised a sharper version of 1.5: does a continuing student keep one persistent account across years (OU updated in place), or does re-enrollment create a fresh LDAP object each year — which would make the earlier "zero duplicates" finding (1.4) misleading, since same-person-different-id pairs wouldn't be caught by `LDAP_ID`/`LDAP_ENTRY_DN` matching. Testing this needed `firstName`/`lastName`, which are populated in the realm (Gerald: mapped via a `givenName`→`firstName` LDAP attribute mapper, used in secureLectures for visibility) but were not visible to the investigation's original `view-users`-only service account — first found to be omitted even from `briefRepresentation=false`, then confirmed to be a permission gap, not a data gap, once Gerald granted the bot account every `view-*` realm-management role. This also unblocked reading the LDAP federation's own component config, previously 403.

**Full-representation export** (all 14,289 accounts, `firstName`/`lastName` included) was run from Gerald's own server (`babylon5`, not this repo's environment) via two scripts handed off for that purpose. Findings, from `realm_report_full.json`:

- **Re-enrollment-creates-a-new-id is not what's happening.** Grouping all 8,608 distinct `(firstName, lastName)` pairs, only 3 pairs (6 accounts total) map to more than one `LDAP_ID` — consistent with ordinary name coincidence in a population this size, not a pattern. Essentially every person has exactly one account for their entire time at the school; the OU is updated in place as they advance. This confirms 1.4's zero-duplicates finding also holds under a same-person-different-id lens, not just literal id/DN matching.
- **The 2017 `createTimestamp` batch (5,699 accounts, ~40% of the realm) is a frozen, pre-mapper snapshot.** Cross-tabulating name presence against LDAP `createTimestamp` year: 2017 has only 71/5,699 (1%) accounts with a name; every other year has essentially all of them (2018: 967/974, 2021: 2,120/2,158, 2023: 4,031/4,032, 2024: 312/312, 2025: 317/317). The `givenName`→`firstName` mapper was clearly added after the 2017 batch was imported and has applied to every account touched since — meaning the 2017 batch has not been touched by any sync or re-import since the mapper existed. This is strong, Keycloak-data-only evidence that most of the 2017 batch is stale (near-certainly people no longer at the school), independent of the timestamp-anomaly caveats in 1.5 above.

**LDAP federation component config** (`GET /admin/realms/unterrainer/components?type=...UserStorageProvider`, now readable):

- `fullSyncPeriod: -1` and `changedSyncPeriod: -1` — **no periodic sync is configured at all.** Nothing runs on a schedule.
- `lastSync: 1760861721` → 2025-10-19 — matches one of the small `createdTimestamp` clusters found in 1.5, confirming that date was a real (manually triggered, most likely) sync.
- `editMode: UNSYNCED` — confirms Gerald's statement: Keycloak never writes back to LDAP.
- `usersDn: ou=HTL,dc=EDU,dc=HTL-LEONDING,dc=AC,dc=AT` — a broad scope covering the whole HTL OU tree, including the `Special`/`service` outliers seen in the OU distribution.
- `importEnabled: true`, no `removeInvalidUsersEnabled` (or equivalent) key exists anywhere in this component's config schema.

**Revised causal story for 1.1/5.1**: the 2024-07-10 event (13,656 accounts at once) was almost certainly a one-time full sync — plausibly when this realm was first stood up for secureLectures — that imported the entire `ou=HTL` subtree as it stood at that moment, including everyone AD had ever held since 2017, active or not. Since then, with periodic sync disabled, new Keycloak accounts have only appeared via on-demand import at first login (standard Keycloak LDAP federation behavior when `importEnabled=true`) — explaining the smaller, irregular later date clusters. **No periodic reconciliation against LDAP has run since that one-time import**, so even if the school's AD itself removes people when they leave (not confirmed — out of scope to check from here), Keycloak's local copy would never find out.

**Implication for 5.2**: there is no native "remove missing users" toggle in this Keycloak version's LDAP provider — confirmed by inspecting the actual config schema, not assumed. The fix cannot be "flip a setting"; it needs either (a) enabling periodic full sync and confirming whether this Keycloak version's sync process removes locally-imported users no longer found in LDAP (needs a version-specific check, not assumed here), or (b) an external job that triggers a sync and separately reconciles/removes accounts absent from a live LDAP query, respecting the manually-created-account exemption.

### Revised direction for tasks 2–5

Given 1.4/1.5, the effective fix is closer to "make the LDAP federation sync reconcile against live LDAP (delete on disappearance, except manually-created accounts)" — which is what Gerald described wanting — rather than a heuristic Keycloak-side report built on the timestamp signals above. Task 2 (retention rule) and task 5 (fix recurrence) likely converge on the same mechanism: get the federation sync's own removal behavior confirmed/enabled, and use one authoritative "run it and see what it removes" as the task 3 dry-run report, instead of an independently-built heuristic classifier.

---

## Correction (2026-09-12): 84% of the realm is synthetic test data, and enumeration imports on demand

Two findings from 2026-09-12 supersede the interpretation above. Both came from data the earlier investigation never looked at: the OU distribution itself, and the realm's behaviour while being paginated.

### The realm is not 14,289 people

Aggregating the `OU=` segments of `attributes.LDAP_ENTRY_DN` across the production directory cache (`directory-cache.json`, written 2026-09-11 after the fetch fixes, the first full fetch that ever completed) gives:

- **12,060 of 14,289 accounts (84%) sit under `OU=TestUsers`** — sub-OUs `testA`…`testK`, each holding exactly 36 entries. A synthetic test fixture, not people.
- **2,228 accounts are real**: 1,717 students (1,668 enabled / 49 disabled), 240 teachers (171 enabled / 69 disabled), ~271 other (Exams/Matura/Admin/Special).

**This retracts the central claim of 1.5 and 1.6.** The `createTimestamp` spikes read there as AD-side bulk migration events are overwhelmingly the test fixture: of the 5,699 accounts dated 2017, 5,508 (97%) are TestUsers — only 191 are real. Same for 2021 (1,908/2,158 = 88% test) and 2023 (3,744/4,032 = 93% test). Once the test accounts are excluded, the real population spreads evenly across 2017–2025 at roughly 74–320 per year, which is what an ordinary school population looks like. The "frozen 2017 snapshot" argument from the 2026-09-10 follow-up — 1% name coverage in the 2017 batch versus ~100% everywhere else — measured the same artifact: the fixture was imported before the `givenName`→`firstName` mapper existed and has never been touched since, which says nothing about real former students.

The ~9.5x gap in the proposal's "Why" therefore had a mundane cause. What remains of Gerald's original hypothesis is real but an order of magnitude smaller: **+317 students** (1,717 against ~1,400 expected) and **+110 teachers** (240 against ~130) — roughly one un-retired graduating cohort plus accumulated former staff. Also noted: real classes include years 6 and 7 (`7ABIF` — Aufbaulehrgänge), so the "5-year program" assumption behind the ~1,400 estimate is itself slightly low.

### Reading the realm changes it

Proven live against `unterrainer` on 2026-09-12: **paginating `GET /admin/realms/{realm}/users` is not a read-only operation.** The realm's count rose from 2,229 to 2,619 (+390) through pagination alone, with no sync running.

`users/count` counts only Keycloak's local database. `GET /users?first=…` spans the local database **and** the LDAP federation: when a requested page reaches past the local end, Keycloak asks the LDAP provider for the remainder and — with `importEnabled: true` — persists every record it gets back. Hence a full page of 100 at `first=2200` against a count of 2,229, with every record past the count distinct rather than duplicated.

`fullSyncPeriod: -1` does not protect against this. It governs only the scheduled background job, not this path; an ordinary login or an admin-console search imports the same way. This corrects an assumption held on both sides (Gerald, 2026-09-12: *"das ldap federation ist auf manual sync gestellt. das darf garnix holen eigentlich"*).

Retroactively this explains two things:

- The "phantom end" at `first=14288` that commit `0072059` fenced off with a hard stop was never a corrupt record or a Keycloak bug. It was the boundary between the local database and LDAP territory.
- **No Keycloak-side cleanup can hold.** The 12,060 test accounts remain in AD under `OU=TestUsers`; deleting them locally only means the next deep page — or the next login — pulls them back. The 2024-07-10 one-time full sync laid the groundwork (`usersDn` = the whole `ou=HTL` tree, test OU included); the directory fetch was the re-acquisition path, not the origin.

### What this means for tasks 3–5

The remedy is not a Keycloak-side report of accounts to delete. It is **narrowing the federation's own scope** so the test fixture is never in reach: `usersDn` restricted to the OUs that hold real people. That work is specified and half-executed already — see `AI/open-proposals.md`, "Realm auf zwei LDAP-Provider aufteilen", which splits the federation into `ldap-students` and `ldap-teachers` and carries the ordered procedure, the rollback point (175 backed-up user attribute sets), and the expected end state (~1,958 federated accounts + 7 local). It is blocked only on the AD bind password.

Two invariants worth keeping from this investigation, both now in the spec:

1. The federation's scope must cover only OUs that hold real people — a scope that reaches synthetic or unrelated OUs makes every downstream count and every cleanup meaningless.
2. Any enumeration over the admin API must be capped at a previously fetched `users/count`, so it stays inside the local database and imports nothing. `fetchAllUserPages` has done this since `0072059`.
