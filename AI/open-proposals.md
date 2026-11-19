<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Exam

## Offline-Test-Angabe: Variablen `%%var NAME%%` ausfüllen
Angaben von Offline-Tests tragen jetzt Platzhalter in Obsidian-Kommentar-Syntax, z. B. in `nextcloud/secureLectures/tests/WMC/4. Klasse/Test - Quarkus REST 1.md`: `#### Test - %%var CLASS%% - %%var DATE%% - Quarkus REST`, `PIN: %%var FRANKLYN_PIN%%`, `Abgabe auf Github Classroom: %%var SUBMISSION_LINK%%`. Heute verschwinden sie samt Inhalt, weil `%%…%%` seit `4195909` aus jeder Ansicht entfernt wird — der Schüler sieht „Test -  -  - Quarkus REST“.

Gewünscht: Wird eine Angabe (A oder B) gewählt, scannt das Modul die Datei nach `%%var NAME%%` und bietet jede gefundene Variable zum Ausfüllen an; beim Ausliefern der Angabe an die Schüler (und in **Preview**) wird jede Variable durch ihren Wert ersetzt. Zwei Variablen füllt das Modul selbst: `CLASS` = Klasse des Kurses, in dem der Test stattfindet (z. B. `4BHIF`), `DATE` = Datum der Sitzung (z. B. `14.11.2026`).

Zu klären: ob die Werte am Test hängen oder pro Sitzung (Nachtermin mit anderer PIN/anderem Datum — `DATE` sollte wohl das Datum der jeweiligen Sitzung sein, beim Start, davor das geplante), ob A und B getrennte Werte haben oder eine gemeinsame Liste (Vereinigung der Variablen beider Dateien), ob `CLASS`/`DATE` überschreibbar sind, wie eine nicht ausgefüllte Variable dargestellt wird (leer, Name sichtbar, oder Start verweigern wie bei einer kaputten Angabe), was passiert, wenn die Datei nachträglich neue Variablen bekommt (Angabe wird live gerendert), und ob die normale Seite, die Lösung und das Obsidian-Plugin die Variablen weiter verstecken oder z. B. als Namen anzeigen.
