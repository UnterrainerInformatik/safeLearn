---
name: securelectures-url-htl-dev
description: "secureLectures is served at https://htl.dev (Keycloak login via auth.htl-leonding.ac.at, realm unterrainer)"
metadata:
  node_type: memory
  type: reference
  originSessionId: 3a284703-d2d2-49bc-a3be-499d6a7396dd
  modified: 2026-11-27T21:38:03.414Z
---

secureLectures runs at https://htl.dev; its login redirects to `auth.htl-leonding.ac.at/realms/unterrainer` (client `secureLectures`). Admin pages like `/exam/photos` live there. Claude-in-Chrome's file upload only accepts files in session-readable folders (e.g. the scratchpad), not `~/webuntis-photos/`.

Related: [[securelectures-downstream-role]], [[securelectures-exam-db-restore]]
