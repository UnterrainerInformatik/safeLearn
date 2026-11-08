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

## Optionale Sicherheitsstufe: Vollbild + Tickrate
Gerald, 2026-11-08: Eine **optionale** zusätzliche Stufe für Online-Tests, pro Sitzung einschaltbar (vermutlich eine Spalte auf `sitting`, beim Anlegen der Sitzung zu setzen).

**Vollbild-Ansage.** Ist die Stufe an, erinnert die Live-Ansicht die Lehrkraft, zu verkünden, dass die Browser auf Vollbild (F11) geschaltet werden. Dieselbe Bitte steht beim Schüler am Beginn des Tests, sinngemäß: „Bitte auf Vollbild schalten und den Tab nicht mehr wechseln, bis du fertig bist und abgegeben hast — sonst kann das verdächtig aussehen. Danke.“ Naheliegend: der Hinweis auch auf der Klassenansicht für den Beamer (`/exam/sittings/<id>/screen`), dort aber weiterhin ohne Signale.

**Tickrate.** Die Tickrate des Tabs wird gemessen und fließt in die Live-Ansicht ein: eigene Spalte, Warnung „Tickrate Down!“, als %-Zahl und Dauer, sortierbar.

Stand im Code (2026-11-08 nachgesehen): Der Heartbeat aus `exam-hidden-page-signals` zählt schon die `requestAnimationFrame`-Frames pro Beat (alle 5 s, `exam/client/attempt.js`), der Server nutzt sie aber nur binär — unter 5 fps gilt der Beat als „hidden by timing“ (`hidden_count`/`hidden_ms`). Die Rohzahl wird nicht gespeichert. Neu wäre also vor allem: die Rate pro Beat aufheben und als Anteil zeigen.

Zu klären:
- **Bezugsgröße der %-Zahl.** Bildschirme laufen mit 60/120/144 Hz, ein fester Sollwert passt nicht. Vorschlag: Anteil an der eigenen Grundrate des Schülers (z. B. Median der ersten sichtbaren Beats), „Tickrate Down!“ unter einer Schwelle (z. B. 50 %), Dauer = Summe der Beats darunter.
- **Was ein Abfall zwischen „normal“ und „unter 5 fps“ eigentlich anzeigt.** Ein teilweise verdecktes Fenster zeichnet laut D2 weiter mit voller Rate, das sieht die Tickrate also nicht. Fehlalarme drohen durch Energiesparmodus (Chrome deckelt auf 30 fps → 50 %), Last, VMs. Vor der Umsetzung im Harness/echten Browsern messen, welche Szenarien die Rate wirklich drücken.
- **rAF-Frames oder Timer-Ticks** (Jitter von `setInterval`) oder beides — „Tickrate“ kann beides meinen; versteckte Tabs drosseln Timer auf 1/s.
- **Vollbild prüfen oder nur bitten?** F11 ist über die Fullscreen-API nicht sichtbar (`document.fullscreenElement` bleibt leer); erkennbar nur heuristisch (`matchMedia("(display-mode: fullscreen)")`, Fenster- vs. Bildschirmgröße). Alternative: ein „Vollbild starten“-Knopf mit `requestFullscreen()`, dann meldet `fullscreenchange` das Verlassen (Esc) — wäre ein weiteres Signal in der Spalte „Auffällig“. Gilt wie bisher: nur markieren, nie blockieren, nie beim Schüler anzeigen.
- **Sortierung.** Die Live-Liste sortiert heute fest (Status, dann Zeit außer Fokus + hidden by timing). „Mit Sortierung“ heißt entweder klickbare Spaltenköpfe (neu für die Ansicht) oder die Tickrate-Dauer geht in den festen Sortierschlüssel ein.
- Neue Spalten auf `attempt` (Grundrate, Zeit unter Schwelle, ggf. Vollbild-Austritte) laufen über die Closed-Year-Trigger ohnehin mit; i18n-Keys im BabelEdit-Format.
