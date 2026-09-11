---
name: securelectures-downstream-role
description: "secureLectures ist Downstream von safeLearn; dort gehören nur md/-Inhalt, deployment-spezifische Config und das Entfernen von Test-Files hin — jede App-Entscheidung gehört upstream nach safeLearn"
metadata:
  node_type: memory
  type: feedback
---

Neben safeLearn gibt es ein zweites, abgeleitetes Repo: **secureLectures** (`guFalcon/secureLectures`, auf der Windows-Maschine `C:\source\java\htl\secureLectures`). Es teilt die Historie mit safeLearn und holt Stände über sein Remote `public` → `UnterrainerInformatik/safeLearn`. **safeLearn ist Upstream, secureLectures ist Downstream.**

In secureLectures gehören genau drei Arten von Änderung:

* **Test-Files entfernen**
* **`md/`-Inhalt** (die eigentlichen Unterrichtsmaterialien dieser Instanz)
* **deployment-spezifische Config** (Secrets, `.github/workflows`-Env-Werte, `docker-compose`/`deploy/`-Config, `keycloak.json` dieser Instanz — Dinge, die es upstream gar nicht geben kann, weil sie pro Deployment eindeutig sind)

Mehr nicht. Alles andere — Anwendungs-Code (`middlewares/`, `app.js`, ...), `.gitignore`, Memory, Proposals, Specs, alles am Plugin — ist eine **App-Entscheidung und gehört upstream nach safeLearn**, von wo sie per Merge herunterkommt.

**Why:** Die beiden Repos sind nicht zwei Checkouts desselben Stands, sondern App und abgeleiteter Vault. Was downstream entschieden wird, geht beim nächsten Merge entweder verloren oder kollidiert mit dem, was upstream längst anders gelöst wurde — und es steht dann an einer Stelle, an der niemand danach sucht, weil die Quelle der Wahrheit safeLearn ist.

**How to apply:** Zu Beginn einer Session prüfen, in welchem Repo wir stehen (`git remote -v`: `origin` → `guFalcon/secureLectures` heißt Downstream). Geht die Aufgabe über md-Inhalte, deployment-Config oder das Entfernen von Tests hinaus, **nach safeLearn wechseln, bevor die erste Datei angefasst wird** — nicht dort arbeiten und danach portieren. Am 2026-08-18 lag der Windows-Junction-Fix (`.gitignore` plus zwei Memory-Files) versehentlich in secureLectures und musste nachträglich herübergetragen werden; am 2026-09-11 dasselbe nochmal mit dem directory-service-Token-Fix (Live-Debugging-Druck, siehe [[securelectures-sync-order]] für die Sync-Reihenfolge danach). Die Arbeit war jedes Mal dieselbe, nur zweimal. Siehe [[plugin-repo-link]] und [[plugin-vault-link-windows]].
