---
name: securelectures-downstream-role
description: "secureLectures ist Downstream von safeLearn; dort werden nur Test-Files entfernt und md/-Files ergänzt — jede App-Entscheidung gehört upstream nach safeLearn"
metadata:
  node_type: memory
  type: feedback
---

Neben safeLearn gibt es ein zweites, abgeleitetes Repo: **secureLectures** (`guFalcon/secureLectures`, auf der Windows-Maschine `C:\source\java\htl\secureLectures`). Es teilt die Historie mit safeLearn und holt Stände über sein Remote `public` → `UnterrainerInformatik/safeLearn`. **safeLearn ist Upstream, secureLectures ist Downstream.**

In secureLectures gehören genau zwei Arten von Änderung:

* **Test-Files entfernen**
* **`md/`-Files hinzufügen**

Mehr nicht. Alles andere — Code, `.gitignore`, Memory, Proposals, Specs, alles am Plugin — ist eine **App-Entscheidung und gehört upstream nach safeLearn**, von wo sie per Merge herunterkommt.

**Why:** Die beiden Repos sind nicht zwei Checkouts desselben Stands, sondern App und abgeleiteter Vault. Was downstream entschieden wird, geht beim nächsten Merge entweder verloren oder kollidiert mit dem, was upstream längst anders gelöst wurde — und es steht dann an einer Stelle, an der niemand danach sucht, weil die Quelle der Wahrheit safeLearn ist.

**How to apply:** Zu Beginn einer Session prüfen, in welchem Repo wir stehen (`git remote -v`: `origin` → `guFalcon/secureLectures` heißt Downstream). Geht die Aufgabe über md-Inhalte oder das Entfernen von Tests hinaus, **nach safeLearn wechseln, bevor die erste Datei angefasst wird** — nicht dort arbeiten und danach portieren. Am 2026-08-18 lag der Windows-Junction-Fix (`.gitignore` plus zwei Memory-Files) versehentlich in secureLectures und musste nachträglich herübergetragen werden; die Arbeit war dieselbe, nur zweimal. Siehe [[plugin-repo-link]] und [[plugin-vault-link-windows]].
