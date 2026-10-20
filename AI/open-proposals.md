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

## Fragen: eine Änderung gilt überall, Löschen nimmt sie aus allen Tests (entschieden 2026-10-20, bereit für einen Change)
**Gerald, 2026-10-19:**
- Wird eine Frage in einem Test verwendet und danach geändert, soll sie einfach überall geändert sein.
- Wird eine Frage gelöscht, soll sie auch aus allen Tests verschwinden. Das ist eine Admin-Funktion: eine Frage löschen, obwohl sie noch irgendwo verwendet wird.
- Eine Frage, die in einem alten Test verwendet wurde, soll trotzdem löschbar sein.

**Heute (Code-Stand 2026-10-19):**
- Jeder Test hält einen **Snapshot** seiner Fragen (exam-online-tests D2). Speichern im Editor ändert nur den Pool. Ein noch nicht geschriebener Test übernimmt die Änderung nur, wenn eine Lehrkraft das ausdrücklich verlangt (`unwrittenTestsWith`/`updateTest`, exam-question-editor D8). Ein geschriebener Test bleibt immer beim alten Stand.
- `deleteQuestion` (`exam/pool-edit.js`) weist jede Frage ab, die in `question_usage` oder `test_question` vorkommt (`usedCannotDelete`). Eine solche Frage lässt sich nur zurückziehen.
- Für einen einzelnen geschriebenen Test gibt es schon die Admin-Korrektur `removeWrittenQuestion` (`exam/tests.js`): Sie nimmt die Frage aus Snapshot und Versuchen, bewertet neu, und das Notenbuch zieht nach. Die letzte Frage eines Tests kann sie nicht entfernen.

**Entschieden (Gerald, 2026-10-20):** Der Snapshot entsteht erst, wenn der Test beginnt, nicht beim Anlegen. Er dient der Revisionssicherheit des geschriebenen Tests; alles davor folgt dem Pool.
- Vor Beginn verweist ein Test nur auf Pool-Fragen. Eine Änderung im Pool gilt sofort für ihn, ohne „Übernehmen“ (`unwrittenTestsWith`/`updateTest` entfallen).
- Beim Öffnen der ersten Sitzung wird der Snapshot gezogen. Nachholsitzungen verwenden denselben Snapshot.
- Werden die Sitzungen eines Tests samt Versuchen gelöscht (auch beim Neu-Ansetzen), fällt der Snapshot weg, und der Test folgt wieder dem Pool.
- Löschen einer Frage nimmt sie aus allen noch nicht begonnenen Tests. Begonnene Tests behalten ihre Kopie im Snapshot, Versuche und Notenbuch bleiben unverändert. Damit ist auch eine Frage löschbar, die in einem alten Test verwendet wurde.
- Verliert ein nicht begonnener Test dadurch seine einzige Frage, bleibt er leer stehen; eine Sitzung lässt sich erst öffnen, wenn er wieder Fragen hat. Die Bestätigung beim Löschen nennt die betroffenen Tests.
- Löschen darf jede Lehrkraft, auch bei verwendeten Fragen, mit dieser Bestätigung.
- Offen für den Change: `question_usage`/`test_question.question_id` dürfen auf eine gelöschte Frage zeigen bzw. müssen sie loslassen; Zählung „verwendet“ im Pool neu definieren.
