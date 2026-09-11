---
name: docker-logs-newline-buffering
description: "docker logs (on babylon5's secureLectures deployment, likely Docker's log capture generally) buffers a line with no trailing \\n entirely — invisible until a newline finally appears or the container dies"
metadata:
  type: project
---

`process.stdout.write(".")` calls with no trailing newline, repeated over a long-running Node process, produced **zero** visible output in `docker logs -f` — confirmed with a controlled test: 15 dots written 2s apart (30s total) showed nothing in a 20s live tail. The same process's `console.log(...)` calls (each ending in `\n`) appeared immediately and reliably throughout.

**Why:** Discovered 2026-09-11 while debugging what looked like a multi-minute-to-indefinite hang in `secureLectures`' directory-search fetch (`middlewares/directory-service.js`, `fetchAllUserPages`). The pagination loop logged a bare `.` per page with no newline until the very end. Real production runs showed total silence for many minutes, occasionally followed by a sudden burst of 100+ dots all at once — which lined up exactly with the process being torn down (SIGTERM from a redeploy), not with genuine progress happening in a burst. The fetch itself was working the whole time, just invisible. Switching the per-page log to a full `console.log(...)` line (see [[securelectures-sync-order]]-tracked commit `d2fcfb4`/`2acf7f2`) fixed it immediately — pages then appeared live, one flushed line each, at a steady ~2.5s/page against this realm.

**How to apply:** Any future progress-indicator logging in this deployment (or anywhere reasoning about `docker logs` behavior on `babylon5`) must end each individual write in `\n` — never accumulate a dot/spinner-style progress indicator across multiple `process.stdout.write()` calls without a newline. If `docker logs -f` goes silent for a suspiciously long time, first check whether the code path in question is missing a trailing newline before concluding the process is actually stuck. See [[babylon5-server]] for the host; the affected container is `secureLectures`, deploy dir `/app/deploy/secure-lectures`.
