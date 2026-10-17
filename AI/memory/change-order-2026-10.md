---
name: change-order-2026-10
description: "Agreed order for the four open OpenSpec changes (2026-10-17): remove-convert-route → attachment-access-control → exam-module (to P4) → publishing-without-keycloak"
metadata:
  node_type: memory
  type: project
  originSessionId: b6736417-0b32-41e6-85c5-0895e5ae3980
  modified: 2026-10-17T07:51:51.266Z
---

Agreed with Gerald on 2026-10-17. The four open changes are applied in this order:

1. `remove-convert-route`: removes `/convert` (SSRF, forwards the session cookie). Archived 2026-10-17 (b819e55).
2. `attachment-access-control`: archived 2026-10-17 (46abac4). Attachments under `/md` only if at least one referencing location is visible. 399 unreferenced attachments are blocked and logged.
3. `exam-module`: **Next one to start.** One big change for the whole `AI/exam-module-plan.md`. Task groups P0 → P1 → P4 first. Task 3.10 switches the module on in secureLectures, which must happen before the grade-entry deadline **05.02.2027**. P2, P3, P6, P7 and P5 follow later.
4. `publishing-without-keycloak` (operating tier 1): only after P4 of the exam module.

**Why:** 1 and 2 close live security gaps. The gradebook (P4) carries the hard deadline. Tier 1 is not on the critical path.

**How to apply:** when Gerald asks what's next, or after archiving one of these, name the next one in this list. Delete this memory once all four are archived.

Related: [[proposals-autostart]], [[securelectures-sync-order]].
