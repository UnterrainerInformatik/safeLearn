<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Exam

## Begonnenen Online-Test abbrechen und verwerfen
Ein Online-Test, dessen Sitzung schon offen ist und an dem schon Versuche laufen, soll abgebrochen werden können (end), und danach sollen seine Notenbuch-Spalte gelöscht und die Versuche verworfen werden, ohne dass der Test neu zusammengestellt oder ein Nachtermin angelegt werden muss. Heute ist ein Test nach dem ersten begonnenen Versuch nicht mehr löschbar und seine Fragen sind fix (`online-test`); Versuche verschwinden nur beim Neuansetzen einer Sitzung, und das nur durch einen Admin mit Zwei-Klick-Bestätigung (`exam-record-maintenance`). Gewünscht ist also ein Weg „Sitzung beenden → Versuche und Ergebnisse verwerfen → Test bleibt mit seinen Fragen bestehen und kann neu angesetzt werden". Zu klären: wer das darf (Lehrer oder nur Admin), Bestätigung mit Anzahl der verworfenen Versuche, und ob der Test danach wieder dem Pool folgt oder seinen Snapshot behält.

## Tafel-Lösung: pro Frage Anzahl richtiger und falscher Antworten
Die Lösung an der Tafel eines Online-Tests (`/exam/tests/<id>/solution`, `docs-exam-module.md` „Solution on the board") zeigt pro Frage heute nur den Anteil der abgegebenen Versuche, die sie richtig beantwortet haben, ohne Namen und ohne Einzelantworten; ohne abgegebenen Versuch fehlt er ganz. Gewünscht: pro Frage zusätzlich die absoluten Zahlen, wie viele Versuche die Frage richtig und wie viele sie falsch beantwortet haben. Zu klären: ob eine nicht beantwortete Frage als falsch zählt oder eigens ausgewiesen wird, ob die Zahlen neben oder statt des Anteils stehen, und ob bei Mehrfachauswahl auch pro Antwortoption gezählt werden soll, wie oft sie gewählt wurde. Bewertet wird weiterhin über `questionScores` (alles oder nichts).
