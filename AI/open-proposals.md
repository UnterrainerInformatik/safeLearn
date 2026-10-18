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

## Betriebsstufe 1: Publishing ohne Keycloak (eigener Change, nach P4)
safeLearn soll sich auch ohne Keycloak betreiben lassen: `AUTH=none`, kein Login, jeder Leser hat genau die Rollen aus `READER_ROLES` (z. B. `teacher,examParticipant,4bhif`). Ohne die Variable hat er keine Rolle, und jeder eingeschränkte Abschnitt bleibt verborgen. Gedacht für den WYSIWYG-Container, dessen Vorlage `READER_ROLES=teacher` mitbringt, und für reines Publishing. Einstellungen und zuletzt besuchte Seite liegen im Browser. Was der Server beim Rendern braucht (`vt`, `ve`, …), muss als Cookie mitkommen, nicht über `localStorage`. Die Umschalter bleiben sichtbar, soweit die Rollen sie erlauben. `AUTH=none` muss ausdrücklich gesetzt sein und darf nie als Rückfall greifen, und `EXAM_MODULE=on` zusammen mit `AUTH=none` bricht den Start ab. Die Details stehen in `AI/exam-module-plan.md`, Abschnitt 3. Geschätzt 3–5 Arbeitstage, nicht auf dem kritischen Pfad für den 05.02.2027.

## Admin-Seiten für Lehrer im Menü
Eigene Übersichtsseiten in der Web-App, die Lehrer über das Menü öffnen können. Erste zwei Seiten: (1) **unreferenzierte Anhänge**: die Liste, die `attachment-access-control` beim Start ins Log schreibt, als Seite, damit man die Dateien aus dem Repo werfen kann; (2) **Directory-/LDAP-Zustand**: das, was das Obsidian-Plugin heute auf seiner Übersichtsseite zeigt (Fetch-Status, Einträge, `builtAt`, übersprungene Datensätze, siehe `/api/admin/directory/status`). Hier im Browser mit Session-Auth statt Bearer-Token. Gibt es nur in Stufe 2 und 3, weil sie eine Lehrer-Identität brauchen.

# Prüfungsmodul-UI (Design-Review 2026-10-18)

Leitlinien von Gerald für alle Einträge hier:
- Aktionen sind Buttons, keine Links.
- Was man auf einer Seite tun kann, sieht man auf den ersten Blick.
- Eine Klickstrecke für Seltenes ist erwünscht: Frage anzeigen → erst dort **Edit**.
- Funktion steckt in der Struktur selbst (Liste, Baum, Tabellenkopf), nicht in einem eigenen Menü oder als Link am Seitenende.

Die Bestandsaufnahme mit Datei:Zeile stammt aus einem Audit über `exam/client/*.js`, `exam/bar.js` und `css/exam.css`.

## Kategoriebaum per Drag-and-Drop statt eigener Kategorienseite
Heute laufen Anlegen, Umbenennen, Verschieben und Löschen über eine eigene Seite, `/exam/pool/categories` (`client/pool-categories.js`), die vom Pool aus als Textlink "Edit categories" unter dem Baum erreichbar ist (`client/pool.js:139`). Jeder Knoten trägt dort sechs Bedienelemente: ↑, ↓, Rename, ein `<select>` mit allen Kategorien plus einen eigenen Move-Button, + Subcategory und Delete. Das Inline-Panel hat kein Cancel.

Ziel ist, das direkt im Baum auf `/exam/pool` zu erledigen:
- **Ziehen auf einen Knoten** macht die Kategorie zur Unterkategorie.
- **Ziehen zwischen zwei Knoten** verschiebt sie auf dieselbe Ebene, angezeigt durch eine Linie zwischen den Elementen.
- Eine Frage aus der Liste auf eine Kategorie zu ziehen verschiebt die Frage.
- **Neu:** ein `+` am Knoten bzw. am Baumende öffnet ein kleines Namens-Popup (DE/EN) direkt in der Liste.
- **Umbenennen** im selben Popup, per Doppelklick oder Stift-Icon am Knoten.
- **Löschen** nur für leere Knoten, als Icon am Knoten mit Bestätigung.
- Die Server-Ablehnungen (Unterbaum, Duplikat, nicht leer) erscheinen am Knoten, nicht oben auf der Seite.

