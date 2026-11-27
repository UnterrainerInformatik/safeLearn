---
name: ad-no-student-photos
description: "Das on-prem-AD der Schule trägt keine Fotos: 0 von 2.261 Konten haben thumbnailPhoto/jpegPhoto (2026-11-27 gemessen, mit objectGUID als Gegenprobe); Outlook/Teams-Bilder kommen aus Exchange Online und sind von Schülern änderbar"
metadata:
  node_type: memory
  type: project
  originSessionId: 8b36c49a-d17e-46de-b0fc-8e818ee44724
  modified: 2026-11-27T18:36:51.594Z
---

Gemessen am 2026-11-27 für die Idee mit den Schülerfotos (Grading-Liste, Live-View, A/B-Gruppen, später Sitzplan): Beide LDAP-Provider der `unterrainer`-Realm (`ldap-teachers`, `ldap-students`, vendor `ad`) hatten keinen Foto-Mapper. Mit temporären binären Mappern (`always.read.value.from.ldap`, sofort wieder gelöscht) trugen **0 von 2.261 Konten** `thumbnailPhoto` oder `jpegPhoto`. Die Gegenprobe mit `objectGUID` ergab 300 von 300 Konten, die Null ist also echt und liegt nicht an fehlenden Leserechten. Skript: `~/scripts/realm-directory-cleanup/photo_probe.py` auf babylon5.

**Why:** Gerald sieht die Fotos in Outlook und Teams. Die kommen aber aus Exchange Online (M365), wo die Schüler sie selbst auf „Blödsinn“ ändern, also taugen sie nicht. Die offiziellen Fotos sieht er in WebUntis. Die Platform API von WebUntis dokumentiert für Schüler nur Stammdaten, keine Fotos.

**How to apply:** Den Weg über AD oder Keycloak für Fotos nicht noch einmal prüfen. Kandidaten sind die Originaldateien hinter den WebUntis-Fotos (Fotograf oder Sekretariat) als Admin-Import, ersatzweise eine Anfrage bei Untis. Am 2026-11-27 war außerdem `KC_CLIENT_SECRET` in `.env.sh` veraltet, Gerald hat ihn erneuert ([[keycloak-bot-account]]).
