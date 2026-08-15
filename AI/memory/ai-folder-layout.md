---
name: ai-folder-layout
description: All AI-related files live in AI/ at the project root; .claude, openspec and the harness memory path are symlinks into it
metadata:
  type: project
---

Gerald will **alles AI-Bezogene im Ordner `AI/`** im Projektwurzelverzeichnis von safeLearn haben. Eingerichtet am 2026-08-15.

```
/mnt/data/source/HTL/safeLearn/
├── AI/
│   ├── claude/     ← echter Inhalt von .claude (commands, skills)
│   ├── openspec/   ← echter Inhalt von openspec (specs, changes, config.yaml)
│   └── memory/     ← echter Inhalt des Memory-Ordners
├── .claude   → AI/claude      (Symlink)
└── openspec  → AI/openspec    (Symlink)
```

Zusätzlich: `/home/psilo/.claude/projects/-mnt-data-source-HTL-safeLearn/memory` → `/mnt/data/source/HTL/safeLearn/AI/memory` (Symlink).

**Why:** Die drei Pfade sind bei den jeweiligen Tools fest verdrahtet und nicht konfigurierbar — `OPENSPEC_ROOT_DIR`/`OPENSPEC_DIR_NAME` sind hartcodierte Konstanten im Paket (keine Env-Variablen), Claude Code sucht Commands/Skills unter `<projekt>/.claude`, und den Memory-Pfad gibt der Harness vor. Symlinks sind die einzige Möglichkeit, Geralds Ein-Ordner-Wunsch zu erfüllen, ohne die Tools zu brechen.

**How to apply:** Neue AI-Artefakte immer unter `AI/` anlegen, nicht in der Projektwurzel. Beim Schreiben ins Memory den echten Pfad `AI/memory/` verwenden. Symlinks nicht durch echte Ordner ersetzen — sonst laufen Tool und Ablage auseinander. Siehe [[memory-trigger-phrases]] und [[openspec-setup]].
