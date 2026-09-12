<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Realm auf zwei LDAP-Provider aufteilen (offen — wartet auf das Bind-Passwort)
Der Fetch selbst ist **gelöst** (Details im erledigten Abschnitt darunter). Offen ist die Ursache dahinter: `OU=TestUsers` (~12.060 synthetische Konten) liegt im Suchbereich der LDAP-Föderation, und jede Aufzählung, die über das lokale Ende hinausreicht, importiert sie nach — siehe [[keycloak-import-on-demand]]. Gerald hat keinen AD-Zugriff, die OU kann also nicht an der Quelle verschwinden; stattdessen wird der Suchbereich auf die zwei OUs verengt, die er braucht (Students, Teachers).

**Stand 2026-09-12, halb fertig:**
- `ldap-teachers` ist angelegt (`usersDn=ou=Teachers,ou=HTL,…`, searchScope 2, UNSYNCED/import wie das Original, alle 9 Mapper inkl. `ldap-mapper` repliziert) — aber **deaktiviert**, weil Keycloak `bindCredential` nur maskiert herausgibt und Gerald das Passwort remote besorgen muss.
- Der bisherige Provider heißt jetzt `ldap-students`, sein `usersDn` steht aber **bewusst noch auf `ou=HTL,…`** (zurückgedreht): mit der Verengung auf `ou=Students` lägen die 241 Lehrer im Suchbereich keines aktiven Providers, und Keycloak entfernt bei totem `federationLink` die lokale Kopie beim nächsten Zugriff — Lehrer könnten sich also aussperren.
- App-eigene User-Attribute (`config`, `lastVisitedUrl`) von 175 Benutzern sind gesichert, davon 5 Lehrer. Sie gehen bei einem Neuimport verloren und müssen danach zurückgeschrieben werden.

**Wenn das Bind-Passwort da ist, in dieser Reihenfolge:**
1. Passwort in `ldap-teachers` eintragen, *Test authentication*, Provider aktivieren.
2. Prüfen, dass er die 241 Lehrer im AD tatsächlich sieht — vor allem anderen.
3. `ldap-students` auf `ou=Students,ou=HTL,…` verengen.
4. Die 241 lokalen Lehrer-Kopien löschen, über den neuen Provider frisch importieren, die 5 gesicherten Einstellungen zurückschreiben. Neue Keycloak-IDs sind unkritisch (die App persistiert keine), laufende Sessions brechen aber.
5. Manuellen Sync auf beiden Providern. Erwartung danach: 1.958 föderierte User (1.717 + 241) plus 7 rein lokale Konten; die 264 aus Exams/Special/service fallen heraus (von Gerald als egal bestätigt) und dienen als Kanarienvogel für das Verhalten bei totem `federationLink`.
6. Danach `manage-realm` und `manage-users` am `safeLearn-directory-service` wieder abziehen — im Normalbetrieb liest der nur.

Offen nebenbei: 118 der 242 Lehrer haben im AD weder `givenName` noch `sn` und erscheinen im Personen-Picker als Kennung statt als Name. Nach dem Import erneut messen. Und die vier `OU=Exams*`-Pools à exakt 36 sehen dem TestUsers-Muster ähnlich — falls sie doch gebraucht werden, vor Schritt 3 klären.

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

**Noch nie erfolgreich durchgelaufen:** der Disk-Cache wurde entsprechend noch nie geschrieben (nur bei komplettem Erfolg), jeder Neustart läuft bis first=14200 und scheitert dort erneut.

**Nächster Schritt bei Wiederaufnahme:** Keycloak/LDAP direkt prüfen (Gerald, braucht Admin-Zugriff, den die Session nicht hat) — was ist an den ~100 Usern ab Offset 14200 anders? Kandidaten: ein einzelner User mit kaputtem/übergroßem LDAP-Attribut, eine langsame OU, oder ein Keycloak-seitiger Fehler beim Auflösen der vollen Repräsentation (`briefRepresentation=false`) für genau diesen Batch. Eventuell hilft ein direkter Blick in Keycloaks eigene Logs während eines Reproduktionsversuchs.

# Allgemein
