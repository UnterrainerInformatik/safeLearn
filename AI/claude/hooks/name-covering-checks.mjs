#!/usr/bin/env node
/**
 * PostToolUse hook — names the checks that guard a file after it was edited.
 *
 * `test/coverage-map.json` records which check guards which source and corpus
 * file. This hook looks the edited file up in that record and says which checks
 * cover it, so the connection survives without anyone having to remember it.
 *
 * It never runs the suite. A run takes minutes and authenticates against a
 * shared public Keycloak realm, which is not something to trigger as a side
 * effect of an edit — it is offered as the next step and left to the session.
 *
 * Prints nothing for a file no check guards, and always exits 0: an edit must
 * never be blocked or made noisy by this.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const runCommand = "npm test";

/** Everything on stdin, or an empty string when there is nothing to read. */
function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function projectRoot() {
  const configured = process.env.CLAUDE_PROJECT_DIR;
  if (configured) return configured;
  // This script lives in <root>/AI/claude/hooks/.
  return path.resolve(import.meta.dirname, "..", "..", "..");
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) return;

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }

  const edited = event?.tool_input?.file_path;
  if (typeof edited !== "string" || edited.length === 0) return;

  const root = projectRoot();
  let map;
  try {
    map = JSON.parse(readFileSync(path.join(root, "test", "coverage-map.json"), "utf8"));
  } catch {
    return;
  }

  const relative = path.relative(root, path.resolve(root, edited));
  if (relative.startsWith("..")) return;
  const guarded = relative.split(path.sep).join("/");

  const covering = [];
  for (const [check, entry] of Object.entries(map.checks ?? {})) {
    const guards = (entry.guards ?? []).includes(guarded);
    const reads = (entry.corpus ?? []).includes(guarded);
    if (guards || reads) covering.push({ check, how: guards ? "guards" : "reads", what: entry.what });
  }
  if (covering.length === 0) return;

  const lines = covering.map((entry) => `  - ${entry.check} (${entry.how} it) — ${entry.what}`);
  const context =
    `${guarded} is covered by ${covering.length} check${covering.length > 1 ? "s" : ""}:\n` +
    `${lines.join("\n")}\n` +
    `Offer running them with \`${runCommand}\` as the next step. Do not run it unasked: ` +
    `a run takes minutes and authenticates against a shared public Keycloak realm.`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: context,
      },
    })
  );
}

main();
