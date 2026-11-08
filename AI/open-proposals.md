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

## Lehrer-Vorschau: Chrome ausblenden und mit Submit beenden
In der Lehrer-Vorschau (`preview: 1`) bleiben Sidebar, Burger, die Buttons rechts in der Top-Leiste und das Settings-Menü sichtbar, obwohl die Vorschau den Test so zeigen soll, wie ihn ein Schüler sieht. Ursache (2026-11-08 nachgesehen): `writingPage` in `exam/client/attempt.js` ruft `announce(true)` nur ohne Vorschau auf — ohne `sl-exam-writing`-Event setzt `exam/client/exam-client.js` kein `sl-writing` auf `<html>`, und genau diese Klasse blendet in `css/exam.css` das Chrome aus (Change `exam-fullscreen-chrome`, D1–D3: „A preview announces nothing“).

Dazu: Submit in der Vorschau zeigt nur `exam.attempt.previewNotSubmitted` und lässt die Seite im Vollbild — der Lehrer kommt nur per Esc raus. Das Nicht-Abgeben ist richtig so; Submit soll aber die Vorschau beenden und `leaveFullscreen()` aufrufen, wie beim echten Abgeben (D4). Zu klären: Was zeigt die Seite danach (zurück zum Start der Vorschau, Hinweis „Vorschau beendet“?), und darf das Ausblenden nicht die Hot-Reload-Sperre mitziehen, die an `sl-writing` hängt (für einen Lehrer, der parallel die Angabe editiert, ist ein Reload der Vorschau eher erwünscht). Ein Countdown-Ende in der Vorschau (`timeIsUpPreview`) sollte vermutlich gleich behandelt werden.
