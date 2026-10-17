/**
 * The deployment chain, checked against what the application actually reads.
 *
 * No browser, no login, no server: like `coverage.test.js`, this file only reads
 * the repository. It exists because of a gap that shipped silently — the
 * directory-search endpoint read `DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET` from
 * the environment for two changes running, while nothing in the pipeline ever
 * put them there. Every deployed instance answered 502 for that route, and the
 * Obsidian plugin treats a refusal as "not logged in" on purpose, so nothing
 * anywhere said why.
 *
 * A deployed instance can be handed a value through exactly two channels, and
 * this file knows both:
 *
 *   - the image's own `.env` — the workflow's "Fill .env file" step writes
 *     `site/.env`, the `Dockerfile` copies it to `/app/.env`, and `app.js` loads
 *     it through dotenv. Baked into a layer that is pushed to a registry, so it
 *     is the wrong channel for a secret and the right one for everything else.
 *   - the container's environment — the workflow's "Fill .env file for
 *     deployment" step writes `deploy/.env`, and `deploy/docker-compose.yml`
 *     interpolates it into its `environment:` block. Both halves are needed: a
 *     value written to `deploy/.env` that the compose file never names reaches
 *     nothing, which is its own test below.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

const workflowPath = ".github/workflows/docs-local.yml";
const composePath = "deploy/docker-compose.yml";

const workflow = readFileSync(path.join(projectRoot, workflowPath), "utf8");
const compose = readFileSync(path.join(projectRoot, composePath), "utf8");

/**
 * Variables the application reads and a deployment deliberately need not set,
 * because the code carries a working default for them. Named here rather than
 * dropping the requirement altogether, so adding a variable is a decision
 * somebody makes rather than one that happens by omission.
 */
const optionalWithDefault = new Map([
  [
    "PERMISSION_VISIBILITY_INTERVAL_MS",
    "obsidian.js defaults it to 5000 ms; a deployment only sets it to tune that.",
  ],
]);

/**
 * Variables the application reads that no deployment may set: they exist for
 * the verification harness. Named here, with the reason, for the same reason
 * as the map above - and checked in the other direction below, so a compose
 * file that starts passing one fails a run.
 */
const testOnly = new Map([
  [
    "EXAM_DB_PATH",
    "exam/db.js reads it so the harness can point a run at a database of its own; a deployment " +
      "keeps the default, data/exam.sqlite on the data volume (design.md of exam-module, D2).",
  ],
]);

/**
 * The files the `Dockerfile` copies into the image and the application runs:
 * the root `*.js` files, `middlewares/` and the exam module's server side in
 * `exam/` (its `client/` runs in the browser and reads no environment). Deliberately not `test/` or
 * `tools/` — a variable only a test or a local tool reads is not something a
 * deployment owes anybody.
 */
function applicationSources() {
  const roots = [
    { dir: projectRoot, prefix: "" },
    { dir: path.join(projectRoot, "middlewares"), prefix: "middlewares/" },
    { dir: path.join(projectRoot, "exam"), prefix: "exam/" },
  ];
  const sources = [];
  for (const { dir, prefix } of roots) {
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".js")) continue;
      sources.push({ file: `${prefix}${entry}`, text: readFileSync(path.join(dir, entry), "utf8") });
    }
  }
  return sources;
}

/** Every `process.env.NAME` the application reads, with the file it reads it in. */
function environmentReads() {
  const reads = new Map();
  for (const { file, text } of applicationSources()) {
    for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!reads.has(match[1])) reads.set(match[1], file);
    }
  }
  return reads;
}

/**
 * The shell script of one workflow step, addressed by its name. Steps sit at a
 * fixed indent in this file and the next `- name:` ends the one before it, so
 * the block needs no YAML parser — and the repository has no YAML dependency to
 * reach for.
 */
function stepScript(stepName) {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${stepName}`);
  assert.notEqual(
    start,
    -1,
    `${workflowPath} has no step named "${stepName}". This check addresses the pipeline's steps ` +
      `by name; a renamed step needs renaming here too, rather than silently checking nothing.`
  );
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^\s*- name:/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The variables one `echo NAME=... >> ...env` step writes. */
function namesWrittenBy(stepName) {
  const names = new Set();
  for (const match of stepScript(stepName).matchAll(/^\s*echo\s+([A-Z][A-Z0-9_]*)=/gm)) {
    names.add(match[1]);
  }
  return names;
}

/** The `environment:` entries of the compose service, and which interpolate a value. */
function composeEnvironment() {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => line.trim() === "environment:");
  assert.notEqual(start, -1, `${composePath} has no environment: block for the service.`);
  const entries = new Map();
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const match = line.match(/^\s+-\s+([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) break;
    entries.set(match[1], { interpolates: match[2].trim() === `\${${match[1]}}` });
  }
  return entries;
}

const reads = environmentReads();
const imageEnv = namesWrittenBy("Fill .env file");
const deployEnv = namesWrittenBy("Fill .env file for deployment");
const containerEnv = composeEnvironment();

