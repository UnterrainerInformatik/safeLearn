<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Darstellungsfehler

## Parsing Fehler bei End @@@ Block
 Wenn nach einem Block mit @@@ kein Enter mehr nach dem End-token kommt, wird dieser nicht als solcher erkannt und es erscheint ein @@@ im Text-Rahmen. Beispiel:
 ```text
{at}{at}{at} gerald
{at}{at}{at}{EOF}
 ```

## Anzeige Schülerblock
wenn ich einen Block einfüge pro Namen (Schülerblöcke einer Klasse einfügen), dann machst Du eine ### Überschrift mit dem Namen der Person rein. Lass das. Lass ihn leer (eine Leerzeile reicht als Inhalt des eingefügten Blocks), weil die UI ist jetzt schon so gut mit unserem Plugin, dass man das auch so ohne erkennt und der Schüler weiß eh wie er heißt :)

# Directory-Search

## g.unterrainer sieht weiterhin keine Personen/Klassen (offen, in Arbeit)
Symptom: Auf der `secureLectures`-Produktivinstanz (Realm `unterrainer`, `auth.htl-leonding.ac.at`) sieht `g.unterrainer` (Lehrer über LDAP `OU=Teachers`, zusätzlich `admin`-Client-Role auf `secureLectures`) im Obsidian-Plugin weder im Personen-Picker noch bei "List classes" irgendwelche Einträge — trotz normalem, funktionierendem Login.

**Bereits gefunden und behoben (deployed bzw. dokumentiert):**
- Server-Auth-Gate kanonisierte die Plural-Client-Rolle (`teachers`/`students`) nicht — behoben in Commit `33435ad` (`resolveCallerRoles` in `middlewares/directory-service.js`), bereits gemerged und auf `secureLectures` deployed. War aber nicht die alleinige Ursache für g.unterrainer, da sein Teacher-Grant über LDAP läuft.
- Der Keycloak-Client `safelearn-plugin` hatte den Client-Scope mit dem custom `ldap`-Attribute-Mapper nicht zugewiesen — Full Scope Allowed deckt nur eingebaute Rollen ab, keine custom Mapper. Direkt in Keycloak nachgetragen (Gerald), README dokumentiert das jetzt (Plugin-Commit `c22525b`).

**Weiterhin offen, aktuelle Ursache:** Ein zweiter, unabhängiger Keycloak-Client ist betroffen — `DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET` (`safeLearn-directory-service`), den `directory-service.js` benutzt, um die eigentliche Verzeichnisabfrage gegen Keycloaks Admin-REST-API zu machen (unabhängig vom Auth-Gate des Aufrufers). Live in `docker logs secureLectures` bestätigt, aktuell reproduzierend (nicht nur alte Log-Zeilen):
```
Directory search failed: Error: Keycloak admin user search answered with status 401
    at fetchDirectoryUserPage (file:///app/middlewares/directory-service.js:204:11)
```
Der `client_credentials`-Grant selbst gelingt (der Fehler passiert erst beim nachfolgenden `GET .../admin/realms/unterrainer/users`-Call), das Token wird also erfolgreich ausgestellt, aber von der Admin-API abgelehnt.

**Bereits ausgeschlossen** (alles einzeln geprüft, keins davon war die Ursache):
- `DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET` in `.env` stimmen mit Keycloak überein (ein doppelter, aber byte-identischer `.env`-Eintrag wurde bereinigt — Pipeline-Copy-Paste-Artefakt, ohne funktionale Auswirkung).
- Service-Account von `safeLearn-directory-service` hat `view-users`, `query-users`, `query-groups` auf `realm-management` zugewiesen — bestätigt sowohl direkt in der Keycloak-UI als auch im simulierten Access-Token via Clients → Evaluate (`resource_access.realm-management.roles` enthält `view-users`).
- Full Scope Allowed ist an für `safeLearn-directory-service`.
- Kein Cache-Bug: `openid-client`s `TokenSet.expires_in` ist ein Live-Getter (`expires_at - now()`), kein statischer Wert — der Token-Cache in `getDirectoryServiceToken()` ist korrekt.

**Diagnose-Tooling ergänzt, um die tatsächliche Ursache beim nächsten Versuch zu finden:**
- safeLearn-Commit `6fdd26d`: `fetchDirectoryUserPage` loggt bei einem Fehler jetzt zusätzlich den Response-Body von Keycloak sowie die unverifizierten Token-Claims (`azp`, `aud`, `exp`, `iat`, `sub`, `iss`) und die Server-Zeit. **Noch nicht gepusht/deployed.**
- Plugin-Commits `7a5bf28`/`c1a6011`: neuer Setting-Toggle "Debug logging" (default aus) loggt Token-Cache/Refresh-Outcome und die tatsächliche Such-Request-URL + Response-Status/-Body in die Obsidian-DevTools-Console — nötig, weil `requestUrl()` (Obsidian) am Chrome-DevTools-Network-Tab komplett vorbeiläuft (läuft über Electrons Hauptprozess). Build bereits direkt ins Test-Vault kopiert (`/mnt/data/source/HTL/secureLectures/.obsidian/plugins/safelearn-formatter/main.js`), sofort testbar (Plugin in Obsidian neu laden).

**Nächster Schritt bei Wiederaufnahme:** `6fdd26d` pushen → in `secureLectures` mergen → rebuilden/deployen. Dann "Debug logging" im Plugin einschalten, bei laufendem `docker logs secureLectures -f` eine frische Live-Suche auslösen, und die neuen Log-Details (Response-Body + Token-Claims) auswerten, um zu klären, warum die Admin-API ein Token ablehnt, das in jeder bisherigen Konfigurationsprüfung korrekt aussah.

# Allgemein
