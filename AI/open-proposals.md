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

## Prüfungsmodul: Online-MC-Tests und Notenbuch (in Arbeit: Change `exam-module`, P0+P1+P4+P2 live seit 2026-10-17)
Kurze Multiple-Choice-Tests (typisch 4 Fragen in 10 min), die in safeLearn geschrieben und am Server ausgewertet werden, dazu ein Notenbuch pro Kurs (Klasse × Fach × Schuljahr) mit Semesternoten-Vorschlag und Override. Der Fragenpool wird einmal aus Moodle-XML (`htl-claude/moodle-quiz-questions/`) importiert, danach ist die DB (SQLite) die Wahrheit und ein Online-Editor der Weg. Entscheidungen, Betriebsstufen, Einbettung in Seiten, Datenmodell, Schutz gegen Schummeln, Phasen (29–43 Arbeitstage) und Zeitplan stehen in `AI/exam-module-plan.md`. Gerald will sich das erst überlegen, bevor die erste Phase (P0) als Change angelegt wird. Harter Termin, falls es fürs WS 26/27 zählen soll: Noteneintragungsende 05.02.2027.

**Stand 2026-10-17:** Das Notenbuch-Milestone ist erreicht. secureLectures läuft mit `EXAM_MODULE=on` (Repo-Variable in `guFalcon/secureLectures`), die Datenbank liegt in `/app/data/secure-lectures/exam.sqlite` auf babylon5, der Smoke-Check mit Geralds Lehreraccount ist bestanden (Schuljahr, Roster aus dem echten LDAP, Kurs, Eintrag → Vorschlag, Override, Schüleransicht). Als Nächstes P2 (Fragenpool).

**Stand 2026-10-17, später:** P2 ist live. Der Fragenpool ist in secureLectures importiert: 94 Fragen in 22 Kategorien, 9 Essays verworfen, 7 Bilder. Lehrer browsen ihn unter `/exam/pool`. Als Nächstes P3 (Online-Tests).

**2026-10-17, Planung:** P3 ist als eigener Change `exam-online-tests` herausgelöst (Tasks, Spec `online-test`, Design D8/D9 aus `exam-module` dorthin verschoben), zusammen mit zwei Knöpfen in der Modulleiste: Question Pool und Online-Tests. `exam-module` behält P6, P7 und P5 und damit diesen Eintrag.

**2026-10-17, Planung:** P7 (Fragen-Editor) ist als eigener Change `exam-question-editor` herausgelöst (Tasks, Spec `question-editor`). Entschieden: Texte werden in einer schmalen Rich-Text-Leiste über dem gespeicherten HTML bearbeitet. Jede Lehrkraft darf Fragen zurückziehen, reaktivieren und löschen, gelöscht werden kann aber nur eine nie verwendete Frage. P6 ist inzwischen umgesetzt, `exam-module` behält P5 und damit diesen Eintrag.

**Stand 2026-10-17, abends:** P7 ist live und `exam-question-editor` archiviert. Lehrer bearbeiten und ergänzen Fragen unter `/exam/pool` ("Edit", "New question", "Edit categories"), Bilder bis 2 MB, Zurückziehen statt Löschen für benutzte Fragen. Die Antworten haben im Editor keine Reihenfolge mehr, weil jeder Versuch sie mischt. Smoke-Check mit Geralds Lehreraccount an einer echten Frage bestanden (unverändert speichern, dann eine Korrektur). Am selben Abend wurde Geralds Probetest `test-test2` aus WMC 4BHIF per Hand aus der Datenbank entfernt (Kopie davor in `exam-backups/`), weil ein geschriebener Test sich über die Oberfläche nicht löschen lässt. Als Nächstes P5 (Schuljahreswechsel).

**2026-10-18:** `exam-online-tests` (P3) ist archiviert. Statt eines Pilots mit einer Klasse hat Gerald mehrere Sittings mit einem zweiten (Schüler-)Konto auf secureLectures durchgespielt und den Ablauf bestätigt; Klassen-Aggregate gibt es deshalb keine. In `exam-module` bleibt P5.

## Betriebsstufe 1: Publishing ohne Keycloak (eigener Change, nach P4)
safeLearn soll sich auch ohne Keycloak betreiben lassen: `AUTH=none`, kein Login, jeder Leser hat genau die Rollen aus `READER_ROLES` (z. B. `teacher,examParticipant,4bhif`). Ohne die Variable hat er keine Rolle, und jeder eingeschränkte Abschnitt bleibt verborgen. Gedacht für den WYSIWYG-Container, dessen Vorlage `READER_ROLES=teacher` mitbringt, und für reines Publishing. Einstellungen und zuletzt besuchte Seite liegen im Browser. Was der Server beim Rendern braucht (`vt`, `ve`, …), muss als Cookie mitkommen, nicht über `localStorage`. Die Umschalter bleiben sichtbar, soweit die Rollen sie erlauben. `AUTH=none` muss ausdrücklich gesetzt sein und darf nie als Rückfall greifen, und `EXAM_MODULE=on` zusammen mit `AUTH=none` bricht den Start ab. Die Details stehen in `AI/exam-module-plan.md`, Abschnitt 3. Geschätzt 3–5 Arbeitstage, nicht auf dem kritischen Pfad für den 05.02.2027.

