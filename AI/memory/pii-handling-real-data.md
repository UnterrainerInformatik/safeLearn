---
name: pii-handling-real-data
description: "How to handle real student/staff PII from HTL Leonding's production systems in this repo — never print individual records, aggregate only"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 31377303-5cea-4e1c-8772-d35a2d6decfc
  modified: 2026-09-10T20:34:30.606Z
---

When investigating or processing real production data containing student/staff PII (e.g. the `unterrainer` Keycloak realm), never print individual records (names, emails, DNs) to bash/tool output — write full exports to files and only print or report aggregate counts/statistics. The Claude Code auto-mode classifier actively blocks bash commands that print individual PII records, and also blocks large bulk-PII-pull operations until the user explicitly confirms.

**Why**: Confirmed repeatedly during the realm-directory-cleanup investigation (2026-09-10, see [[realm-directory-cleanup-investigation]]) — commands printing sample user JSON (names/emails) were blocked by the classifier every time; redesigning analysis scripts to compute and print only aggregate JSON (counts, distributions, boolean presence checks) resolved it every time and is also just better hygiene for a real school's data. This is expected, correct classifier behavior, not a bug to route around.

**How to apply**: Any future script touching this realm's data (or similar real student/staff data) should default to file-based aggregation, with raw PII files kept out of git and clearly labeled as PII when handed off (e.g. to the user's own server, see [[babylon5-server]]) rather than printed inline in the conversation or tool output.
