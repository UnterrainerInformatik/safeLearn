---
name: securelectures-sync-order
description: "Syncing a fix into both repos: push safeLearn first, then merge public/master into secureLectures's local master and push — no need to wait for safeLearn's build"
metadata:
  type: feedback
---

When a change needs to land in both repos — see [[securelectures-downstream-role]], it almost always should, since app code belongs upstream — sync them in this exact order:

1. Commit and push to `safeLearn`'s `master` first.
2. In `secureLectures`, merge the base/upstream remote (`public` → `UnterrainerInformatik/safeLearn`) into `secureLectures`'s local `master`, then push `secureLectures`'s `master`.

**Why:** Gerald's own stated workflow (2026-09-11) for keeping the fork's history correctly connected via a merge commit, rather than reapplying the same diff twice as two unrelated commits. That's exactly what happened earlier the same session: the directory-service token-expiry fix was committed directly to `secureLectures` first (live debugging pressure), then had to be manually re-applied to `safeLearn` as a second, disconnected commit — same change, two histories that don't know about each other.

**How to apply:** Step 2 does not need to wait for `safeLearn`'s own CI run to finish — `secureLectures` is a fork of the source, not a consumer of a built artifact, so the merge can happen the moment the push lands. Only `secureLectures`'s own deploy pipeline (triggered by its own push) actually builds and deploys anything.
