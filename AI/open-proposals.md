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

## Sitting: Startfenster + Dauer, geschlossen erst nach dem letzten Ablauf
Gerald will ein anderes Modell für das Fenster einer Sitzung: Das Fenster ist ein **Startfenster**. In der UI gibt man den Startzeitpunkt und die Länge des Fensters ein (statt Von/Bis). Wer im Fenster startet, hat ab seinem Start die volle Dauer x Minuten. Die Sitzung ist erst **geschlossen, wenn der letzte abgegeben hat** bzw. seine Zeit abgelaufen ist — spätestens also Fensterende + Dauer.

Heute ist das anders (`online-test`, „A sitting sets the window and the duration“ / „The server owns the deadline and submits automatically“): das Fenster ist Von/Bis, die Dauer muss kürzer sein als das Fenster, und die Deadline ist das Frühere von Start + Dauer und Fensterende — wer spät startet, bekommt also weniger Zeit. `sittingState` (`exam/tests.js`) setzt die Sitzung mit dem Fensterende auf `over`.

Anzeige:
- **View für die Klasse** (`/exam/sittings/<id>/screen`): das Startfenster zeigen und zusätzlich, wann beim Letzten die Zeit abläuft (der späteste Ablauf aller laufenden Versuche).
- **Live-View (Lehrer):** pro Schüler, wie lange er noch Zeit hat. Für Schreibende gibt es „writing with the time left“ schon (`exam/client/live.js`); zu prüfen, ob das mit dem neuen Modell pro Schüler stimmt und überall sichtbar ist.

Zu klären: Gilt das neue Modell auch für Offline-Sitzungen (die öffnen erst per Start und haben eine gemeinsame Zeit)? Was passiert mit bestehenden Sitzungen (Von/Bis → Start + Länge umrechnen)? Bleibt die Regel „Dauer kürzer als Fenster“ oder fällt sie weg? Ab wann sieht ein Schüler den Test nicht mehr — Fensterende für Nicht-Gestartete, eigene Deadline für Gestartete? Nachschreibtermine übernehmen das Modell ebenso.

## Nachtest: keine Auswahl, sondern alle, die noch nicht geschrieben haben
Beim Anlegen eines Nachtermins (make-up) wählt man heute die Teilnehmer per Checkbox aus dem Roster aus (`online-test` „A sitting sets the window and the duration“, `offline-test` „A make-up sitting is offered, never required“, Formular in `exam/client/tests.js`). Dort stehen auch Schüler, die den Test schon geschrieben haben.

Gerald will das so:
- **Keine Auswahl.** Ein Nachtermin gilt automatisch für **alle, die den Test noch nicht geschrieben haben** — sie dürfen im Fenster des Nachtermins schreiben. Wer schon geschrieben hat, kommt nicht vor (zumindest ausgeblendet, eigentlich gar keine Liste).
- **Wiederholung eines komplett negativen Tests ist kein Nachtermin.** Dann müssen alle nochmal schreiben, und der alte Test muss samt seinen Ergebnissen (den vielen 5ern) weg. Heute geht das nicht: „Discard“ (`exam-record-maintenance`, „An open test can be discarded“) gibt es nur, solange die erste Sitzung eines Online-Tests offen ist — nicht danach, und nie für Offline-Tests.

Zu klären: Wer zählt als „noch nicht geschrieben“ — kein Versuch / bei Offline nicht anwesend? Was ist mit Schülern, die nach dem ersten Termin in den Kurs gekommen sind? Bleibt „never required“ (nicht jeder Fehlende muss einen Nachtermin bekommen) — reicht dann, dass er einfach nicht erscheint? Für die Wiederholung: den alten Test nach Ende löschen (mit Bestätigung samt Zahl der gelöschten Ergebnisse wie beim Discard) und neu ansetzen, oder ein eigener Schritt „Test wiederholen“, der die Ergebnisse verwirft und den Test mit denselben Fragen neu öffnet? Wie verhält sich das in einem abgeschlossenen Schuljahr?

## Freitext-Fragen im Pool, Quickies daraus zusammensetzen
Gerald will im Fragen-Pool ein **Flag für Freitext-Fragen**, damit der Pool auch Fragen mit freier Antwort verwalten kann. Online-Tests können solche Fragen nicht auswerten und dürfen sie nicht enthalten. Für **Quickies (Kurztests)** wären sie aber genau richtig: Ein Quickie soll sich dann aus Pool-Fragen zusammensetzen lassen wie heute ein Online-Test. Das ist besser für die Wiederverwendbarkeit als ein eigenes Handout pro Quickie.

Heute kennt der Pool nur automatisch auswertbare Typen: `question.type` ist per `CHECK` auf `multichoiceset`, `multichoice` und `truefalse` beschränkt (Migrationen 005, 006, 011; der Snapshot `test_question` genauso). Ein Kurztest ist entweder eine händische Spalte im Sheet oder ein Offline-Test mit einem Handout aus dem Korpus (`offline-test`). Eine Zusammenstellung aus Pool-Fragen gibt es nur für Online-Tests (`online-test`).

Zu klären:
- Ist es ein Flag oder ein neuer Fragetyp `freetext`? Hat eine Freitext-Frage eine Musterlösung oder einen Erwartungshorizont und eine Punktezahl?
- Was wird aus einem zusammengesetzten Quickie: ein Offline-Test, dessen Handout aus den Fragen erzeugt wird (Druck, Lösung, Gruppen A/B), oder etwas Eigenes? Werden die Ergebnisse weiter händisch als Punkte in der Kurztest-Spalte eingetragen?
- Dürfen Quickies auch Multiple-Choice-Fragen aus dem Pool mischen?
- Wie verhalten sich der Fragen-Browser und der Import (Filter, die Sperre beim Zusammensetzen eines Online-Tests)?
