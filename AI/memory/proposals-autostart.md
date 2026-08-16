---
name: proposals-autostart
description: Hand-written requests in AI/proposals/ are listed by a SessionStart hook, become a change of the same name, and are moved into the change archive when that change is archived
metadata:
  type: project
---

Gerald legt formlose Änderungswünsche als Markdown-File in `AI/proposals/` ab. Der Weg eines solchen Files durch den Workflow ist seit 2026-08-15 festgelegt:

1. **Auflisten beim Session-Start.** Der `SessionStart`-Hook in `AI/claude/settings.json` (Matcher `startup|resume`) ruft `AI/claude/hooks/list-open-proposals.sh` auf. Das Script listet alle `*.md` in `AI/proposals/` samt erster Überschrift und fordert dazu auf, eines davon per `/opsx:propose` als nächsten Schritt anzubieten. Ist der Ordner leer oder fehlt er, gibt das Script nichts aus.
2. **Verknüpfung mit dem Change.** Der OpenSpec-Change heißt wie das File ohne `.md` (`install-puppeteer.md` → Change `install-puppeteer`), und seine `proposal.md` trägt oben die Zeile `Source proposal: AI/proposals/<file>.md`. Bei Abweichung zwischen Name und Zeile gilt die Zeile.
3. **Archivieren.** Beim Archivieren wandert das Quell-File nach `AI/openspec/changes/archive/<change>/source-proposal.md` — verschieben, nie löschen. Geregelt über `operations.archive.guidance` in `AI/openspec/config.yaml`, was das Archive-Skill via `openspec instructions archive --json` liest.

**Why:** Ohne den Hook bleiben Requests in `AI/proposals/` unbemerkt liegen — sie werden nur gefunden, wenn sich jemand an den Ordner erinnert. Und ohne Schritt 3 bliebe ein erledigtes File liegen und würde bei jedem Start erneut vorgeschlagen, womit die Liste zu Dauerlärm verkommt. Verschieben statt Löschen, weil der Originaltext zur Historie des Changes gehört.

**`AI/` ist in git — vollständig.** `git ls-files AI/` liefert 116 Files, nichts unter `AI/` ist per `.gitignore` ausgenommen, und Gerald hat das am 2026-08-16 ausdrücklich bestätigt. Die `operations.archive.guidance` in `AI/openspec/config.yaml` hatte das Verschieben ursprünglich damit begründet, dass `AI/` ungetrackt und ein `rm` deshalb unwiederbringlich sei; diese Begründung ist am 2026-08-16 aus der Config entfernt worden. Kein Design und keine Entscheidung darf sich darauf stützen, dass `AI/` ungetrackt wäre.

**How to apply:** Aus einem Proposal-File immer einen gleichnamigen Change bauen und die `Source proposal:`-Zeile setzen. Beim Archivieren prüfen, ob diese Zeile existiert, und das File verschieben — fehlt Zeile oder File, ist das kein Fehler. Die Archive-Guidance ist laut Skill nur *advisory*, also nicht verlassen darauf: bleibt ein File liegen, taucht es beim nächsten Start wieder auf und wird dann von Hand einsortiert. Siehe [[ai-folder-layout]] und [[openspec-setup]].
