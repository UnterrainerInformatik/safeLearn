---
name: openspec-archive-from-ai-dir
description: openspec archive muss aus AI/ heraus laufen, sonst bricht es am Symlink mit "archived delta changed during the final move" ab
metadata:
  type: project
---

`openspec archive <change>` schlägt vom Repo-Root aus fehl:

```
✖ Error: The archived delta for '<capability>' changed during the final move.
```

Die Lösung ist, aus `/mnt/data/source/HTL/safeLearn/AI` heraus zu archivieren. Dann läuft es durch. Alle anderen `openspec`-Kommandos (`list`, `status`, `instructions`, `validate`) funktionieren vom Root aus normal — nur `archive` nicht.

**Why:** `openspec` im Repo-Root ist ein Symlink auf `AI/openspec` (siehe [[ai-folder-layout]]). Das Tool löst dadurch zwei Schreibweisen desselben Pfads auf — `changesDir` wird zu `<root>/openspec/changes`, `changeRoot` aber zu `<root>/AI/openspec/changes/<name>`. In `dist/core/archive.js` prüft der finale Move den Fingerprint des archivierten Delta-Specs unter `path.join(archivePath, path.relative(changeDir, source))`. Mit zwei Schreibweisen ergibt `path.relative` einen Pfad, der ins Leere zeigt, der Fingerprint stimmt nicht, und die Operation rollt zurück. Aus `AI/` heraus findet das Tool `AI/openspec` direkt, beide Schreibweisen sind identisch, die Prüfung geht auf.

**How to apply:** Beim Archivieren immer erst nach `AI/` wechseln. Der Rollback ist sauber — git bleibt unverändert —, aber jeder Fehlversuch hinterlässt ein **leeres Verzeichnis** unter `AI/openspec/specs/<capability>/`, das vor dem nächsten Versuch mit `rmdir` weg muss. Betrifft OpenSpec 1.9.0; bei einem Update erneut prüfen, siehe [[openspec-setup]].

**Eine Ausnahme, einmal beobachtet (2026-08-17):** `plugin-quieter-tag-markings` änderte nur eine Capability, die es schon gab — `Specs to update: … update`, kein neues Verzeichnis unter `specs/` — und archivierte vom Repo-Root aus fehlerfrei. Das passt zum Befund oben: der Fingerprint-Vergleich schlägt offenbar dort zu, wo das Archiv ein Capability-Verzeichnis *anlegt*. Verlass ist darauf keiner; aus `AI/` heraus geht beides.
