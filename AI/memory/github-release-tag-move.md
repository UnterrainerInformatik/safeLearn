---
name: github-release-tag-move
description: "Wird der Tag eines veröffentlichten GitHub-Releases gelöscht, fällt das Release auf Draft zurück und muss neu veröffentlicht werden"
metadata: 
  node_type: memory
  type: project
  originSessionId: e3f5bbe7-46cd-48b3-a61f-d9b7169e7340
  modified: 2026-08-17T15:24:54.981Z
---

Ein GitHub-Release hängt am Tag. Wird der Tag remote gelöscht — etwa um ihn auf einen späteren Commit umzuhängen — **entkoppelt GitHub das Release und setzt es auf Draft**. Es verschwindet damit aus der öffentlichen Ansicht, und das vorherige Release ist wieder "Latest". Die Assets überleben, aber niemand kann sie in dieser Zeit ziehen.

Umhängen sieht so aus, und der letzte Schritt gehört zwingend dazu:

```
git tag -d <version>
git push origin :refs/tags/<version>
git tag -a <version> -m "<version>" <commit>
git push origin <version>
gh release edit <version> --draft=false --latest    # ← sonst bleibt es Draft
```

**Why:** Am 2026-08-17 wurde der Tag `1.0.2` nachgezogen, weil er vor dem package.json-Sync gesetzt worden war. Das Release war danach etwa fünf Minuten lang Draft und 1.0.1 wieder Latest — unbemerkt geblieben, wäre das Release praktisch nie erschienen. Aufgefallen ist es nur, weil danach kontrolliert wurde.

**How to apply:** Den Tag gar nicht erst zu früh setzen — die Reihenfolge in [[plugin-release-process]] vermeidet den Fall. Muss doch umgehängt werden: danach immer `gh release view <version> --json isDraft,assets` prüfen, und den Downloadzähler ansehen, ob im Draft-Fenster jemand ins Leere gegriffen hat. Bei einem Release, das schon länger draußen ist, lieber ein neues Patch-Release schneiden als den Tag anfassen.