Danach entfällt die Kategorienseite. Tastaturbedienung (Ausschneiden/Einfügen o. ä.) wäre als Ersatz fürs Ziehen mitzudenken.

## Textlinks, die Aktionen sind, werden Buttons
Plain `<a>` statt Button, zum Teil als leise Zeile (`sl-exam-quiet`, Deckkraft .7):
- im Pool: **Edit** in der Vorschau, **New question**, **Edit categories** und **Import questions**;
- **Back to the pool**, viermal;
- **Open the gradebook** (Kursseite) und **Enter results in the gradebook** (Schülerseite);
- **Config sheet · Grading scale** über dem Notenbuch;
- auf der Testseite: **Add questions from the pool**, **Try this test as a student sees it** und **Solution on the board**;
- in der Testliste: **live view · class screen**;
- **Class screen** in der Live-Ansicht;
- **Download the format description** im Import.

Umgekehrt ist der Fragenname in der Pool-Liste ein Button, der wie ein Link aussieht (`sl-exam-link`). Dazu kommt ein einheitlicher Button-Stil fürs Modul: `sl-button` aus `css/buttons.css` wird dort nie benutzt, und viele Klassen sind reine Hooks ohne CSS (`sl-exam-delete`, `sl-exam-pool-new`, `sl-exam-pool-edit`, `sl-exam-editor-add`, `sl-exam-test-remove`, `sl-exam-live-release`, `sl-exam-import-go` …). `sl-exam-primary` ist nur fett. Hauptaktionen, die heute nicht primär sind:
- **Create test** im Pool;
- **Import n questions**;
- **Mark as reviewed**;
- **Make current**.

## Aktionen am Seitenende in die Struktur holen
- **Delete this test** steht unter allen Fragen ganz am Ende (`client/tests.js:212`) und gehört in den Kopf neben **Rename**.
- Die Meldungen der Testseite erscheinen unter dem Umbenennen-Formular, weit weg von Sittings und Delete. Sie gehören an die Aktion.
- Die **Kurse** stehen als Linkliste am Ende der Klassenseite, Anlegen geht nur übers `+` in der Leiste. Gewünscht ist die Liste mit einem `+ Course` darin.
- Die **Modul-Links** "Grading scale · Question pool" stehen als leise Zeile ganz unten auf `/exam/` ("Online tests" fehlt dort). Sie gehören in die Leiste oder als Buttons an den Kopf; die Notenskala ist sonst nur übers Notenbuch zu erreichen.
- **New question** ist versteckt, bis eine Kategorie gewählt ist (`client/pool.js:144`). Besser wäre es immer sichtbar, oder als `+` an der Kategorie im Baum.
- **Import n questions** steht unter den Vorschautabellen und gehört über die Vorschau.
- Die **Online-Tests-Liste** hat keinen Button **New test**; heute führt nur ein Satz in den Pool, und die Zusammenstellung erscheint erst mit einem Kurs in der Leiste.
- Die Auswahl im Pool ist unsichtbar: Ein Klick auf die Zeile wählt die Frage aus, aber es gibt keine Checkbox. Eine Checkbox pro Zeile würde das zeigen.
- Der Kommentar im Notenbuch steht nur im Tooltip (` ✎` mit `title`).

## Bestätigungen vereinheitlichen
Heute gibt es vier Muster:
- `window.confirm` beim Austragen aus dem Roster, beim Löschen von Spalte, Kategorie und Frage;
- Zweimal-Klick bei Delete this test und Submit;
- eine Bestätigung in der Seite bei Take back (Import);
- **keine Bestätigung** bei **Delete** eines geplanten Sittings, bei **Remove from the test** und bei **Release to another browser**.

