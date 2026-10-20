<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Darstellungsfehler

## Sidebar-Inhaltsverzeichnis auf /admin/* und /exam/* zeigt die zuletzt gelesene Seite
Beim Screenshot-Lauf am 2026-10-20 aufgefallen: auf den Administrations- und Exam-Seiten listet der Sidebar-Bereich "Content" die Überschriften der zuletzt besuchten Inhaltsseite (z. B. Lernstrecke, test-md-file), nicht die der aktuellen Seite.

## Gradebook-Spaltenkopf schreibt Testnamen in Title Case
Ein Test "Quiz: HTTP and databases" erscheint im Gradebook-Kopf als "Quiz: HTTP And Databases". Gesehen am 2026-10-20.

## ☰-Button klappt die Sidebar auf Desktop-Breite nicht zu
Bei 1600 px Breite tut `toggleSidebar()` nichts sichtbar; die Sidebar bleibt stehen (2026-10-20, beim Gradebook-Screenshot). Zu klären, ob das gewollt ist.

# Sicherheit

## Öffentliches Image enthält site/.env und keycloak.json
Die Pipeline schreibt `SESSION_SECRET` und den `KEYCLOAK_FILE`-Inhalt (inkl. Client-Secret) nach `site/`, das Dockerfile kopiert `site/` ins Image. `gufalcon/safe-learn` ist auf Docker Hub öffentlich (2026-10-20 geprüft) — die Secrets der Demo-Instanz liegen damit in einem öffentlichen Layer. Bei `DIRECTORY_SERVICE_*` wurde genau das schon behoben (nur noch über `deploy/.env`); `SESSION_SECRET` steht aber weiterhin in beiden Kanälen. Zu klären: beide ebenfalls nur noch über die Container-Umgebung bzw. ein Mount reichen.
