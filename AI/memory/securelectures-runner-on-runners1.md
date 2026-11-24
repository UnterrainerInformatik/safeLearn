---
name: securelectures-runner-on-runners1
description: "secureLectures' self-hosted GitHub runner lives on SSH host runners1 (container ghar-priv-secure-lectures), not on babylon5; a hung broker listener is fixed by restarting the container"
metadata:
  node_type: memory
  type: reference
  originSessionId: 4852638f-c15c-4556-8c19-0521cbc26b98
  modified: 2026-11-24T08:16:07.456Z
---

The self-hosted runner for secureLectures (`runners1-runner5-priv-secure-lectures`) runs on SSH host `runners1` in Docker container `ghar-priv-secure-lectures`. On [[babylon5-server]] the matching entry in `~/scripts/github-runner/docker-compose.yml` is commented out — don't look there.

Failure seen 2026-11-24: after a job finished, the listener got broker timeouts (`broker.actions.githubusercontent.com`), logged "Back off … 4 attempt left" and then went silent. GitHub still showed the runner as online and idle, but the remaining jobs stayed queued. Diagnosis: `docker exec ghar-priv-secure-lectures tail _diag/Runner_*.log`. Fix: `ssh runners1 docker restart ghar-priv-secure-lectures`; the queued jobs are picked up within seconds.

**How to apply:** if a secureLectures run sits queued while the runner reports online, check the runner log on runners1 and ask Gerald before restarting (the auto-mode classifier blocks it without approval).