test("every environment variable the application reads reaches a deployed instance", () => {
  for (const [name, file] of reads) {
    if (optionalWithDefault.has(name) || testOnly.has(name)) continue;
    const throughImage = imageEnv.has(name);
    const throughContainer = deployEnv.has(name) && containerEnv.has(name);
    assert.ok(
      throughImage || throughContainer,
      `${file} reads process.env.${name}, and nothing in the deployment sets it: it is not in ` +
        `${workflowPath}'s "Fill .env file" step (the image's own .env), and it does not run the ` +
        `full "Fill .env file for deployment" -> ${composePath} environment: path either. A ` +
        `deployed instance would read undefined. Add it to one of the two, or — if the code ` +
        `carries a default and a deployment need not set it — say so in optionalWithDefault here.`
    );
  }
});

test("nothing the pipeline writes to deploy/.env stops there", () => {
  for (const name of deployEnv) {
    if (!reads.has(name)) continue; // Compose's own interpolation (image tag, ports, container name).
    assert.ok(
      containerEnv.has(name),
      `${workflowPath} writes ${name} into deploy/.env and ${composePath} never names it in its ` +
        `environment: block, so it never reaches the container the application runs in. ` +
        `deploy/.env feeds compose's interpolation, not the process — the two halves are one path.`
    );
  }
});

test("every value the compose file interpolates is one the pipeline fills in", () => {
  for (const [name, entry] of containerEnv) {
    if (!entry.interpolates) continue; // A literal, like TZ.
    assert.ok(
      deployEnv.has(name),
      `${composePath} passes \${${name}} to the container and ${workflowPath}'s "Fill .env file ` +
        `for deployment" step never writes ${name} to deploy/.env. Compose interpolates an unset ` +
        `variable to the empty string with a warning, so the container starts and the value is ` +
        `blank — which is exactly the failure this file exists to catch.`
    );
  }
});

test("the directory-service credentials travel by container environment, not in the image", () => {
  for (const name of ["DIRECTORY_SERVICE_CLIENT_ID", "DIRECTORY_SERVICE_CLIENT_SECRET"]) {
    assert.ok(
      containerEnv.has(name),
      `${name} is expected in ${composePath}'s environment: block — see docs-keycloak.md, ` +
        `"Directory search client".`
    );
    assert.ok(
      !imageEnv.has(name),
      `${name} is written into the image's own .env by ${workflowPath}. That image is pushed to a ` +
        `registry, so the client secret would sit in a published layer and outlive every rotation ` +
        `of it. It belongs in the container's environment, which it already reaches.`
    );
  }
});

test("a variable that exists for the harness reaches no deployed instance", () => {
  for (const [name, reason] of testOnly) {
    assert.ok(reads.has(name), `${name} is declared test-only here, but the application no longer reads it.`);
    assert.ok(
      !imageEnv.has(name) && !deployEnv.has(name) && !containerEnv.has(name),
      `${name} is set by the deployment, and it must not be: ${reason}`
    );
  }
});

test("the exam module is switched by the container's environment", () => {
  assert.ok(
    containerEnv.has("EXAM_MODULE") && deployEnv.has("EXAM_MODULE"),
    `EXAM_MODULE is expected in ${composePath}'s environment: block and in deploy/.env — see ` +
      `docs-exam-module.md.`
  );
  assert.ok(
    !imageEnv.has("EXAM_MODULE"),
    `EXAM_MODULE is baked into the image's own .env by ${workflowPath}. One image serves every ` +
      `deployment, the WYSIWYG container included, which runs without the module.`
  );
  assert.match(
    readFileSync(path.join(projectRoot, "Dockerfile"), "utf8"),
    /^COPY exam\/ \/app\/exam$/m,
    "the Dockerfile has to copy exam/ into the image, or EXAM_MODULE=on finds no module to load"
  );
});

test("the WYSIWYG containers run without the exam module", () => {
  for (const template of ["wysiwyg-container-linux", "wysiwyg-container-windows"]) {
    const file = `${template}/docker-compose.yml`;
    const text = readFileSync(path.join(projectRoot, file), "utf8");
    assert.ok(!/EXAM_MODULE/.test(text), `${file} sets EXAM_MODULE; the WYSIWYG container runs without the module.`);
    assert.ok(!/\/app\/data/.test(text), `${file} mounts a data volume; the WYSIWYG container keeps no data.`);
  }
});

test("no static mount reaches the data directory", () => {
  // Every directory express.static serves, read from the sources that mount one.
  for (const file of ["app.js", "exam/index.js"]) {
    const text = readFileSync(path.join(projectRoot, file), "utf8");
    for (const match of text.matchAll(/express\.static\(([^)]*)\)/g)) {
      assert.ok(
        !/["'`]data["'`/]/.test(match[1]) && !/\bdata(Dir|Path)\b/i.test(match[1]),
        `${file} serves ${match[1]} statically. The data directory holds the exam database and its ` +
          `backups, which must never be retrievable over HTTP.`
      );
    }
  }
  assert.match(
    readFileSync(path.join(projectRoot, "exam/index.js"), "utf8"),
    /express\.static\(clientDir\)/,
    "the exam module serves its client directory and nothing else"
  );
});
