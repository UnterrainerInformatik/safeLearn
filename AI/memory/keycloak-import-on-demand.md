---
name: keycloak-import-on-demand
description: "Keycloaks users/count zählt nur die lokale DB, GET /users paginiert zusätzlich in die LDAP-Föderation und importiert dabei — Lesen verändert den Realm; erklärt das 'Phantom-Ende' und das Wachstum auf 14.289"
metadata:
  type: project
---

Am 2026-09-12 live an der `unterrainer`-Realm nachgewiesen: **Blättern durch `GET /admin/realms/{realm}/users` ist kein reiner Lesevorgang.** Der Count stieg allein durch Paginieren von 2.229 auf 2.619 (+390), ohne dass ein Sync lief.

Mechanismus: `users/count` zählt ausschließlich Keycloaks lokale DB. `GET /users?first=…` mischt dagegen lokale DB **und** LDAP-Föderation — reicht die angeforderte Seite über das lokale Ende hinaus, fragt Keycloak den LDAP-Provider nach dem Rest und legt bei `importEnabled` jeden gefundenen Satz lokal an. Deshalb liefert `first=2200` volle 100 Sätze, obwohl der Count 2.229 meldet, und deshalb sind die Sätze jenseits des Counts alle *verschieden* (keine Dubletten).

**Manual sync schützt davor nicht.** `fullSyncPeriod=-1` steuert nur den periodischen Hintergrund-Job, nicht diesen Pfad. Gerald ging vom Gegenteil aus (2026-09-12: "das ldap federation ist auf manual sync gestellt. das darf garnix holen eigentlich"). Auch ein Login oder eine Suche im Admin-UI importiert auf demselben Weg.

**Was das rückwirkend erklärt:**
- Das "Phantom-Ende" bei `first=14288`, gegen das `0072059` den Hard-Stop einzog, war nie ein kaputter Datensatz und kein Keycloak-Bug — es war die Grenze zwischen lokaler DB und LDAP-Gebiet.
- Warum eine Bereinigung auf Keycloak-Seite nicht hält: die Fetch-Version *vor* `0072059` blätterte, bis eine kurze Seite kam, und zog dabei nach, was im AD steht. Den Grundstock hat laut [[realm-directory-cleanup-investigation]] allerdings der einmalige Full-Sync am 2024-07-10 gelegt (`usersDn` = `ou=HTL,dc=EDU,dc=HTL-LEONDING,dc=AC,dc=AT`, also der ganze Baum inkl. `OU=TestUsers`) — der Fetch ist der Wiederbeschaffungs-, nicht der Hauptmechanismus.
- Löschen in Keycloak allein kann nie halten: die 12.060 TestUsers stehen weiterhin im AD unter `OU=TestUsers` (Unter-OUs `testA`…`testK`, je exakt 36). Siehe [[keycloak-testusers-ou-discovery]].

**Why**: Ohne dieses Wissen wirken Count und Pagination widersprüchlich, und jede Bereinigung auf Keycloak-Seite wird durch den nächsten tiefen Seitenaufruf rückgängig gemacht.

**How to apply**: Jede Aufzählung über die Admin-API hart beim vorher geholten `users/count` deckeln (macht `fetchAllUserPages` seit `0072059`) — dann bleibt sie innerhalb der lokalen DB und importiert nichts. Der eigentliche Hebel gegen die TestUsers liegt in der Föderationsconfig (`usersDn` einschränken oder `customUserSearchFilter`), nicht in Keycloaks User-Liste.

**Nachtrag 2026-09-13:** Genau dieser Hebel ist umgelegt — die Föderation ist in `ldap-students` (`ou=Students`) und `ldap-teachers` (`ou=Teachers`) geteilt, `OU=TestUsers` liegt in keinem Suchbereich mehr. Der Deckel auf `users/count` bleibt trotzdem richtig, weil jede Seite jenseits des lokalen Endes weiterhin in die Föderation greift. Zur Gegenrichtung — Lesen *löscht* außerhalb des Suchbereichs — siehe [[keycloak-dead-federation-link-deletes-on-read]].
