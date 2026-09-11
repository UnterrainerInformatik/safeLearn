---
name: babylon5-server
description: "Gerald's own server, SSH alias `babylon5`, used for long-running background jobs he doesn't want tied to his local machine"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 31377303-5cea-4e1c-8772-d35a2d6decfc
  modified: 2026-09-10T20:34:12.804Z
---

`babylon5` (10.10.196.2) is Gerald's own server, reachable via a pre-configured SSH alias (`~/.ssh/config`, user `psilo`, key `~/.ssh/babylon5_ecdsa`). He uses it to run long-running scripts detached (`nohup ... &`) so he can shut down his local machine — e.g. the realm-directory-cleanup investigation's full-representation Keycloak export ran there under `~/scripts/realm-directory-cleanup/`. See [[realm-directory-cleanup-investigation]].

**How to apply**: When a task needs a long-running background job outside this session's own lifetime, or Gerald asks to run something "detached" so he can turn off his computer, use `ssh babylon5 ...` and put scripts under `~/scripts/<topic>/` on that host. Avoid passing secrets inline in ssh one-liners (they land in shell history) — write them to a chmod-600 env file on the remote host and `source` it instead. A bare `nohup cmd & disown` inside an ssh one-liner can leave the local ssh foreground call hanging even though the remote process is correctly detached — verify with a fresh `ssh babylon5 "pgrep -af ..."` rather than waiting on the original call.
