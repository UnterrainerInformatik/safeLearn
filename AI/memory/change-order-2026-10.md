---
name: change-order-2026-10
description: "Agreed order for the four open OpenSpec changes (2026-10-17): remove-convert-route → attachment-access-control → exam-module (to P4) → publishing-without-keycloak"
metadata:
  node_type: memory
  type: project
  originSessionId: b6736417-0b32-41e6-85c5-0895e5ae3980
  modified: 2026-10-17T15:30:00.000Z
---

Agreed with Gerald on 2026-10-17. The four open changes are applied in this order:

1. `remove-convert-route`: removes `/convert` (SSRF, forwards the session cookie). Archived 2026-10-17 (b819e55).
2. `attachment-access-control`: archived 2026-10-17 (46abac4). Attachments under `/md` only if at least one referencing location is visible. 399 unreferenced attachments are blocked and logged.
3. `exam-module`: in progress. One big change for the whole `AI/exam-module-plan.md`. P0 → P1 → P4 are done, and task 3.10 switched the module on in secureLectures on 2026-10-17, well before the grade-entry deadline **05.02.2027**. P2 (question pool) is done and imported in production since 2026-10-17. P3, P6, P7 and P5 follow.
4. `publishing-without-keycloak` (operating tier 1): only after P4 of the exam module, so it is unblocked since 2026-10-17. Whether it comes before or after P2 is Gerald's call.

**Why:** 1 and 2 close live security gaps. The gradebook (P4) carries the hard deadline. Tier 1 is not on the critical path.

**How to apply:** when Gerald asks what's next, or after archiving one of these, name the next one in this list. Delete this memory once all four are archived.

Related: [[proposals-autostart]], [[securelectures-sync-order]].