## Admin-Seiten für Lehrer im Menü (Change `teacher-admin-pages` angelegt 2026-10-18)
Eigene Übersichtsseiten in der Web-App, die Lehrer über das Menü öffnen können. Erste zwei Seiten: (1) **unreferenzierte Anhänge**: die Liste, die `attachment-access-control` beim Start ins Log schreibt, als Seite, damit man die Dateien aus dem Repo werfen kann; (2) **Directory-/LDAP-Zustand**: das, was das Obsidian-Plugin heute auf seiner Übersichtsseite zeigt (Fetch-Status, Einträge, `builtAt`, übersprungene Datensätze, siehe `/api/admin/directory/status`). Hier im Browser mit Session-Auth statt Bearer-Token. Gibt es nur in Stufe 2 und 3, weil sie eine Lehrer-Identität brauchen.

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

## Eine vorbeigegangene Sitzung neu ansetzen (offen, 2026-10-19)
**Gerald, 2026-10-19:** Ein Test lief leer durch, niemand hat geschrieben. Gerald will ihn neu ansetzen: Falls es Ergebnisse gibt, werden sie gelöscht, und die Sitzung wird verschoben. Die alten Einstellungen bleiben dabei erhalten. Meistens ändert sich nur der Tag.

**Heute (Code-Stand 2026-10-19):**
- `updateSitting` und `deleteSitting` (`exam/tests.js`) verlangen `requireNotOpened`. Ändern und Löschen gibt es also nur, solange die Sitzung noch nicht offen war. Auf der Testseite stehen **Change** und **Delete** nur bei einer geplanten Sitzung. Eine vorbeigegangene Sitzung lässt sich weder verschieben noch löschen.
- Ausweg heute: eine **Nachholsitzung** (`makeup`) anlegen. Die hat aber eine Teilnehmerliste und keine Dauer, die man frei wählen kann, und die alte Sitzung bleibt als "over" stehen.
- Versuche löscht heute nur ein Admin, und zwar einzeln (**Delete attempt** in der Live-Ansicht) oder mit dem ganzen Test (**Delete this test**).
- Die Spalte im Notenbuch ist auf die erste Sitzung datiert (`refreshUsageDate`). Mit dem Verschieben wandert dieses Datum mit, vielleicht sogar ins andere Semester.

**Vorschlag:** Eine beendete Sitzung bietet **Neu ansetzen**. Das öffnet das bestehende Sitzungsformular, vorbelegt mit denselben Stunden, derselben Dauer und denselben Teilnehmern; als Tag ist der nächste Schultag vorgeschlagen. Beim Speichern werden in einer Transaktion die Versuche der Sitzung gelöscht und das Fenster verschoben. Mit Versuchen wird zweimal geklickt, und die Beschriftung nennt die Zahl ("Noch einmal klicken: 3 Versuche löschen und neu ansetzen").

**Vor einem Change zu klären:**
- Was heißt "alte Einträge beibehalten"? Meine Lesart: Teilnehmer, Dauer und Stunden der Sitzung bleiben gleich, nur das Datum ändert sich. Oder sollen die gelöschten Ergebnisse irgendwo nachvollziehbar bleiben, etwa im Backup oder in einem Protokoll?
- Wer darf das? Ohne Versuche jede Lehrkraft. Mit Versuchen löscht es Geschriebenes, und das ist bisher Admin-Sache (`exam-record-maintenance`).
- Was passiert mit den Nachholsitzungen eines Tests, wenn die erste Sitzung verschoben wird?
- Wandert das Datum der Notenbuch-Spalte mit, auch über die Semestergrenze?

# Prüfungsmodul-UI (Design-Review 2026-10-18)

Als Changes angelegt am 2026-10-18: `exam-ui-consistency` (archiviert 2026-10-18), `exam-my-hide-results-while-writing` (archiviert 2026-10-19) und `exam-live-bound-browser`.

Leitlinien von Gerald für alle Einträge hier:
- Aktionen sind Buttons, keine Links.
- Was man auf einer Seite tun kann, sieht man auf den ersten Blick.
- Eine Klickstrecke für Seltenes ist erwünscht: Frage anzeigen → erst dort **Edit**.
- Funktion steckt in der Struktur selbst (Liste, Baum, Tabellenkopf), nicht in einem eigenen Menü oder als Link am Seitenende.

Die Bestandsaufnahme mit Datei:Zeile stammt aus einem Audit über `exam/client/*.js`, `exam/bar.js` und `css/exam.css`.