Ein Muster fürs ganze Modul; der Zweimal-Klick passt zu "keine Browser-Dialoge". Das Sitting-Delete ohne Rückfrage zuerst. **Release to another browser** braucht ausdrücklich keine Bestätigung (Gerald, 2026-10-18), siehe "Live-Ansicht: bound to browser".

## Fehlende Aktionen
- Schuljahr, Klasse und Kurs lassen sich anlegen, aber nirgends umbenennen oder löschen.
- Die Live-Ansicht kann ein Sitting weder beenden noch verlängern.
- Die Schülerseite im Kurs hat keinen Weg zum vorigen/nächsten Schüler und oben keinen Rückweg zum Notenbuch.
- Die Leerzustände "Nobody is on this course's roster." und "There is no school year yet." führen nirgends hin; sie sollten den Button zur nächsten Aktion tragen.

## Konsistenz im Kleinen
- **Speichern:** Die Notenskala hat einen expliziten **Save**, alles andere speichert beim Ändern. Auf der Schülerseite fehlt der Hinweis "saved as it changes".
- **Labels:**
  - "Whole year" in der Leiste, "Whole year (summer semester)" im Notenbuch;
  - Leistenposition "Grades", Seite "Gradebook";
  - "One correct" gegenüber "One correct answer";
  - Title Case in den Notenbuch-Spaltenköpfen, sonst Sentence case;
  - "Deutsch"/"English" nebeneinander;
  - "true (Richtig)" und "false (Falsch)" im Editor;
  - "the Claude" im Import-Text.
- **Datum:** de-AT im Pool und Import, Browser-Locale in Klassen und Notenbuch.
- **Schreibseite:** Sie ist DE/EN lokalisiert, ihre Ergebnisanzeige und "Time is up" in der Vorschau sind aber nur Englisch.

## Schüler-Seite "Exams" (`/exam/my`): Ergebnisse während des Schreibens
Seit 2026-10-18 zeigt die Seite offene Tests und Ergebnisse untereinander. Läuft ein Versuch, steht die Schreibansicht oben und die Ergebnisse darunter.

**Entschieden (Gerald, 2026-10-18):** Während eines laufenden Versuchs werden die Ergebnisse ausgeblendet. Bis zur Abgabe sind sie uninteressant und lenken nur ab. Nach der Abgabe erscheinen sie wieder.

## Sittings nach Unterrichtseinheit statt nach Uhrzeit planen (Change `exam-school-periods` angelegt 2026-10-18)
Heute plant man ein Sitting mit zwei `datetime-local`-Feldern **Opens** und **Closes** plus **Minutes per attempt** (`client/tests.js`, Formular des Sittings). Künftig soll das über die Unterrichtseinheiten der Schule gehen.

**Konfiguration:** Die Einheiten gelten für die ganze Schule und kommen aus einer Env-Variable des Deployments, z. B. `SCHOOL_PERIODS="0=07:05-07:55,1=08:00-08:50,…"`. Name und Format sind noch offen.

**Mit gesetzter Variable** wählt die Lehrkraft:
- ein Datum (vorbelegt mit heute);
- **von Einheit** und **bis Einheit** (vorbelegt: die laufende bzw. die nächste Einheit, von = bis).

Intern bleibt alles Zeit: `opens_at` ist der Beginn der Von-Einheit, `closes_at` das Ende der Bis-Einheit. Datenmodell, API und Server-Logik bleiben unverändert.

**Anzeige:**
- Listen und Live-Ansicht zeigen "Mo 20.10., 3.–4. EH".
- Ein Fenster, das nicht auf Einheitsgrenzen liegt (alt oder per API angelegt), wird weiter mit Uhrzeit angezeigt.
- Beim Ändern eines solchen Sittings bleibt es bei den Zeitfeldern, oder es gibt einen Umschalter "genaue Zeit".

**Ohne Variable** gilt das heutige Verhalten mit Zeitstempeln (Fallback).

