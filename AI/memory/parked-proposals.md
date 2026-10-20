---
name: parked-proposals
description: "AI/parked-proposals.md is the \"back-backlog\" — remembered but never offered at session start or on \"was ist zu tun?\""
metadata:
  node_type: memory
  type: feedback
  originSessionId: ba7f5500-bff4-4b3b-9f85-d61c757cd732
  modified: 2026-10-20T15:28:35.905Z
---

Neben `AI/open-proposals.md` (siehe [[proposals-autostart]]) gibt es seit 2026-10-20 `AI/parked-proposals.md`, von Gerald "Back-Backlog" genannt. Dort liegen Punkte, die gemerkt, aber nicht aktiv vorgeschlagen werden sollen — erste Bewohner: "Lehrer ohne Namen im AD" und "Alte 5. Klassen blähen die Klassenlisten auf".

**Why:** Gerald: "1 und 2 ist sehr instanzspezifisch. Ich will dazu fast nix einbauen … Merken ist ok, aber wir schlagen das nicht immer gleich vor." Instanzspezifische Datenprobleme einer Schule/eines AD sollen safeLearn nicht prägen.

**How to apply:** Bei "was ist zu tun?" und beim Session-Start nur `AI/open-proposals.md` anbieten, nie `parked-proposals.md` (der SessionStart-Hook liest sie ohnehin nicht). Nur auf ausdrückliche Nachfrage hineinsehen. Sagt Gerald bei einem Eintrag sinngemäß "merken, aber nicht vorschlagen", verbatim dorthin verschieben; wird einer wiederbelebt, zurück nach `open-proposals.md`. Formal: Requirement "Parked entries are kept but not offered" in `AI/openspec/specs/proposal-intake/spec.md`.
