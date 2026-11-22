---
name: pull-before-analysis
description: "Before analyzing code behavior, check that the local checkout is current with origin; Gerald works on several machines"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9574a4a7-af40-4bc9-8691-d16a8cd07308
  modified: 2026-11-22T10:13:53.143Z
---

Before explaining how the code behaves, run `git fetch` and compare with origin (or ask). On 2026-11-22 I explained the #exam/handout behavior from a checkout ~50 commits behind, and the behavior had already changed (handout now hides #exam from participants).

**Why:** Gerald commits from other machines/sessions; the session-start git snapshot can be stale, and stale analysis leads to wrong advice.
**How to apply:** At the start of any analysis of current behavior, `git fetch && git status -sb`; if behind, say so or pull (fast-forward only, clean tree) before reading code.
