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
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus aus dem Split unten: ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

## Erledigt: Realm auf zwei LDAP-Provider aufgeteilt (2026-09-13)
Vollzogen, nachdem Gerald das Bind-Passwort in beide Provider eingetragen hatte. Reihenfolge wie geplant: Bind getestet (`testConnection`/`testAuthentication`, beide 204) → `ldap-teachers` aktiviert → voller Sync als Sichtprüfung (250 Einträge in `ou=Teachers` gesehen: 9 neu, 241 als „existiert, hängt an anderem Provider" abgewiesen) → `ldap-students` auf `ou=Students,ou=HTL,…` verengt → Lehrer-Kopien neu importiert → App-Attribute zurückgeschrieben → voller Sync auf `ldap-students`.

Endstand, live gezählt: **1.978 Konten** — 1.721 Students an `ldap-students`, 250 Teachers an `ldap-teachers`, 7 rein lokale ohne Föderation. Die 264 Konten aus `OU=Exams`/`OU=Special`/`OU=service` sind wie vorhergesagt herausgefallen. Alle 175 App-Attribut-Sätze (`config`, `lastVisitedUrl`) stehen unverändert — 165 Students, 5 Teachers, 5 lokal. Die temporären Rollen `manage-realm`/`manage-users` am `safeLearn-directory-service` sind wieder abgezogen, der Service-Account liest nur noch (`view-realm`, `view-users`, `view-events`).

Dabei gelernt, und der Grund, warum das Löschen der 241 Kopien gar nicht nötig war: **ein lesender Zugriff genügt.** Sobald `usersDn` verengt ist, findet der verlinkte Provider das Konto nicht mehr, und Keycloak löscht die lokale Kopie beim ersten `GET` darauf — der Probelauf, der nur zählen sollte, hatte sie damit schon entfernt. Siehe [[keycloak-dead-federation-link-deletes-on-read]]. Vor- und Nachzustand liegen als `realm_census_pre.jsonl`/`realm_census_post.jsonl` (chmod 600, PII) unter `~/scripts/realm-directory-cleanup/` auf babylon5, zusammen mit `kc_admin.py`, `babylon5_census.py` und `babylon5_relink_teachers.py`.

## Erledigt: Voller Directory-Fetch scheiterte reproduzierbar bei first=14200
Symptom ursprünglich: `g.unterrainer` sah im Obsidian-Plugin weder im Personen-Picker noch bei "List classes" Einträge. Der 401 von damals ist gelöst (siehe unten); der Realm (`unterrainer`, `auth.htl-leonding.ac.at`, `secureLectures`-Produktivinstanz auf `babylon5`) hat sich als sehr groß herausgestellt — **14.289 User** — und der volle Fetch scheitert jetzt reproduzierbar an einer bestimmten Stelle, nicht mehr an Auth.

**Live bestätigt am 2026-09-11, drei Versuche in Folge:** die Seite `GET .../users?first=14200&max=100&briefRepresentation=false` antwortet konsequent nicht innerhalb von 30s — auch nach Retry (3× mit Backoff, safeLearn-Commit `fe83073`) immer derselbe Timeout an genau diesem Offset. Alle Seiten davor (0 bis 14199) laufen normal durch, ca. 2,5s/Seite. Sieht nach einem serverseitigen Problem mit genau diesem User-Batch aus (Keycloak oder das LDAP-Backend dahinter), nicht nach einem Client-Problem — Client-seitige Fixes (Timeout, Retry) sind ausgereizt.

**Bereits gefunden und behoben, alles deployed (safeLearn + secureLectures, synchron):**
- 401 durch Token-Ablauf mitten in der Pagination-Schleife (Token lebt 5min, das Durchpaginieren des riesigen Realms dauert länger) — Token wird jetzt vor jeder einzelnen Seite/jedem Rollen-Lookup frisch geholt (`8711da9`).
- Zwei parallele Fetches konnten gleichzeitig starten (Plugin schickt leeren + echten Query fast gleichzeitig) — jetzt gebündelt auf einen In-Flight-Fetch (`467107d`).
- Cache-Timestamp wurde beim Start statt beim Abschluss gesetzt — bei einem Fetch, der länger als die 10min-TTL dauert, war der Cache sofort wieder "stale" (mitgefixt in `467107d`).
- Server-Auth-Gate kanonisierte die Plural-Client-Rolle (`teachers`/`students`) nicht — `33435ad`.
- Keycloak-Client `safelearn-plugin` hatte den `ldap`-Attribute-Mapper-Scope nicht zugewiesen — direkt in Keycloak nachgetragen (Gerald), Plugin-Commit `c22525b`.
- **Docker-Logs puffern Zeilen ohne `\n` komplett** — der Fetch sah lange wie gehängt aus, lief aber die ganze Zeit normal, nur unsichtbar. Progress-Logging jetzt zeilenweise (`d2fcfb4`). Siehe [[docker-logs-newline-buffering]].
- Startup-Warming (`8b3231e`): Cache wird beim Server-Start vorgewärmt statt beim ersten Request.
- Disk-Cache mit Count-basierter Change-Detection (`8b3231e`): `GET /users/count` vor jedem Refresh, Cache nur neu geholt wenn Count abweicht oder Disk-Cache älter als 24h. Persistiert unter `${DATA_DIR}` (Volume-Mount jetzt in `deploy/docker-compose.yml`, `DATA_DIR` jetzt auch tatsächlich in `deploy/.env` geschrieben — vorher fehlte das).
- Retry mit Backoff für einzelne Seiten-/Rollen-Fetches (`fe83073`) — verhindert, dass eine einzelne transiente Störung den kompletten Mehrminuten-Fetch verwirft.

**Inzwischen erledigt, ohne Zutun am Client:** die Stelle `first=14200` lag mitten in `OU=TestUsers`; seit deren Löschung am 2026-09-12 läuft der Fetch durch, der Disk-Cache ist geschrieben (Produktivinstanz meldet „disk cache matches Keycloak's count (2229)"). Nach dem Provider-Split vom 2026-09-13 steht der Count auf 1.978 — die Count-basierte Change-Detection holt beim nächsten Refresh von selbst neu.

Die damals vermuteten Ursachen (kaputtes LDAP-Attribut, langsame OU, Keycloak-Fehler beim Auflösen von `briefRepresentation=false`) waren alle falsch — es war schlicht die Grenze zum TestUsers-Block. Nichts mehr zu tun.

# Allgemein

## Prüfungsmodul: Online-MC-Tests und Notenbuch (in Arbeit: Change `exam-module`, P0+P1+P4 live seit 2026-10-17)
Kurze Multiple-Choice-Tests (typisch 4 Fragen in 10 min), die in safeLearn geschrieben und am Server ausgewertet werden, dazu ein Notenbuch pro Kurs (Klasse × Fach × Schuljahr) mit Semesternoten-Vorschlag und Override. Der Fragenpool wird einmal aus Moodle-XML (`htl-claude/moodle-quiz-questions/`) importiert, danach ist die DB (SQLite) die Wahrheit und ein Online-Editor der Weg. Entscheidungen, Betriebsstufen, Einbettung in Seiten, Datenmodell, Schutz gegen Schummeln, Phasen (29–43 Arbeitstage) und Zeitplan stehen in `AI/exam-module-plan.md`. Gerald will sich das erst überlegen, bevor die erste Phase (P0) als Change angelegt wird. Harter Termin, falls es fürs WS 26/27 zählen soll: Noteneintragungsende 05.02.2027.

**Stand 2026-10-17:** Das Notenbuch-Milestone ist erreicht. secureLectures läuft mit `EXAM_MODULE=on` (Repo-Variable in `guFalcon/secureLectures`), die Datenbank liegt in `/app/data/secure-lectures/exam.sqlite` auf babylon5, der Smoke-Check mit Geralds Lehreraccount ist bestanden (Schuljahr, Roster aus dem echten LDAP, Kurs, Eintrag → Vorschlag, Override, Schüleransicht). Als Nächstes P2 (Fragenpool).

## Betriebsstufe 1: Publishing ohne Keycloak (eigener Change, nach P4)
safeLearn soll sich auch ohne Keycloak betreiben lassen: `AUTH=none`, kein Login, jeder Leser hat genau die Rollen aus `READER_ROLES` (z. B. `teacher,examParticipant,4bhif`). Ohne die Variable hat er keine Rolle, und jeder eingeschränkte Abschnitt bleibt verborgen. Gedacht für den WYSIWYG-Container, dessen Vorlage `READER_ROLES=teacher` mitbringt, und für reines Publishing. Einstellungen und zuletzt besuchte Seite liegen im Browser. Was der Server beim Rendern braucht (`vt`, `ve`, …), muss als Cookie mitkommen, nicht über `localStorage`. Die Umschalter bleiben sichtbar, soweit die Rollen sie erlauben. `AUTH=none` muss ausdrücklich gesetzt sein und darf nie als Rückfall greifen, und `EXAM_MODULE=on` zusammen mit `AUTH=none` bricht den Start ab. Die Details stehen in `AI/exam-module-plan.md`, Abschnitt 3. Geschätzt 3–5 Arbeitstage, nicht auf dem kritischen Pfad für den 05.02.2027.

## Notenbuch: Spaltenüberschriften und fehlende Über-Spalte „Online-Tests“
Zwei Punkte im Notenbuch-Sheet (`exam/client/gradebook.js`), beide vom 2026-10-17:
1. **Spaltenüberschriften umbenennen.** Heute steht dort „Proposal“ (bzw. „Year proposal“ im Jahresblick), „Override“ und „Grade“. Gewünscht sind **Calculated Proposal**, **Teacher Override** und **Actual Grade**. Das gilt auch für die Zeilenbeschriftungen in der Einzelansicht eines Schülers.
2. **Die Über-Spalte der Kategorie Online-Tests fehlt.** Früher war sie im Sheet zu sehen, und im Config-Sheet existiert die Kategorie weiterhin mit ihren 25 %. Jetzt erscheint sie nicht mehr. Vermutlich wird eine Kategorie ohne Spalten seit dem Umbau zum Sheet (`gradebook-sheet`) nicht mehr gezeichnet, und für Online-Tests gibt es bis P3 nie eine Spalte, weil sie keinen `+` hat. Zu klären: Soll sie leer, aber mit Gewicht sichtbar bleiben? Die Kategorie zählt ohne Einträge ohnehin nicht zum Vorschlag.

## Admin-Seiten für Lehrer im Menü
Eigene Übersichtsseiten in der Web-App, die Lehrer über das Menü öffnen können. Erste zwei Seiten: (1) **unreferenzierte Anhänge**: die Liste, die `attachment-access-control` beim Start ins Log schreibt, als Seite, damit man die Dateien aus dem Repo werfen kann; (2) **Directory-/LDAP-Zustand**: das, was das Obsidian-Plugin heute auf seiner Übersichtsseite zeigt (Fetch-Status, Einträge, `builtAt`, übersprungene Datensätze, siehe `/api/admin/directory/status`). Hier im Browser mit Session-Auth statt Bearer-Token. Gibt es nur in Stufe 2 und 3, weil sie eine Lehrer-Identität brauchen.
