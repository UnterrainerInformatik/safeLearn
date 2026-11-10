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
 *     it through dotenv. Baked into a layer that is pushed to a public registry,
 *     so it carries no secret at all — only ports, URLs and the start page.
 *   - the container's environment — the workflow's "Fill .env file for
 *     deployment" step writes `deploy/.env`, and `deploy/docker-compose.yml`
 *     interpolates it into its `environment:` block. Both halves are needed: a
 *     value written to `deploy/.env` that the compose file never names reaches
 *     nothing, which is its own test below. Every secret takes this channel.
 *
 * One file is not a variable: `keycloak.json`, which carries the OIDC client
 * secret. It takes the runtime route as well — the deploy job writes it to
 * `deploy/keycloak.json`, the SSH deploy copies it next to `deploy/.env`, and
 * the compose file mounts it read-only to `/app/keycloak.json`. It never goes
 * into `site/`, which the `Dockerfile` copies into the image.
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
  [
    "READER_ROLES",
    "auth-mode.js reads it only with AUTH=none, and absent it grants no role at all - every " +
      "restricted section and file stays hidden.",
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
 * the root `*.js` files, `middlewares/`, and the server sides of the exam
 * module in `exam/` and of the administration pages in `admin/` (their
 * `client/` runs in the browser and reads no environment). Deliberately not `test/` or
 * `tools/` — a variable only a test or a local tool reads is not something a
 * deployment owes anybody.
 */
function applicationSources() {
  const roots = [
    { dir: projectRoot, prefix: "" },
    { dir: path.join(projectRoot, "middlewares"), prefix: "middlewares/" },
    { dir: path.join(projectRoot, "exam"), prefix: "exam/" },
    { dir: path.join(projectRoot, "admin"), prefix: "admin/" },
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
    entries.set(match[1], { value: match[2].trim(), interpolates: match[2].trim() === `\${${match[1]}}` });
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
    // A literal in the compose file reaches the container on its own; an
    // interpolated value needs deploy/.env to fill it in.
    const literal = containerEnv.has(name) && !containerEnv.get(name).interpolates;
    const throughContainer = literal || (deployEnv.has(name) && containerEnv.has(name));
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

/**
 * The secrets a deployment hands the application as variables, with where an
 * operator reads about each. Every one has to reach the container through its
 * environment and none may sit in the image's own .env.
 */
const secrets = new Map([
  ["SESSION_SECRET", "docs-building.md, the SESSION_SECRET row"],
  ["DIRECTORY_SERVICE_CLIENT_ID", 'docs-keycloak.md, "Directory search client"'],
  ["DIRECTORY_SERVICE_CLIENT_SECRET", 'docs-keycloak.md, "Directory search client"'],
]);

test("every secret travels by container environment, not in the image", () => {
  for (const [name, docs] of secrets) {
    assert.ok(
      containerEnv.has(name) && deployEnv.has(name),
      `${name} is expected in ${composePath}'s environment: block and in deploy/.env — see ${docs}.`
    );
    assert.ok(
      !imageEnv.has(name),
      `${name} is written into the image's own .env by ${workflowPath}. That image is pushed to a ` +
        `public registry, so the secret would sit in a published layer and outlive every rotation ` +
        `of it. It belongs in the container's environment ("Fill .env file for deployment" -> ` +
        `${composePath} environment:), which it already reaches.`
    );
  }
});

test("the pipeline writes no keycloak.json into the image", () => {
  for (const line of workflow.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    assert.ok(
      !/\bsite\/keycloak[^\s]*\.json/.test(line),
      `${workflowPath} touches site/keycloak.json: "${line.trim()}". The Dockerfile copies site/ into ` +
        `the image, which is pushed to a public registry, and keycloak.json carries the OIDC client ` +
        `secret. It reaches the container as a mount instead: written to deploy/keycloak.json before ` +
        `the SSH deploy, mounted read-only by ${composePath}.`
    );
  }
});

/** The long-syntax bind mount of the compose service whose target is `target`, as text. */
function composeMount(target) {
  const lines = compose.split("\n");
  const at = lines.findIndex((line) => line.trim() === `target: ${target}`);
  if (at === -1) return undefined;
  // The entry begins at the nearest "- type:" above and ends before the next "- ".
  let start = at;
  while (start > 0 && !/^\s+-\s+type:/.test(lines[start])) start--;
  const indent = lines[start].match(/^(\s*)/)[1].length;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim().length > 0 && !line.trim().startsWith("#")) {
      const lineIndent = line.match(/^(\s*)/)[1].length;
      if (lineIndent <= indent) break;
    }
    end++;
  }
  return lines.slice(start, end).join("\n");
}

test("keycloak.json reaches the container through a read-only mount the pipeline fills", () => {
  const mount = composeMount("/app/keycloak.json");
  assert.ok(
    mount,
    `${composePath} mounts nothing at /app/keycloak.json. The image carries no keycloak.json, so ` +
      `without the mount the instance refuses to start.`
  );
  assert.match(mount, /type:\s*bind/, `the /app/keycloak.json mount in ${composePath} has to be a bind mount.`);
  assert.match(mount, /read_only:\s*true/, `the /app/keycloak.json mount in ${composePath} has to be read-only.`);
  assert.match(
    mount,
    /create_host_path:\s*false/,
    `the /app/keycloak.json mount in ${composePath} has to set bind.create_host_path: false. ` +
      `Otherwise a missing file becomes an empty directory and the container starts broken.`
  );
  const source = mount.match(/source:\s*\.\/(\S+)/);
  assert.ok(source, `the /app/keycloak.json mount in ${composePath} has to read a file next to it (source: ./...).`);

  // The pipeline has to write that file into deploy/ before the SSH deploy copies the directory.
  const lines = workflow.split("\n");
  const deployAt = lines.findIndex((line) => line.trim() === "- name: Deploy using SSH 🚛");
  assert.notEqual(deployAt, -1, `${workflowPath} has no "Deploy using SSH 🚛" step.`);
  const written = new RegExp(`>>?\\s*\\.?/?deploy/${source[1].replace(/[.]/g, "\\.")}\\b`);
  const writer = lines.slice(0, deployAt).findIndex((line) => !line.trim().startsWith("#") && written.test(line));
  assert.notEqual(
    writer,
    -1,
    `${composePath} mounts ./${source[1]} to /app/keycloak.json, and no step of ${workflowPath} before ` +
      `"Deploy using SSH" writes deploy/${source[1]}. The server would get no file, and compose ` +
      `refuses to start.`
  );
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

test("the image ships the interface catalogs", () => {
  // app.js and obsidian.js import i18n/ on every instance, module or not; an
  // image without it does not start.
  assert.match(
    readFileSync(path.join(projectRoot, "Dockerfile"), "utf8"),
    /^COPY i18n\/ \/app\/i18n$/m,
    "the Dockerfile has to copy i18n/ into the image"
  );
});

test("the image ships the administration pages", () => {
  // app.js imports admin/ on every instance (teacher-admin-pages); an image
  // without it does not start.
  assert.match(
    readFileSync(path.join(projectRoot, "Dockerfile"), "utf8"),
    /^COPY admin\/ \/app\/admin$/m,
    "the Dockerfile has to copy admin/ into the image"
  );
});

test("the school's periods reach the container through its environment", () => {
  assert.ok(
    containerEnv.has("SCHOOL_PERIODS") && deployEnv.has("SCHOOL_PERIODS"),
    `SCHOOL_PERIODS is expected in ${composePath}'s environment: block and in deploy/.env — see ` +
      `docs-exam-module.md.`
  );
  assert.ok(
    !imageEnv.has("SCHOOL_PERIODS"),
    `SCHOOL_PERIODS is baked into the image's own .env by ${workflowPath}. The periods are one ` +
      `school's, and the image serves every deployment.`
  );
});

test("the retention period of leavers' records reaches the container through its environment", () => {
  assert.ok(
    containerEnv.has("EXAM_RETENTION_YEARS") && deployEnv.has("EXAM_RETENTION_YEARS"),
    `EXAM_RETENTION_YEARS is expected in ${composePath}'s environment: block and in deploy/.env — see ` +
      `docs-exam-module.md.`
  );
  assert.ok(
    !imageEnv.has("EXAM_RETENTION_YEARS"),
    `EXAM_RETENTION_YEARS is baked into the image's own .env by ${workflowPath}. The period is one ` +
      `school's decision, and the image serves every deployment.`
  );
});

test("the WYSIWYG containers run without the exam module", () => {
  for (const template of ["wysiwyg-container-linux", "wysiwyg-container-windows"]) {
    const file = `${template}/docker-compose.yml`;
    const text = readFileSync(path.join(projectRoot, file), "utf8");
    assert.ok(!/EXAM_MODULE/.test(text), `${file} sets EXAM_MODULE; the WYSIWYG container runs without the module.`);
    assert.ok(!/SCHOOL_PERIODS/.test(text), `${file} sets SCHOOL_PERIODS; the WYSIWYG container runs without the module.`);
    assert.ok(!/EXAM_RETENTION_YEARS/.test(text), `${file} sets EXAM_RETENTION_YEARS; the WYSIWYG container runs without the module.`);
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

test("the deployed instance signs in through Keycloak, stated rather than defaulted", () => {
  const auth = containerEnv.get("AUTH");
  assert.ok(
    auth && !auth.interpolates && auth.value === "keycloak",
    `${composePath} has to pass AUTH=keycloak to the container as a literal, and it passes ` +
      `${auth ? `AUTH=${auth.value}` : "no AUTH"}. AUTH=none publishes without any sign-in, which the ` +
      `school's deployment must never do; a value interpolated from deploy/.env could be lost or changed ` +
      `by a line there.`
  );
  assert.ok(
    !imageEnv.has("AUTH") && !deployEnv.has("AUTH"),
    `AUTH is written to an .env file by ${workflowPath}. The compose file's literal is the one place ` +
      `it is set, so nothing else can disagree with it.`
  );
  assert.ok(
    !containerEnv.has("READER_ROLES") && !imageEnv.has("READER_ROLES"),
    `READER_ROLES reaches the deployed instance. It only means something without an identity provider, ` +
      `and the deployment runs with one.`
  );
});
