---
name: decision-questions-need-context
description: Bei Entscheidungsfragen zuerst den Mechanismus erklären, dann erst die Optionen anbieten
metadata:
  type: feedback
---

Wenn Gerald zwischen Optionen entscheiden soll, will er zuerst wissen, **wie die Sache tatsächlich funktioniert** — nicht nur die Optionen mit ihren Konsequenzen. Am 2026-09-09 hat er eine Optionsfrage zu `site/.env` vs. `deploy/.env` zurückgewiesen mit: „Ich brauche Kontext zu den deploy/.env Zeilen und site. wozu sind die Zeilen da drinnen?"

**Why:** Er entscheidet nicht auf Zuruf über eine Empfehlung, sondern will die Entscheidung selbst nachvollziehen können. Eine Frage, die nur Optionen und Empfehlung zeigt, verlangt Vertrauen statt Verständnis — und wenn die Erklärung nachgereicht wird, stellt sich oft heraus, dass die Frage selbst falsch gestellt war (hier: dass sein eigener Fix der wirksame Kanal war und meine Prämisse zu weit ging).

**How to apply:** Vor `AskUserQuestion` den Mechanismus in wenigen Sätzen belegen — welche Datei wohin wandert, wer sie liest, was sie bewirkt, mit Datei- und Zeilenverweisen. Wenn dabei eine eigene frühere Behauptung fällt, das sagen. Erst danach die Optionen. Siehe [[language-german.md]] für die Sprache und [[architecture-doc.md]] für den Ort, an dem solche Mechanismen dauerhaft festgehalten werden.
