<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Lehrer ohne Namen im AD (offen)
118 Lehrer-Konten haben im AD weder `givenName` noch `sn` und erscheinen im Personen-Picker als Kennung statt als Name. Nach dem Provider-Split am 2026-09-13 neu gemessen: unverändert 118 (von jetzt 250) — es ist also eine Datenlücke im AD, kein Mapper-Problem. Zu beheben entweder an der Quelle (Gerald hat dort keinen Schreibzugriff) oder durch eine lesbarere Darstellung der Kennung im Picker.

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

## Die Hauptschrift wird ohne Fallback gesetzt
`applyAttributes()` in `obsidian-page.js` schreibt die gewählte Hauptschrift als Inline-Style auf `#markdown-content` — `mainContent.style.fontFamily = "main " + font` — und die Navigationsschrift ebenso auf jedes `.nav-font`-Element. Beide nennen eine ausgelieferte Family **ohne Fallback-Kette**. Kommt die Datei nicht an, fällt der Text auf die Default-Schrift des Browsers zurück, typischerweise eine Serife, statt auf eine Schrift derselben Art.

Die Regel dazu steht seit `sharpen-the-page-a-reader-reads` in docs-development.md unter „Naming a font in a stylesheet", und `reading-legibility` verlangt sie für jede Deklaration, die eine ausgelieferte Family nennt. `test/checks/legibility.js` prüft aber nur `css/` und erreicht diese beiden Stellen nicht.

Warum es nicht in jenem Change miterledigt wurde: ein pauschales `, sans-serif` wäre falsch. `assets/main-fonts/` enthält mit „EB Garamond" eine Serife und mit „FiraCode"/„Ubuntu Mono" zwei Monospace-Schriften — die richtige generische Family hängt an der einzelnen Schrift, das ist also eine kleine Zuordnungstabelle und keine Zeile. Gerald am 2026-09-14: vorerst so lassen.
