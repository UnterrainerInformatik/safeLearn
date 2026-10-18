---
name: securelectures-deploy-path-filter
description: "secureLectures's deploy workflow only runs for listed paths; a new top-level code directory must be added there or its changes never go live"
metadata:
  node_type: memory
  type: project
  originSessionId: ce14f4ad-988a-44fd-aa27-4164ff8cbd11
  modified: 2026-10-17T18:49:00.200Z
---

`guFalcon/secureLectures`'s `.github/workflows/docs-local.yml` has a `paths:` filter (upstream safeLearn's copy has none). `exam/**` was missing until 2026-10-17 (29ac855e); `i18n/**` was added on 2026-10-18 (52c303a6) with the interface catalogs. Until then, exam-module changes only deployed when `css/` or a root file changed in the same push.

**Why:** A merge that touches only an unlisted directory gives a green push but no deploy run. It looks deployed when it isn't.

**How to apply:** After merging into secureLectures, check that `gh run list -R guFalcon/secureLectures` shows a run for the new HEAD. If upstream adds a new code directory that lands in the image (see `Dockerfile` COPY lines), add it to the filter downstream. Related: [[securelectures-sync-order]], [[securelectures-downstream-role]].
