---
name: obsidian-app-path
description: test:obsidian findet Obsidian nicht von selbst — es ist per pacman installiert, die Harness sucht AppImages; SAFELEARN_OBSIDIAN_APP=/usr/bin/obsidian setzen
metadata:
  type: reference
---

Auf Geralds Rechner ist Obsidian per pacman installiert (`/usr/bin/obsidian`, siehe `/home/psilo/scripts/obsidian/README.md`), nicht als AppImage. `test/obsidian/harness.js` sucht ohne Angabe nur AppImages in `/home/psilo/scripts/obsidian` und bricht mit "No Obsidian found" ab.

**How to apply:** `npm run test:obsidian` immer als `SAFELEARN_OBSIDIAN_APP=/usr/bin/obsidian npm run test:obsidian` starten. Damit lief die Suite am 2026-10-20 mit 162/162 grün.

Vorher prüfen, ob `AI/plugin` (siehe [[plugin-repo-link]]) auf `origin/master` steht: ein veralteter Checkout lässt sowohl `test/obsidian/` als auch `test/invitation-list.test.js` und `test/section-names.test.js` dutzendfach scheitern („main.ts declares no …“), ohne dass safeLearn etwas falsch macht. Siehe auch [[browser-verification]].
