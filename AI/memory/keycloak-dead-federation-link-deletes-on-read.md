---
name: keycloak-dead-federation-link-deletes-on-read
description: "Verengt man usersDn, löscht Keycloak jede lokale Kopie außerhalb des neuen Suchbereichs beim ersten lesenden Zugriff — ein GET genügt, es braucht kein DELETE"
metadata:
  type: project
---

Am 2026-09-13 beim Provider-Split der `unterrainer`-Realm (Keycloak 25.0.2) live beobachtet: Sobald der `usersDn` eines LDAP-Providers verengt ist, findet er die vorher importierten Konten außerhalb des neuen Suchbereichs nicht mehr — und Keycloak **löscht deren lokale Kopie beim ersten Zugriff darauf**. Zugriff heißt schon `GET /admin/realms/{realm}/users/{id}` oder eine Listenabfrage: `UserStorageManager.importValidation` fragt den verlinkten Provider, bekommt nichts zurück, entfernt den lokalen Satz und antwortet mit 404. Das Skript, das die 241 Lehrer-Kopien nur *zählen* sollte, hatte sie damit bereits alle gelöscht — der geplante Löschlauf war anschließend gegenstandslos.

Dasselbe traf die 264 Konten aus `OU=Exams`/`OU=Special`/`OU=service`: sie verschwanden während des ersten Zensus-Durchlaufs nach der Umstellung, ganz ohne Löschbefehl.

**Why**: Das ist die Kehrseite von [[keycloak-import-on-demand]] — Lesen verändert den Realm in beide Richtungen. Wer nach einer Scope-Änderung erst „mal schauen, was betroffen ist" will, hat es damit schon getan; ein Dry-Run existiert an dieser Stelle nicht.

**How to apply**: Vor jeder Änderung an `usersDn` (oder am Suchfilter) erst das Backup ziehen, dann umstellen — App-eigene User-Attribute wie `config`/`lastVisitedUrl` sind beim ersten Lesen danach weg. Umgekehrt braucht es zum Aufräumen verwaister Kopien keinen Löschlauf: einmal über die Konten lesen genügt. Und ein „Umhängen" auf einen anderen Provider gibt es nicht — `federationLink` lässt sich per Admin-API nicht setzen, der Weg ist immer löschen und über den neuen Provider neu importieren (neue Keycloak-IDs, laufende Sessions brechen).
