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

# Online-Tests

## Lehrer-Notizen in der Live-Ansicht
Gerald, 2026-11-07 (während `gradebook-result-notes`): In der Live-Ansicht eines laufenden Online-Tests soll der Lehrer pro Teilnehmer eine Notiz machen können („Hat, glaub ich, geschummelt … genauer ansehen … evtl. abgeschrieben von xxx“). Anders als die Zellen-Notizen im Sheet ist sie **nur für Lehrer**: Sie taucht nie beim Schüler auf, sondern steht als Anmerkung in der Live-Liste (und vermutlich auch später beim Versuch). Zu klären: gehört sie zum Versuch (`attempt`) oder zur Sitzungsteilnahme (`sitting_participant`), wie sie zur Zellen-Notiz des Tests im Sheet steht (getrennt halten oder dort anzeigen), und dass sie als personenbezogene Freitext-Daten in Retention-Purge und Closed-Year-Triggern mitlaufen muss.

## Drei Exam-Harness-Checks scheitern stabil auf HEAD
Aufgefallen 2026-11-08 beim Verifizieren von `exam-fullscreen-chrome`: In `test/exam.test.js` scheitern drei Checks in jedem Lauf. Das war fünfmal hintereinander so, einmal davon auf HEAD `757c494` ohne jede lokale Änderung und einmal im vollen `npm test` (967/970). Wackelig sind sie also nicht, und auf der Liste der bekannten Wackler ([[flaky-content-checks]]) stehen sie nicht:

- **„the live view shows the suspicious signal apart from the focus figures, and a missing heartbeat only while it lasts“** – `the share while writing, no warning`: erwartet `['0', '97%']`, die Seite zeigt `['0', '97 %']`. Die Tick-Rate-Spalte formatiert den Anteil also mit Leerzeichen vor dem Prozentzeichen, der Check erwartet ihn ohne. Zu klären, ob die Anzeige oder der Check falsch ist; der Board-Deck-Check erwartet für den Anteil richtiger Antworten bewusst `100 %` mit Leerzeichen.
- **„the live view orders by status, then by time out of focus, then by name, and holds still under the mouse on a button“** – `TimeoutError: Waiting failed: 2000ms exceeded`. Ursache noch nicht angesehen.
- **„started from its page, a present student sees their handout as a student with the exam variant, and its attachments“** – wartet 20 s vergeblich auf `.sl-exam-attempt-offline[data-sitting="…"] .sl-exam-handout-link`. Ursache noch nicht angesehen.

Naheliegender Verdacht: Alle drei hängen mit `exam-fullscreen-tick-rate` (`757c494`) zusammen, das die Live-Ansicht und die Liste der offenen Tests zuletzt angefasst hat. Bestätigt ist das noch nicht. Ein Lauf auf `28e968f` würde es klären.
