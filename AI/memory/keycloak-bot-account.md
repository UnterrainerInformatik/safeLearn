---
name: keycloak-bot-account
description: "Lesender Zugang zur unterrainer-Realm: Account bot@unterrainer.info, Credential in ~/scripts/realm-directory-cleanup/.env.sh auf babylon5 — Schreibrechte gibt es nur temporär von Gerald"
metadata:
  type: reference
---

Für Arbeiten an der Produktiv-Realm (`unterrainer` auf `https://auth.htl-leonding.ac.at`) gibt es einen eigenen Bot-Account, den Gerald am 2026-09-13 neu angelegt hat: **`bot@unterrainer.info`**. Das Passwort steht **nicht hier**, sondern auf babylon5 in `~/scripts/realm-directory-cleanup/.env.sh` (chmod 600, `source` davor) — `AI/memory/` liegt im Repo und wird nach secureLectures gespiegelt, dort hat ein Klartext-Credential nichts verloren. Siehe [[babylon5-server]].

Anmeldung per Resource-Owner-Password-Grant über den Client `secureLectures` (dessen Secret liegt in derselben Datei als `KC_CLIENT_SECRET`). Rollen: **nur lesend** — `view-realm`, `view-users`, `view-events`, `view-clients`, `view-authorization`, `view-identity-providers` plus die `query-*`. Dazu die Client-Rolle `teacher` an `secureLectures`.

**Was damit nicht geht:** alles Schreibende. Provider aktivieren/ändern (`PUT /components`), `POST /user-storage/{id}/sync`, `POST /testLDAPConnection` und Benutzer löschen brauchen `manage-realm` bzw. `manage-users`; ohne sie kommt 403. Gerald hängt die Rollen für solche Aktionen temporär an und zieht sie danach wieder ab. Der Service-Account des Clients `safeLearn-directory-service` trug sie bis 2026-09-13 und liest seither auch nur noch (`view-realm`, `view-users`, `view-events`); sein Secret steckt in der Env des laufenden `secureLectures`-Containers auf babylon5.

**How to apply**: `cd ~/scripts/realm-directory-cleanup && source .env.sh` auf babylon5, dann `python3 kc_admin.py providers|mappers|count|get|sync|set-config|test-ldap`. Vor jeder Aufzählung von Benutzern den Deckel auf `users/count` beachten ([[keycloak-import-on-demand]]), und vor jeder Scope-Änderung erst sichern ([[keycloak-dead-federation-link-deletes-on-read]]). Schlägt die Anmeldung mit `invalid_grant / Invalid user credentials` fehl, ist es der Account — `invalid_client` wäre dagegen das Client-Secret.
