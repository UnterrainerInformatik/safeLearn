---
name: plugin-release-process
description: "Ein neues Plugin-Release ist Version an drei Stellen, Push, Tag und ein GitHub-Release mit den drei Assets main.js, manifest.json und styles.css"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3f5bbe7-46cd-48b3-a61f-d9b7169e7340
  modified: 2026-08-17T15:49:49.167Z
---

Das Obsidian-Plugin wird **über GitHub-Releases verteilt**, nicht über den Community-Store. Obsidian bzw. BRAT zieht drei Assets, die am Release hängen müssen: `main.js`, `manifest.json`, `styles.css`. Der Tag heißt wie die Version, **ohne `v`-Prefix** (`1.0.1`, `1.0.2`). Sagt Gerald "mach ein neues Release", ist das die vollständige Prozedur — Checkout über den Symlink `AI/plugin`, siehe [[plugin-repo-link]]:

```
cd $(readlink -f AI/plugin)
# 1. Version an ALLEN drei Stellen setzen (siehe unten)
git add -A && git commit && git push origin master
# 2. Tag auf den Commit, der die Versionen schon trägt
git tag -a <version> -m "<version>" && git push origin <version>
# 3. main.js frisch bauen und Release anlegen
npm run build
gh release create <version> main.js manifest.json styles.css --title "..." --notes "..."
```

**Die Version steht an drei Stellen**, alle drei müssen mit:
- `manifest.json` — das ist die, nach der Obsidian installiert
- `package.json` — Obsidian prüft sie ebenfalls; sie war bis 1.0.2 vergessen worden und stand seit dem ersten Commit auf 1.0.0
- `package-lock.json` — **nur die Root-Version** (Zeile 3 und der `"packages": { "": {`-Block). Weiter unten stehen Dependencies, die zufällig auch auf `1.0.0` stehen; die dürfen nicht mitgeändert werden. `sed` über die ganze Datei ist deshalb falsch.

**Why:** `main.js` ist gitignored und liegt nirgends im Repo — es existiert ausschließlich als Release-Asset. Ein Push allein liefert also nichts Installierbares; ohne Release sieht Obsidian keine neue Version. Deshalb muss `npm run build` (rollup) vor `gh release create` laufen, und zwar aus dem Stand, den der Tag bezeichnet.

**How to apply:** Erst committen und pushen, **dann** taggen — der Tag muss auf den Commit zeigen, der alle drei Versionsangaben trägt. Wird er zu früh gesetzt, ist das Nachziehen teuer, siehe [[github-release-tag-move]]. Die Versionsnummer ist Geralds Entscheidung; beim einzigen bisherigen Fall wählte er einen Patch-Bump (1.0.1 → 1.0.2), obwohl der Vorschlag wegen sichtbar geänderten Highlighting-Verhaltens 1.1.0 lautete — im Zweifel Patch vorschlagen und die eigene Einschätzung dazusagen, statt zu fragen. Die Release-Notes beschreiben, was ein Nutzer merkt (1.0.1 hatte noch einen leeren Body). **Dass die neue Version im safeLearn-Vault sofort erscheint, ist kein Beleg dafür, dass das Release funktioniert** — siehe [[plugin-update-paths]]. `gh` ist auf dieser Maschine für das Repo authentifiziert.
