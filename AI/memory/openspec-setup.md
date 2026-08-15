---
name: openspec-setup
description: OpenSpec is installed via Volta (not npm -g); slash commands are /opsx:*, the CLI binary is openspec
metadata:
  type: project
---

OpenSpec (`@fission-ai/openspec` v1.9.0) ist in safeLearn eingerichtet — installiert **über Volta** (`volta install @fission-ai/openspec`), nicht per `npm install -g`.

**Why:** Das globale npm-Prefix liegt bei diesem Setup innerhalb des Volta-Node-Images (`~/.volta/tools/image/node/<version>`). Ein per npm global installiertes Paket verschwindet dort beim Node-Versionswechsel. Volta pinnt das Tool stattdessen an eine Node-Version und legt einen stabilen Shim in `~/.volta/bin/`.

**How to apply:** Updates mit `volta install @fission-ai/openspec@latest`, nicht mit npm. Es gibt **kein Binary namens `opsx`** — das CLI heißt `openspec`, `opsx` ist nur der Namespace der Slash-Commands (`/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore` u.a.). Nach einem OpenSpec-Update `openspec update` im Projekt laufen lassen, damit Commands und Skills neu generiert werden. Ablageort siehe [[ai-folder-layout]].
