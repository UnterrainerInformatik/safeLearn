---
name: i18n-babeledit-json
description: UI translations follow BabelEdit's layout - one JSON file per language with identical keys, so BabelEdit can maintain and extend them later
metadata:
  type: project
---

Decided by Gerald on 2026-10-18 for the per-user UI language change (DE/EN, app-wide): translations are JSON catalogs in BabelEdit's layout, one file per language (e.g. `en.json`, `de.json`) with the same keys. No i18n library; a small own `t(key, params)` reads them.

**Why:** Gerald wants to maintain the texts in BabelEdit later and add languages without touching code.

**How to apply:** when the i18n change is designed or implemented, choose a file layout BabelEdit opens directly; never a single multi-language file or JS-embedded strings. Backlog entry: "Mehrsprachigkeit der Oberfläche" in `AI/open-proposals.md`. Related: [[proposals-autostart]], [[code-language-english]].
