<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Lehrer ohne Namen im AD (offen)
118 Lehrer-Konten haben im AD weder `givenName` noch `sn` und erscheinen im Personen-Picker als Kennung statt als Name. Nach dem Provider-Split am 2026-09-13 neu gemessen: unverändert 118 (von jetzt 250) — es ist also eine Datenlücke im AD, kein Mapper-Problem. Zu beheben entweder an der Quelle (Gerald hat dort keinen Schreibzugriff) oder durch eine lesbarere Darstellung der Kennung im Picker.

## Alte 5. Klassen blähen die Klassenlisten auf (offen, keine Lösung in Sicht)
Im LDAP liegen in den 5. Klassen auch Schüler früherer Jahrgänge. Das ist an sich korrekt: Wer die Matura noch nicht geschafft hat oder noch nicht antreten darf, wird vom Admin nicht aus dem AD entfernt. Eine 5. Klasse hat dadurch teilweise rund 70 Mitglieder, und eine Klassenliste daraus zu erstellen wird mühsam, weil die aktuellen Schüler zwischen den Altfällen herausgesucht werden müssen. Eine Lösung gibt es noch nicht. Vorher wäre zu klären, ob das AD überhaupt ein Merkmal liefert, das aktuelle von früheren Jahrgängen unterscheidet (etwa Anlagedatum, Gruppen oder ein Attribut). Dabei nur Aggregate erheben, siehe [[pii-handling-real-data]].

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Allgemein

## Fragen: eine Änderung gilt überall, Löschen nimmt sie aus allen Tests (offen, 2026-10-19)
**Gerald, 2026-10-19:**
- Wird eine Frage in einem Test verwendet und danach geändert, soll sie einfach überall geändert sein.
- Wird eine Frage gelöscht, soll sie auch aus allen Tests verschwinden. Das ist eine Admin-Funktion: eine Frage löschen, obwohl sie noch irgendwo verwendet wird.
- Eine Frage, die in einem alten Test verwendet wurde, soll trotzdem löschbar sein.

**Heute (Code-Stand 2026-10-19):**
- Jeder Test hält einen **Snapshot** seiner Fragen (exam-online-tests D2). Speichern im Editor ändert nur den Pool. Ein noch nicht geschriebener Test übernimmt die Änderung nur, wenn eine Lehrkraft das ausdrücklich verlangt (`unwrittenTestsWith`/`updateTest`, exam-question-editor D8). Ein geschriebener Test bleibt immer beim alten Stand.
- `deleteQuestion` (`exam/pool-edit.js`) weist jede Frage ab, die in `question_usage` oder `test_question` vorkommt (`usedCannotDelete`). Eine solche Frage lässt sich nur zurückziehen.
- Für einen einzelnen geschriebenen Test gibt es schon die Admin-Korrektur `removeWrittenQuestion` (`exam/tests.js`): Sie nimmt die Frage aus Snapshot und Versuchen, bewertet neu, und das Notenbuch zieht nach. Die letzte Frage eines Tests kann sie nicht entfernen.

**Vor einem Change zu klären:**
- Gilt "überall geändert" auch für **geschriebene** Tests? Dann ändert sich nachträglich, was Schüler beantwortet haben. Ändert sich, welche Antwort richtig ist, müssen die abgegebenen Versuche neu bewertet werden, und das Notenbuch ändert sich mit. Alternativ übernehmen nur ungeschriebene Tests automatisch, und geschriebene bleiben beim Snapshot.
- Löschen einer verwendeten Frage: Für geschriebene Tests `removeWrittenQuestion` pro Test (mit Neubewertung), für ungeschriebene einfach aus dem Snapshot. Was passiert mit einem Test, dessen **einzige** Frage sie ist: den Test mitlöschen, oder das Löschen ablehnen?
- Was ist ein "alter Test": jeder geschriebene, oder nur einer aus einem abgeschlossenen Schuljahr (P5)? Für einen abgeschlossenen, schreibgeschützten Jahrgang widerspricht das Herausnehmen samt Neubewertung der Regel, dass ein abgeschlossenes Jahr nicht mehr geändert wird.
- Wer darf das: nur Admins (wie `removeWrittenQuestion`), oder jede Lehrkraft für ungeschriebene Tests?

## Eine vorbeigegangene Sitzung neu ansetzen (entschieden 2026-10-20, bereit für einen Change)
**Gerald, 2026-10-19:** Ein Test lief leer durch, niemand hat geschrieben. Gerald will ihn neu ansetzen: Falls es Ergebnisse gibt, werden sie gelöscht, und die Sitzung wird verschoben. Die alten Einstellungen bleiben dabei erhalten. Meistens ändert sich nur der Tag.

**Heute (Code-Stand 2026-10-19):**
- `updateSitting` und `deleteSitting` (`exam/tests.js`) verlangen `requireNotOpened`. Ändern und Löschen gibt es also nur, solange die Sitzung noch nicht offen war. Auf der Testseite stehen **Change** und **Delete** nur bei einer geplanten Sitzung. Eine vorbeigegangene Sitzung lässt sich weder verschieben noch löschen.
- Ausweg heute: eine **Nachholsitzung** (`makeup`) anlegen. Die hat aber eine Teilnehmerliste und keine Dauer, die man frei wählen kann, und die alte Sitzung bleibt als "over" stehen.
- Versuche löscht heute nur ein Admin, und zwar einzeln (**Delete attempt** in der Live-Ansicht) oder mit dem ganzen Test (**Delete this test**).
- Die Spalte im Notenbuch ist auf die erste Sitzung datiert (`refreshUsageDate`). Mit dem Verschieben wandert dieses Datum mit, vielleicht sogar ins andere Semester.

**Vorschlag:** Eine beendete Sitzung bietet **Neu ansetzen**. Das öffnet das bestehende Sitzungsformular, vorbelegt mit denselben Stunden, derselben Dauer und denselben Teilnehmern; als Tag ist der nächste Schultag vorgeschlagen. Beim Speichern werden in einer Transaktion die Versuche der Sitzung gelöscht und das Fenster verschoben. Mit Versuchen wird zweimal geklickt, und die Beschriftung nennt die Zahl ("Noch einmal klicken: 3 Versuche löschen und neu ansetzen").

**Entschieden (Gerald, 2026-10-20):**
- Beibehalten werden nur die Einstellungen: Teilnehmer, Dauer und Stunden bleiben, nur der Tag ändert sich. Die Versuche der Sitzung werden endgültig gelöscht; einzige Spur ist das Backup.
- Ohne Versuche darf jede Lehrkraft des Kurses neu ansetzen. Würden dabei Versuche gelöscht, nur ein Admin (wie `exam-record-maintenance`).
- Nachholsitzungen des Tests bleiben unverändert. Neu ansetzen betrifft nur die gewählte Sitzung.
- Das Datum der Notenbuch-Spalte wandert mit dem neuen Termin mit, auch über die Semestergrenze.
