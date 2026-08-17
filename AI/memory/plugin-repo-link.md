---
name: plugin-repo-link
description: Das zugehörige Obsidian-Plugin liegt in einem eigenen Repo, erreichbar über den gitignorierten Symlink AI/plugin
metadata:
  type: project
---

Zu safeLearn gehört ein zweites Repo: **safeLearn-Obsidian-plugin**, das Obsidian-Community-Plugin `safelearn-formatter` (bei Obsidian bereits registriert, `manifest.json` → id `safelearn-formatter`, Autor `UnterrainerInformatik`). Es gibt den safeLearn-eigenen Tags eine Darstellung im Editor und versteckt sie in der Leseansicht.

**Erreichbar über `AI/plugin`** — ein Symlink auf den Checkout, seit 2026-08-17. Auf dieser Maschine zeigt er auf `/mnt/data/source/JAVASCRIPT/safeLearn-Obsidian-plugin`. Der Link ist in `.gitignore`, weil der Pfad absolut und pro Installation verschieden ist; in einem frischen Checkout fehlt er und wird von Hand gesetzt:

```
ln -sfn <pfad-zum-plugin-checkout> AI/plugin
```

**Dieses Repo ist das Haupt-Repo und immer der Start-Ordner** für eine Claude-Session — auch wenn die Arbeit im Plugin stattfindet. Proposals, Changes und Memory liegen hier, nie drüben. Der Prefix für alles Plugin-Bezogene ist `plugin-`, für die Voraussetzungen `plugin-setup-`.

**Why:** Die beiden Repos sind inhaltlich gekoppelt — das Plugin kennt genau die Tags, die `obsidian.js` hier rendert — aber technisch getrennt und in einer anderen Installation liegt das Plugin woanders. Ein Symlink plus dieser Eintrag bindet sie, ohne einen Pfad ins Repo zu schreiben, der anderswo falsch wäre. Submodule wurden verworfen: sie würden eine Versionskopplung erzwingen, die es zwischen den beiden nicht gibt.

**How to apply:** Ist `AI/plugin` ein toter Link oder nicht vorhanden, nach dem Checkout fragen statt raten. Änderungen am Plugin werden drüben committet und gepusht — es ist ein eigenes Repo mit eigener Historie. Siehe [[ai-folder-layout]] und [[proposals-autostart]].
