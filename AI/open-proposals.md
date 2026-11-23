<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Permissions

# Gradebook

# Exam

## Freitext-Fragen im Pool, Quickies daraus zusammensetzen
Gerald will im Fragen-Pool ein **Flag für Freitext-Fragen**, damit der Pool auch Fragen mit freier Antwort verwalten kann. Online-Tests können solche Fragen nicht auswerten und dürfen sie nicht enthalten. Für **Quickies (Kurztests)** wären sie aber genau richtig: Ein Quickie soll sich dann aus Pool-Fragen zusammensetzen lassen wie heute ein Online-Test. Das ist besser für die Wiederverwendbarkeit als ein eigenes Handout pro Quickie.

Heute kennt der Pool nur automatisch auswertbare Typen: `question.type` ist per `CHECK` auf `multichoiceset`, `multichoice` und `truefalse` beschränkt (Migrationen 005, 006, 011; der Snapshot `test_question` genauso). Ein Kurztest ist entweder eine händische Spalte im Sheet oder ein Offline-Test mit einem Handout aus dem Korpus (`offline-test`). Eine Zusammenstellung aus Pool-Fragen gibt es nur für Online-Tests (`online-test`).

Zu klären:
- Ist es ein Flag oder ein neuer Fragetyp `freetext`? Hat eine Freitext-Frage eine Musterlösung oder einen Erwartungshorizont und eine Punktezahl?
- Was wird aus einem zusammengesetzten Quickie: ein Offline-Test, dessen Handout aus den Fragen erzeugt wird (Druck, Lösung, Gruppen A/B), oder etwas Eigenes? Werden die Ergebnisse weiter händisch als Punkte in der Kurztest-Spalte eingetragen?
- Dürfen Quickies auch Multiple-Choice-Fragen aus dem Pool mischen?
- Wie verhalten sich der Fragen-Browser und der Import (Filter, die Sperre beim Zusammensetzen eines Online-Tests)?
