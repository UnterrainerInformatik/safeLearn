<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Sicherheit

## Öffentliches Image enthält site/.env und keycloak.json
Die Pipeline schreibt `SESSION_SECRET` und den `KEYCLOAK_FILE`-Inhalt (inkl. Client-Secret) nach `site/`, das Dockerfile kopiert `site/` ins Image. `gufalcon/safe-learn` ist auf Docker Hub öffentlich (2026-10-20 geprüft) — die Secrets der Demo-Instanz liegen damit in einem öffentlichen Layer. Bei `DIRECTORY_SERVICE_*` wurde genau das schon behoben (nur noch über `deploy/.env`); `SESSION_SECRET` steht aber weiterhin in beiden Kanälen. Zu klären: beide ebenfalls nur noch über die Container-Umgebung bzw. ein Mount reichen.

## Hot-Reload-Kanal nennt geänderte gesperrte Files
Der unauthentifizierte `/hot-reload`-Kanal schickt bei einer Änderung (`type: "page"`) die Liste der geänderten Files an **alle** verbundenen Clients, egal ob sie die Files sehen dürfen. Der Inhalt bleibt geheim, der Pfad nicht: Wird am Vorabend eine unter `@@@ teacher` liegende Testangabe editiert und gesynct, steht z. B. `md/POS/LT1-A.md` im Stream. Aufgefallen beim Explore zu `exam-offline-sittings` (2026-10-25). Zu klären: pro Client nach Sichtbarkeit filtern (der Kanal kennt keine Session) oder nur ein „deine Seite hat sich geändert“ ohne Pfade schicken.

# Exam

## Mitarbeitskontrollen als Noten 1–5
Mitarbeitskontrollen werden künftig als **Note von 1 bis 5** eingetragen, mit derselben Bedeutung wie überall sonst (entschieden 2026-11-09; die ursprüngliche Idee war `++` / `+` / `o` / `−`). Heute nimmt eine Mitarbeitsspalte (`plusminus`) nur `+` oder `-` an (`normalizeResult` in `exam/gradebook.js`), gespeichert als 1 bzw. 0. Die Kategorie würde damit wie Präsentationen über `gradeKinds` laufen, der Wert ist die Bandmitte der Note.

Zu klären im Design: Was wird aus bestehenden `+`/`-`-Einträgen (z. B. `+` → 1, `-` → 5, oder bleiben sie als alte Marken)? Die Projektmarken (`projectmark`) teilen heute die `+`/`−`-Eingabe und sind davon nicht betroffen; sie bleiben, wie sie sind.

## Violetter Rahmen während einer Online-Prüfung im Vollbild
Ein Schüler-Bildschirm mit laufendem Test soll im Klassenzimmer auf einen Blick erkennbar sein: ein violetter Rahmen um die ganze Seite. Entschieden (2026-11-09):
- **Nur bei Online-Tests**, nicht auf der Handout-Seite eines Offline-Tests.
- **Nur im Vollbild.** Verlässt die Seite den Vollbildmodus, verschwindet der Rahmen. So sieht der Lehrer im Vorbeigehen, ob der Vollbildmodus aktiv ist.
- **Auch in der Vorschau des Lehrers.**

Seit `exam-fullscreen-chrome` sind Navigation und Menüs der Seite während des Schreibens ohnehin ausgeblendet; der Rahmen hängt am selben Zustand wie die Vollbild-Erkennung in `exam/client/attempt.js`.

## Lehrer-Session bleibt nach `vt: 0` in der Schüleransicht hängen
In `test/exam.test.js` schalten zwei Checks die Lehrer-Session mit `setPreferences(teacher, { vt: 0 })` in die Schüleransicht und im `finally` mit `setPreferences(teacher, {})` zurück: „no student reaches another student's attempt, and a teacher cannot write a test“ (online tests: writing) und „no student, no teacher in student view and no username off the roster gets the role“ (Matura candidates). Das Zurückstellen scheitert jedes Mal mit *Preference "vt" of the teacher session was set to 1, but the application renders with 0*: Der Schreibweg in `setPreferences` (`test/harness.js`) meldet Erfolg, nach dem Reload rendert die App aber weiter mit `vt = 0`.

Gesehen am 2026-11-09: Läuft `test/exam.test.js` allein, scheitert es in jedem Lauf an denselben Stellen (auf HEAD `d4bebe5` ohne lokale Änderungen in einem eigenen Worktree, und in drei Läufen mit `exam-attempt-review`). Im kompletten `npm test`, wo die Datei nach den anderen läuft, waren alle betroffenen Checks grün. Es hängt also an der Reihenfolge oder am Timing, ist aber beim Einzellauf verlässlich reproduzierbar. Die Session bleibt danach in der Schüleransicht, darum scheitern die folgenden Checks des Describes mit `403` (auf HEAD: „the heartbeat is guarded …“, „a start without full screen …“, „below the fifth year nobody is a candidate …“). Diese Folgefehler verdecken, ob die Checks selbst grün wären.

Zu klären: ob die App die Präferenz nach dem Schreiben noch aus einem alten Stand liest (Session-Cache des Account-Lookups, Keycloak-Attribut noch nicht durch) oder der Schreibweg den Block nicht ersetzt. Die anderen Checks mit `vt: 0` stellen erfolgreich zurück; was die zwei unterscheidet, ist offen.

# Präsentationen

## Jede Präsentation passt auf den Schirm
Jede Präsentation (reveal.js-Deck) soll **immer** ganz auf einen Beamer oder Monitor im Klassenzimmer passen. Ist eine Folie zu groß, wird ihr Inhalt so weit verkleinert, bis er auf den Schirm geht. Anlass: In der **Lösung an der Tafel** (`/exam/tests/<id>/solution`, eine Folie pro Frage, gebaut von `solutionSlides` in `exam/routes-tests.js` und ausgeliefert über `wrapInReveal`) des letzten CDI-Tests liefen Fragen mit Bildern über den Rand. Die Lösung an der Tafel ist der erste Fall. Lässt sich das sauber per CSS lösen, gilt die Regel für **alle** Decks: auch die aus dem `md/`-Korpus und die Lösungsdecks der Handouts. Alle drei laufen über `wrapInReveal` in `obsidian.js`. Wird eine Folie dadurch zu klein, muss der Lehrer sie selbst umformatieren; die App teilt nicht auf. Zu klären: Verhalten von reveal.js (`width`/`height`, `minScale`/`maxScale`) und unserer Styles (`css/reveal*.css`), und warum die Bilder heute nicht mitskaliert werden.
