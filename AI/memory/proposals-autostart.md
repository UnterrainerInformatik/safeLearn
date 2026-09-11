---
name: proposals-autostart
description: "Backlog entries in AI/open-proposals.md are listed by a SessionStart hook and whenever Gerald asks what's open, become a change, and are deleted from the file when that change is archived"
metadata: 
  node_type: memory
  type: project
  originSessionId: 11aeab4b-947a-410c-ab7c-331348a72231
  modified: 2026-09-11T08:47:27.736Z
---

Gerald sammelt Bug-Reports und Ideen als Einträge in einer einzigen Datei, `AI/open-proposals.md` (Backlog). Seit 2026-09-11 ersetzt das den früheren Mechanismus mit einem File pro Vorschlag in `AI/proposals/` — dieser Ordner ist entfernt, der alte Mechanismus vollständig migriert.

**Format der Datei** (siehe die Datei selbst, Kommentar am Kopf): `# <Kategorie>`-Überschriften (aktuell "Darstellungsfehler", "Funktionsfehler", "Allgemein"), darunter je `## <Titel>` mit freier Beschreibung. Bewusst formlos — keine feste Struktur pro Feld, keine IDs.

1. **Auflisten beim Session-Start.** Der `SessionStart`-Hook (`AI/claude/hooks/list-open-proposals.sh`, verdrahtet in `AI/claude/settings.json`, Matcher `startup|resume`) zählt `## `-Zeilen in `AI/open-proposals.md`; gibt es welche, wird der volle Dateiinhalt ausgegeben und dazu aufgefordert, einen Eintrag als nächsten Schritt anzubieten (per `/opsx:propose`). Leere Datei, fehlende Datei, oder nur Kategorie-Überschriften ohne Einträge → keine Ausgabe, Exit 0 immer.
2. **Verknüpfung mit dem Change.** Ein aus einem Eintrag entstandener Change trägt in seiner `proposal.md` die Zeile `Source: AI/open-proposals.md`, die den Eintrag benennt.
3. **Archivieren.** Beim Archivieren wird der benannte Eintrag aus `AI/open-proposals.md` **gelöscht** (nicht verschoben) — geregelt über `operations.archive.guidance` in `AI/openspec/config.yaml`.

**Warum löschen statt verschieben:** `AI/` ist vollständig in git (`git ls-files AI/` zeigte am 2026-08-16 alle Files erfasst, nichts per `.gitignore` ausgenommen, von Gerald bestätigt) — die Git-Historie von `AI/open-proposals.md` behält den Originaltext eines gelöschten Eintrags ohnehin, ein separates Aufbewahren wie beim alten Datei-pro-Vorschlag-Mechanismus ist unnötig. Kein Design darf sich darauf stützen, dass `AI/` ungetrackt wäre.

**Nachsehen, wenn Gerald nach neuer Arbeit fragt.** Jedes Mal, wenn Gerald nach neuer Arbeit fragt ("was gibt es zu tun", "womit machen wir weiter", "wassup", ein `/opsx:propose` ohne Argument), zuerst `AI/open-proposals.md` lesen und offene Einträge anbieten — nicht nur beim Session-Start.

**Neue Einträge:** Kommt in einem Gespräch ein Bug oder eine Idee auf, die nicht sofort erledigt wird, gehört sie als Eintrag in `AI/open-proposals.md`, nicht nur im Gesprächsverlauf stehen bleiben. Sprache der Einträge ist Deutsch, wie Geralds eigene rohe Notizen (vgl. [[language-german]] — die Docs-müssen-Englisch-Regel in [[code-language-english]] gilt für formale Specs/Architektur-Docs, nicht für diese Rohnotizen).

**Formale Spec:** `AI/openspec/specs/proposal-intake/spec.md` beschreibt diesen Mechanismus als Requirements, am 2026-09-11 direkt aktualisiert (ohne eigenen Change-Zyklus — war eine direkte Anweisung Geralds, kein `propose:`).

**How to apply:** Aus einem Backlog-Eintrag immer einen Change mit der `Source: AI/open-proposals.md`-Zeile bauen. Beim Archivieren den benannten Eintrag aus `AI/open-proposals.md` löschen — fehlt die Zeile oder der Eintrag, ist das kein Fehler. Die Archive-Guidance ist laut Skill nur *advisory*: bleibt ein Eintrag liegen, taucht er beim nächsten Start wieder auf und wird dann von Hand einsortiert. Siehe [[ai-folder-layout]] und [[openspec-setup]].
