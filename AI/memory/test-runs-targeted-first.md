---
name: test-runs-targeted-first
description: Full npm test only once at the end; after a failure rerun only the affected checks
metadata:
  node_type: memory
  type: feedback
  originSessionId: 39dbc8f6-0271-4790-9d8b-458f39bb03d8
  modified: 2026-11-11T07:13:29.076Z
---

Run the full `npm test` suite only once, as the final run. After a failure, fix it and rerun only the affected check files (`node --test test/x.test.js`, or `test/content.test.js` with `--test-name-pattern`), not the whole suite again.

**Why:** Gerald asked on 2026-11-11 (change frontmatter-properties) why the whole suite ran twice. Each full run takes long and logs in live against the shared Keycloak demo accounts.

**How to apply:** During implementation use the unit tests and targeted checks. Run the full suite at the end, and run it a second time only when the fixes after the first run reach far, or when the user asks for it. Before treating a failure as real, check [[flaky-content-checks]].
