# Fix Role Check Self-Grant

Beim Bauen der Content-Verification-Suite (`make-puppeteer-tests`) ist aufgefallen, dass `hasRoles` in `utils.js` die *angefragten* Rollen mit den *gehaltenen* verwechselt. Konkret diese zwei Zeilen:

```js
let isAdmin   = r.admin   || normalizedClientRoles.includes("admin");
let isTeacher = r.teacher || normalizedClientRoles.includes("teacher");
```

`r` ist die Rollen-Map der Session (LDAP-Gruppen, Client-Rollen, eigener Name). `normalizedClientRoles` ist dagegen die Liste, die in der `@@@`-Direktive steht. Der zweite Operand fragt also „steht 'admin' in der Direktive?" statt „hat die Session 'admin'?" — und beantwortet sich damit selbst.

## Was das auslöst

Ich habe das gegen den laufenden Server über `POST /convert` mit dem Demo-Account `student` (Rollen: nur `stu dent`, keine Klasse, kein `teacher`, kein `admin`) nachgemessen:

| DIREKTIVE | STUDENT SIEHT DEN BLOCK |
| --- | --- |
| `@@@ admin` | **ja** — immer |
| `@@@ teacher, teachers` | **ja** — immer |
| `@@@ admin, #exam` mit `ve: 1` | **ja** |
| `@@@ teacher` | nein (korrekt) |
| `@@@ #exam` | nein (korrekt) |
| `@@@ 5bhif` | nein (korrekt) |

Drei getrennte Folgen:

1. **`@@@ admin` schützt gar nichts.** `isAdmin` wird wahr, und der Zweig `if (isAdmin) clientAccess = true;` gibt den Block bedingungslos frei. Im Korpus betrifft das den Block „Admins only!!!" in `md/test-md-file.md` — beide Demo-Accounts sehen ihn.

2. **`@@@ teacher, teachers` leakt ebenfalls.** `isTeacher` wird wahr und setzt als Seiteneffekt `r.teachers = true` auf der Session. Steht `teachers` dann selbst in der Direktive, greift `normalizedClientRoles.some(role => r[role])` genau auf diesen frisch gesetzten Eintrag. Die Direktive gewährt sich also über den Umweg des Plurals selbst Zugriff. `docs-permissions.md` nennt beide Schreibweisen, das ist keine exotische Kombination.

3. **Das ist auch ein Loch in der Exam-Ansicht.** Im View-Zweig steht der Kommentar „For security reasons hardcoded to only allow teachers and admins to view exam-questions" — und dann `clientAccess = a.ve == 1 && (isAdmin || isTeacher)`. Bei `@@@ admin, #exam` ist `isAdmin` aus Grund 1 wahr, also reicht einem Studenten der eigene Preference-Schalter `ve: 1`, um an die Prüfungsvariante zu kommen. `ve` setzt jeder selbst über das Zahnrad-Menü. Der aktuelle Korpus enthält keine solche Direktive, die Bedingung dafür ist aber nur, dass irgendjemand mal `@@@ admin, #exam` schreibt.

## Was zu tun ist

Beide Zeilen sollen fragen, was die Session hält, nicht was die Direktive verlangt. Bitte dabei prüfen, ob der Seiteneffekt `r.teachers = true` überhaupt gebraucht wird oder ob die `teachers`/`teacher`-Angleichung besser einmal zentral beim Normalisieren passiert — `getLdapGroups` mappt die OU `Teachers` bereits auf `teacher`, die zweite Angleichung mitten in der Zugriffsprüfung ist der eigentliche Auslöser von Folge 2.

Was danach unverändert funktionieren muss:

- `@@@ teacher`, `@@@ 5bhif`, `@@@ stu dent` und die Zeitfenster verhalten sich wie heute.
- Ein echter Admin sieht weiterhin alles.
- Der Teacher→Student-Downgrade über `vt: 0` greift weiterhin, inklusive des Verschwindens der Dateien aus dem Navigationsbaum.
- `#exam` bleibt Lehrern und Admins vorbehalten, `#practice` und `#answer` bleiben an `ve`/`va`.

Das alles ist bereits durch `test/checks/permissions.js` und `test/checks/views.js` abgedeckt, `npm test` sagt also, ob die Reparatur etwas kaputt gemacht hat.

## Was zum Change dazugehört

- Ein Korpus-Block, der `@@@ admin` in beide Richtungen beweisbar macht, plus ein Check darauf. Heute assertiert die Suite bewusst gar nichts auf dem Admin-Block, weil das aktuelle Verhalten falsch ist.
- Die Notiz „a `@@@ admin` block is visible to everyone" in `docs-testing.md` (Abschnitt „What the corpus demonstrates but a run cannot assert") wieder herausnehmen, sobald der Block prüfbar ist.
- Die beiden Observations in `AI/architecture.md` (`@@@ admin` sichtbar für alle; `#practice` hängt allein an `ve`) auf den neuen Stand bringen. Der `#practice`-Punkt ist ein eigener Befund und nicht Teil dieser Reparatur — nur die Formulierung prüfen, nicht das Verhalten mitändern.