**Zeiten der Schule (safeLearn/secureLectures), Liste von Gerald, 2026-10-18:**

| Einheit | Zeit |
|---|---|
| 0 | 07:05–07:55 (bisher nie gebraucht) |
| 1 | 08:00–08:50 |
| 2 | 08:55–09:45 |
| 3 | 10:00–10:50 |
| 4 | 10:55–11:45 |
| 5 | 11:50–12:40 |
| 6 | 12:45–13:35 |
| 7 | 13:40–14:30 |
| 8 | 14:35–15:25 |
| 9 | 15:30–16:20 |
| 10 | 16:25–17:15 |
| 11 | 17:20–18:05 |
| 12 | 18:05–18:50 |
| 13 | 19:00–19:45 |
| 14 | 19:45–20:30 |
| 15 | 20:40–21:25 |
| 16 | 21:25–22:10 |

Die Pausen sind unregelmäßig: Manche Einheiten schließen ohne Pause an, vor der 13. und der 15. liegen 10 min. Deshalb muss die Konfiguration jede Einheit mit Beginn und Ende einzeln angeben und darf keine Taktung ableiten.

**Weitere offene Punkte:**
- Ob **Minutes per attempt** mit Einheiten vorbelegt wird, etwa mit der Länge des Fensters.
- Ob die Datumsspalten im Notenbuch ebenfalls Einheiten brauchen; eher nein, dort reicht ein Datum.
- Die Variable muss in die deployment-Config von secureLectures, siehe [[securelectures-downstream-role]].

## Mehrsprachigkeit der Oberfläche: Sprache und Locale pro Benutzer (eigener Change)
Die Oberfläche des Prüfungsmoduls ist heute englisch. Gerald will sie pro Benutzer im Settings-Untermenü (Zahnrad oben rechts) umschalten können, auf **Englisch** oder **Deutsch**.

**Sprache und Locale getrennt.** Die Sprache bestimmt die Texte, die Locale die Formate von Datum, Uhrzeit und Zahlen. Gerald selbst will Englisch mit deutscher Locale. Das geht heute nicht: Chrome nimmt das Format von `<input type="date">` und `datetime-local` aus dem System bzw. der Browsersprache, nicht von der Seite. Ein `lang`-Attribut ändert daran nichts.

**Was das verlangt:**
- **Zwei Präferenzen** als Keycloak-User-Attribute, wie `dm` und `vt`, z. B. `lang` (`en`/`de`) und `loc` (`en-GB`/`de-AT`). Der Server braucht sie beim Rendern, weil Seitentitel, Seitenkörper der Routen (`/exam/my`: "Exams", "Open online tests" …), Top-Bar-Labels und Modulleiste (`exam/bar.js`) serverseitig entstehen. Der Client bekommt sie über `/exam/api/me` oder ein Attribut am Frame.
- **Texte auslagern:** ein Katalog pro Sprache und ein `t(key, params)` in Client und Server. Betroffen sind rund 4.000 Zeilen in `exam/client/*.js` und die Server-Routen. **Entschieden 2026-10-18:** Die Einstellung gibt es für alle Benutzer, nicht nur im Prüfungsmodul. Damit wird auch der Rest der App-Oberfläche übersetzt, etwa "Home", der Suchhinweis "… at least 3 characters", "Site" und "Content" in der Seitenleiste und das Settings-Menü selbst. Der Markdown-Inhalt der Seiten bleibt, wie er geschrieben ist.
- **Formate über `Intl` mit expliziter Locale** statt `toLocaleDateString()` ohne Argument. Heute gibt es etwa 15 Stellen, gemischt aus Browser-Locale und hartem `de-AT`; das ist auch ein Punkt aus "Konsistenz im Kleinen".
- **Eigene Datums- und Zeitwahl** statt der nativen Inputs, damit die Locale greift: Notenbuch-Spalten, Schuljahresdaten, Sittings. Mit "Sittings nach Unterrichtseinheit" schrumpft die Zeitwahl bei gesetzter Variable auf Datum plus Einheit. Ein Uhrzeitfeld braucht es dann nur noch im Fallback.
- **Schreibansicht der Schüler (entschieden 2026-10-18):** Inhalte für Schüler, also Fragen und Antworten, kommen immer in der Kurssprache. Die Bedienung folgt der Spracheinstellung des Benutzers.

