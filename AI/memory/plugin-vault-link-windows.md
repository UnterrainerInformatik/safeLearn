---
name: plugin-vault-link-windows
description: "Der Vault-Link auf das Plugin gehört nicht ins Repo; eingecheckt wird er unter Windows zur 53-Byte-Datei und lässt jede Plugin-Installation in Obsidian ewig hängen"
metadata:
  type: project
---

`.obsidian/plugins/safelearn-formatter` ist der Link, über den ein safeLearn-Vault das Plugin sofort sieht (siehe [[plugin-update-paths]]). In **diesem** Repo war er nie getrackt, in `secureLectures` schon — dort lag er **als Symlink im Index**, mit dem absoluten Linux-Pfad `/mnt/data/source/JAVASCRIPT/safeLearn-Obsidian-plugin` als Ziel. Git auf Windows steht auf `core.symlinks=false` und legt einen solchen Symlink als **normale 53-Byte-Textdatei** an, die den Pfad als Inhalt hat.

Damit steht eine **Datei** dort, wo Obsidian einen **Ordner** erwartet, und beides bricht:

* Das Plugin lädt nicht — es gibt keine lesbare `manifest.json`.
* Jede Installation aus dem Community-Store **hängt für immer**: Die Notice „Installing plugin …" bleibt stehen, der Spinner dreht weiter, der Button sagt weiter „Install". Obsidians `installPlugin()` wirft in Wahrheit sofort `ENOENT: … \safelearn-formatter\manifest.json` — ein Pfad kann nicht durch eine Datei hindurch absteigen — aber die Rejection wird **nirgends angezeigt**, sie landet nur in der Devtools-Konsole. Deshalb sieht es wie ein Hänger aus und nicht wie ein Fehler.

Seit 2026-08-18 steht der Pfad hier **in `.gitignore`**, genau wie `AI/plugin`, damit er gar nicht erst eingecheckt werden kann — er wird pro Installation gesetzt:

```
# Linux/macOS
ln -sfn <pfad-zum-plugin-checkout> .obsidian/plugins/safelearn-formatter
# Windows (Junction, braucht keine Admin-Rechte)
New-Item -ItemType Junction -Path .obsidian\plugins\safelearn-formatter -Target C:\source\java\safeLearn-Obsidian-plugin
```

**Why:** Ein absoluter Pfad einer einzelnen Maschine gehört nicht ins Repo — auf jedem anderen Rechner ist er falsch, und auf Windows ist er nicht bloß tot, sondern blockiert aktiv die Reparatur über den Store. Nachgewiesen mit drei frischen Store-Installationen per Puppeteer gegen Obsidian 1.13.7: leerer Vault installiert in ~1 s, derselbe Vault mit der 53-Byte-Datei hängt nach 45 s noch, nach Löschen der Datei installiert er wieder in ~1 s.

**How to apply:** Meldet Gerald „das Plugin hängt bei der Installation" oder „aktualisiert sich nicht", **zuerst prüfen, ob `.obsidian/plugins/safelearn-formatter` wirklich ein Ordner ist** — nicht bei Releases, Store-Index oder Netzwerk anfangen. Dasselbe Muster kann in jedem Vault liegen, in den die Datei einmal kopiert oder gesynct wurde; am 2026-08-18 lag sie in `secureLectures` und in `elite-wiki` (über OneDrive) und wurde dort entfernt. Der Devtools-Konsolenfehler in Obsidian ist der schnellste Beleg. Siehe [[plugin-repo-link]] und [[plugin-release-process]].
