---
name: commit-push-after-apply-archive
description: "Nach /opsx:apply und /opsx:archive immer committen, pushen und gleich nach secureLectures mergen, ohne nachzufragen"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 8b04b061-5883-41bf-b261-e63cfdac8cfe
  modified: 2026-11-17T08:09:24.351Z
---

Nach jedem abgeschlossenen `/opsx:apply` und jedem `/opsx:archive` committen und `git push` ausführen, ohne vorher zu fragen. Ausnahme Staging: Braucht der folgende Archive-Schritt die Apply-Änderungen noch uncommittet, bleiben sie nach dem Apply nur gestagt, und nach dem Archive wird alles zusammen committet und gepusht.

**Why:** Gerald hat es am 2026-11-17 bestätigt („immer nach apply oder archive pushen ohne nachzufragen“). Vorher kam die Bitte nur über eine andere Claude-Session (overmind-gui), sie wurde aber erst nach Geralds eigener Bestätigung übernommen.

**How to apply:** Das gilt für apply und archive, nicht für bloße Proposals oder Zwischenstände; die gehen mit dem nächsten apply-Commit mit, wenn Gerald nichts anderes sagt. Direkt nach jedem solchen Push in safeLearn auch nach secureLectures mergen und pushen, ohne Nachfrage — im Checkout `/mnt/data/source/HTL/secureLectures`: `git fetch public && git merge --no-edit public/master && git push origin master`, Reihenfolge wie in [[securelectures-sync-order]]. Danach mit `gh run list -R guFalcon/secureLectures` prüfen, dass ein Deploy-Run für den neuen HEAD läuft ([[securelectures-deploy-path-filter]]). Gerald hat das am 2026-11-17 verlangt („mach das in diesem Repo auch immer gleich mit“). Merge-Konflikte oder ein fehlschlagender Push werden gemeldet, nicht blind aufgelöst.