**Technik — Empfehlung: kein Vue, eine schlanke eigene Lösung.**
- Das Modul ist ohne Build-Schritt gebaut: Custom Elements, ein `h()`-Helfer (`exam/client/frame.js`) und ES-Module. Vue ginge auch ohne Build (`vue.esm-browser`).
- Ein Umbau von rund 4.000 Zeilen funktionierender und getesteter Oberfläche löst die Mehrsprachigkeit aber nicht besser. Er kostet Wochen, und das vor dem harten Termin 05.02.2027.
- Gute Gründe für ein Framework wären erst Drag-and-Drop-Baum, Popups und mehr Zustand in der UI. Selbst die gehen mit Custom Elements gut.
- Für i18n reicht ein eigenes `t()` mit JSON-Katalogen, ohne Bibliothek.
- **Entschieden (Gerald, 2026-10-18):** Die Übersetzungen liegen als JSON nach dem System von BabelEdit, also eine JSON-Datei pro Sprache (etwa `en.json`, `de.json`) mit denselben Schlüsseln. So lassen sie sich später mit BabelEdit pflegen und um weitere Sprachen erweitern. Das genaue Dateilayout (verschachtelte oder flache Schlüssel, Ablageort) wird im Change festgelegt und muss sich in BabelEdit öffnen lassen.
- Für die Datumswahl gibt es zwei Wege: eine kleine eigene Monatsansicht als Custom Element (geschätzt 150–250 Zeilen, Tastatur und ARIA mitgedacht) oder eine schmale Bibliothek mit Locale-Unterstützung und ohne Abhängigkeiten. Bei Bibliotheken vorher den Wartungsstand prüfen: flatpickr ist bekannt, aber seit Jahren ohne Release, als Alternative wäre etwa vanilla-calendar-pro zu prüfen. Tendenz: eigene Ansicht, weil sie nur die Locale-Formate von `Intl` braucht und mit der Einheitenwahl zusammen entsteht.

**Reihenfolge:** sinnvoll nach oder zusammen mit "Sittings nach Unterrichtseinheit", weil beide das Sitting-Formular neu bauen. Und vor der Button- und Label-Vereinheitlichung aus dem Design-Review, damit die Texte nur einmal angefasst werden.

## Live-Ansicht: "bound to browser" statt "Release to another browser"
In der Live-Ansicht (`client/live.js`) gibt es pro Schüler, der gerade schreibt, den Button **Release to another browser**. Er hebt die Bindung des Versuchs an den Browser auf, in dem er gestartet wurde, damit der Schüler auf einem anderen Gerät weiterschreiben kann. Das versteht man ohne Erklärung nicht.

**Gerald, 2026-10-18:**
- Eine neue Spalte **bound to browser** zeigt den Browser-String (User-Agent) des gebundenen Browsers.
- Aus Platzgründen nur gekürzt, etwa Browser, Version und Betriebssystem. Den vollen String zeigt ein Mouseover (`title`) oder ein Klick-Icon, damit es auch auf Touch-Geräten geht.
- Der Button heißt **Unbind browser** und braucht **keine** Bestätigung. Damit fällt er aus "Bestätigungen vereinheitlichen" heraus.

Voraussetzung: Der User-Agent muss beim Binden mitgespeichert werden. Heute liegt pro Versuch nur der Hash des Geräte-Geheimnisses in der DB (`attempt`). Das braucht eine Migration, und Versuche, die vorher gebunden wurden, zeigen "unknown". Ob abgewiesene Browser ("n refused") ihren String ebenfalls zeigen sollen, ist noch offen. Für die Lehrkraft wäre das ein Hinweis, mit welchem Gerät jemand es versucht hat.

