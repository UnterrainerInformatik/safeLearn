---
name: no-macos-available
description: Gerald hat keinen Mac und wird nie einen haben — macOS-Verifikation nicht vorschlagen
metadata:
  type: project
---

Es ist kein macOS-Rechner erreichbar, und es wird nie einer sein (Gerald, 2026-09-14).

**Why:** Kam bei `sharpen-the-page-a-reader-reads` auf, wo das Entfernen von `-webkit-font-smoothing` die eine Änderung war, die auf Retina-Macs eine Darstellung gegen eine andere tauscht. Der Plan sah eine Sichtprüfung auf einem Mac vor; die ist grundsätzlich nicht machbar.

**How to apply:** Keinen Verifikationsschritt planen, der einen Mac braucht. Wo eine Änderung nur auf Apple-Plattformen sichtbar ist (`-webkit-font-smoothing`, `-apple-system`, Safari-Eigenheiten), die Entscheidung aus der Sache heraus begründen und das als solches sagen, statt eine Sichtprüfung offen zu lassen. Verwandt: [[browser-verification]].
