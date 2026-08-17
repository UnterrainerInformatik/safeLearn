---
name: plugin-update-paths
description: "Der safeLearn-Vault sieht das Plugin über einen Symlink sofort, alle anderen Vaults erst wenn Obsidians Index nachzieht — rund einen Tag später"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3f5bbe7-46cd-48b3-a61f-d9b7169e7340
  modified: 2026-08-17T15:50:10.179Z
---

Das Plugin erreicht Obsidian auf **zwei verschiedenen Wegen**, und die werden leicht verwechselt:

**1. Der safeLearn-Vault — sofort, über den Symlink.** `.obsidian/plugins/safelearn-formatter` zeigt direkt auf den Plugin-Checkout. Ein `npm run build` schreibt `main.js` also unmittelbar in den Plugin-Ordner dieses Vaults, und die `manifest.json` dort ist dieselbe Datei, die beim Versions-Bump editiert wird. Nach einem Refresh steht die neue Version da — **auch ohne jedes Release**.

**2. Alle anderen Vaults — über den Community-Store, mit Verzögerung.** `safelearn-formatter` ist ein veröffentlichtes Community-Plugin (Eintrag in `obsidianmd/obsidian-releases` → `community-plugins.json`, ohne Versionsangabe). Für ein Update ist an diesem Repo **nichts** zu tun, kein PR — Updates laufen automatisch über die GitHub-Releases. Aber der Sammel-Check „Nach Updates suchen" liest Obsidians eigenen Index (`community-plugin-stats.json`), und der wird von deren Crawler nur periodisch aktualisiert.

**Why:** Am 2026-08-17 wurde 1.0.2 veröffentlicht und war im safeLearn-Vault sofort da — was fälschlich als Bestätigung gelesen wurde, dass das Release trägt. In Geralds anderen Vaults meldete „Nach Updates suchen" jedoch stundenlang nichts. Geprüft war alles korrekt: Community-Eintrag vorhanden, `manifest.json` auf `master` und im Release-Asset auf 1.0.2, Latest-Release ohne Draft-Flag mit allen drei Assets, `minAppVersion` unverändert 1.5.7. Nur Obsidians Index stand noch auf `{"downloads": 203, "updated": 1748530409000, "1.0.1": 203}` — Stand 29.05.2025. Der Engpass liegt also bei Obsidian, nicht am Repo.

**How to apply:** Nach einem Release nicht im safeLearn-Vault nachsehen und daraus schließen, es habe geklappt — das beweist nichts. Belastbar ist stattdessen: `gh api repos/UnterrainerInformatik/safeLearn-Obsidian-plugin/releases/latest` (Tag, `draft`, Assets) und die `manifest.json` auf `master`. Meldet ein anderer Vault trotzdem kein Update, ist das normal und **kein Fehler, der zu suchen wäre** — Gerald ist ein Tag Verzögerung für Rolling Updates ausdrücklich recht. Wer nicht warten will: Detailseite des Plugins im Community-Browser öffnen (die zieht die `manifest.json` direkt aus dem Repo) oder die drei Release-Assets von Hand nach `<vault>/.obsidian/plugins/safelearn-formatter/` kopieren. Siehe [[plugin-release-process]] und [[plugin-repo-link]].
