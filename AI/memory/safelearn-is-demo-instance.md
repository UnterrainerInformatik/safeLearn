---
name: safelearn-is-demo-instance
description: "Die \"Demo-Instanz\" ist safeLearn selbst (eigener Deploy, eigene Secrets), nicht secureLectures"
metadata:
  node_type: memory
  type: project
  originSessionId: 9e774a8d-c269-458a-9275-a17da5e2de75
  modified: 2026-11-10T10:30:04.211Z
---

Wenn in Proposals/Specs von der „Demo-Instanz“ die Rede ist, ist das **safeLearn selbst**: Es deployt aus `UnterrainerInformatik/safeLearn` mit eigenen GitHub-Secrets (`SESSION_SECRET`, `KEYCLOAK_FILE`, Docker-Hub-Image). secureLectures ist eine zweite, eigenständige Instanz mit eigenem Image und eigenen Secrets.

**Why:** Gerald musste das am 2026-11-10 klarstellen. Ich hatte nach dem Archiv von `secrets-out-of-image` die Rotation so formuliert, als wäre die Demo-Instanz etwas anderes und ihr Deploy stünde noch aus.

**How to apply:** Den Deploy-Status der Demo über `gh run list -R UnterrainerInformatik/safeLearn` prüfen. Bei Secret-Themen immer beide Instanzen getrennt betrachten. Siehe [[securelectures-downstream-role]].
