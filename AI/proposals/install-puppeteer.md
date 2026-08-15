# Install puppeteer
Damit Du Änderungen verifizieren kannst und siehst was Du da eigentlich machst, installiere bitte puppeteer

- Installation
- Anmeldung
    Das ist ein Problem, da Du ja die Daten nicht lesen und ins Internet übertragen sollst. Deswegen nehmen wir hier den Test-Server, auf dem die Daten öffentlich sind. Die Test-server Daten findest Du in der Anleitung als Demo-Installation. Du hast Zugriff auf den keycloak (auth.unterrainer.info) und die User sind student/student und teacher/teacher. Hier kommen ev. noch welche hinzu. Das keycloak-file hierfür ist hier:
```json
{
  "realm": "safeLearn",
  "auth-server-url": "https://auth.unterrainer.info/",
  "ssl-required": "external",
  "resource": "safeLearn",
  "verify-token-audience": true,
  "credentials": {
    "secret": "B83cBfwyOZUQnE3g6L6MO3uzqeEPHDPD"
  },
  "use-resource-role-mappings": true,
  "confidential-port": 0
}
```
- Damit solltest Du das dann in puppeteer starten und Dich anmelden können.