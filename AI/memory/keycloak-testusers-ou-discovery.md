---
name: keycloak-testusers-ou-discovery
description: "84% des unterrainer-Realms waren eine synthetische OU=TestUsers — erledigt: seit dem Provider-Split am 2026-09-13 liegt die OU außerhalb jedes Suchbereichs, der Realm steht bei 1.978 Konten"
metadata:
  type: project
---

Beim Analysieren des produktiven Directory-Fetch-Caches (`/app/data/secure-lectures/directory-cache.json` auf babylon5, geschrieben 2026-09-11 23:32 nach den letzten Fetch-Fixes) zeigte eine Aggregation der `OU=`-Segmente aus `attributes.LDAP_ENTRY_DN`: von 14.289 Accounts im `unterrainer`-Realm sitzen **12.060 (84%) unter `OU=TestUsers`** — keine echten historischen Schüler/Lehrer, sondern offenbar ein synthetischer Testdatensatz (u.a. Muster wie `testX`/`testXX` mit je 36 Einträgen). Nur **2.228 Accounts sind real**: 1.717 Schüler (1.668 enabled/49 disabled), 240 Lehrer (171 enabled/69 disabled, keine Duplikate nach `LDAP_ID`), ~271 sonstige (Exams/Matura/Admin/Special).

Diese TestUsers-Accounts erklären auch den Großteil der in [[realm-directory-cleanup-investigation]] als "AD-Bulk-Migration" gedeuteten Timestamp-Spitzen: von den dort genannten 5.699 Accounts mit LDAP-`createTimestamp` 2017 sind 5.508 (97%) TestUsers — echte 2017er-Accounts sind nur 191. Gleiches Muster bei 2021 (1.908/2.158 = 88% Test) und 2023 (3.744/4.032 = 93% Test). Die reale Nicht-Test-Population verteilt sich viel gleichmäßiger über die Jahre (2017–2025, je ~74–320/Jahr) — passt zu einer normalen 5(-7)-jährigen Schulpopulation ohne Retention-Problem in dieser Größenordnung.

Bei den echten (Nicht-Test-)Accounts bestätigt sich Geralds Hypothese aber in kleinerem Maßstab: 1.717 Schüler vs. ~1.400 erwartet (+317, ~ein nicht entfernter Abschlussjahrgang) und 240 Lehrer vs. ~130 erwartet (+110). Reale Klassen zeigen auch Jahrgänge 6/7 (Aufbaulehrgänge, z.B. `7ABIF`), nicht nur 5 wie von Gerald angenommen.

**Why**: Die ursprüngliche Investigation (Sektion 1.5, Sep 10) hatte nur nach Keycloak-createdTimestamp-Jahresclustern und Namens-Duplikaten gesucht, aber nie die OU-Verteilung selbst aggregiert — dadurch blieb der dominante TestUsers-Block unentdeckt und die 2017/2021/2023-Spitzen wurden versehentlich als reale (wenn auch verdächtige) Alt-Daten interpretiert.

**How to apply**: Vor Wiederaufnahme von [[realm-directory-cleanup-investigation]] / OpenSpec-Change `realm-directory-cleanup`: diesen Fund in `investigation-findings.md` einarbeiten und Tasks 3–5 neu priorisieren. Die TestUsers-Bereinigung (LDAP-Federation-`usersDn` einschränken oder OU in AD entfernen/verschieben) ist ein separater, risikoärmerer und höher-wirksamer Fix als die Retention-Policy für echte Accounts — sollte zuerst passieren, weil er 84% des Realms ohne jedes Risiko für echte Personen entfernt.

**Stand 2026-09-13 — erledigt.** Die 12.060 TestUsers sind gelöscht und die OU liegt außerhalb des Suchbereichs beider Provider: `ldap-students` steht auf `ou=Students,ou=HTL,…`, `ldap-teachers` auf `ou=Teachers,ou=HTL,…`. Der Realm zählt jetzt 1.978 Konten (1.721 Students, 250 Teachers, 7 lokale). Damit ist auch die hier genannte reale Restmenge neu vermessen — die „+317 Schüler / +110 Lehrer" gegenüber Geralds Erwartung bleiben bestehen und sind Sache der Aufbewahrungsregel, nicht der TestUsers. Details im erledigten Abschnitt von `AI/open-proposals.md` und in [[keycloak-dead-federation-link-deletes-on-read]].
