---
name: memory-trigger-phrases
description: "'merke Dir das bitte' / 'commit to memory' means: write a new md file into the memory folder and index it in MEMORY.md"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fac0fa6f-e0c9-4d90-afc5-86fda27cf8bc
  modified: 2026-08-15T19:56:20.802Z
---

Wenn Gerald "merke Dir das bitte" (oder "commit to memory") sagt, soll der betreffende Sachverhalt als eigenes Markdown-File im Memory-Ordner `/mnt/data/source/HTL/safeLearn/AI/memory/` abgelegt und mit einer Zeile in `MEMORY.md` verlinkt werden.

**Why:** Er will explizit steuern, was sitzungsübergreifend erhalten bleibt — nicht raten lassen. Der Index `MEMORY.md` (File-Description-Paare) wird zu Sessionbeginn geladen und entscheidet, was nachgeladen wird.

**How to apply:** Bei der Triggerphrase sofort ein neues File mit Frontmatter (`name`, `description`, `metadata.type`) schreiben, dann die Indexzeile in `MEMORY.md` ergänzen. Ein File = ein Fakt. Vorher prüfen, ob ein bestehendes File das Thema schon abdeckt — dann dieses aktualisieren statt zu duplizieren. Siehe auch [[language-german]].
