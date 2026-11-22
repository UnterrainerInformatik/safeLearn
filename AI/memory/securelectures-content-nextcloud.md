---
name: securelectures-content-nextcloud
description: "secureLectures' real Markdown content lives in the Nextcloud share, not in the repo checkout's md/"
metadata:
  node_type: memory
  type: reference
  originSessionId: f0f5af1a-86ab-492d-b727-4de08647427a
  modified: 2026-11-22T00:00:00.000Z
---

The actual content of secureLectures (what Gerald edits and what is served) lives in the Nextcloud share at `/mnt/data/nextcloud/secureLectures/` (e.g. `teachers/Linklist.md`; corrected 2026-11-22, the older note said `/home/psilo/nextcloud/secureLectures/`, which does not exist on this machine), not in `~/source/htl/doc/secureLectures/md/`.

**Why:** Looking only in the repo checkout found nothing for a file Gerald referred to (2026-11-11).
**How to apply:** When Gerald names a secureLectures page/file, look in the Nextcloud share first. Related: [[securelectures-downstream-role]].
