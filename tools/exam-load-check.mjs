/**
 * The online tests' load check (exam-online-tests, task 7.1): a simulated
 * class writing one test, every student changing an answer every few
 * seconds, against the module as it runs - its router over real HTTP on
 * localhost, its `DatabaseSync` in WAL mode, the sweep running.
 *
 *   node tools/exam-load-check.mjs [students=30] [minutes=10] [secondsBetweenSaves=5]
 *
 * The database lives in a temporary directory removed at the end. Who a
 * request is comes from a header instead of a login: the module's gate reads
 * `req.user` only, and a student needs no lookup at the identity provider, so
 * the check measures the module and nothing else. Prints the response times
 * per kind of request and the live view's snapshot time.
 */

import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [students = 30, minutes = 10, secondsBetweenSaves = 5] = process.argv.slice(2).map(Number);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelearn-exam-load-"));
process.env.EXAM_DB_PATH = path.join(dir, "exam.sqlite");

const { init } = await import("../exam/index.js");
const { openDatabase } = await import("../exam/db.js");
const { createClass, createCourse, createYear } = await import("../exam/classes.js");
const { createSitting, createTest } = await import("../exam/tests.js");
const { liveSnapshot } = await import("../exam/live.js");

// ------------------------------------------------------------- the class

const usernames = Array.from({ length: students }, (_, i) => `load-student-${String(i + 1).padStart(2, "0")}`);
const setup = openDatabase(process.env.EXAM_DB_PATH).db;
const year = createYear(setup, { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" });
const klass = createClass(setup, year.id, { name: "9load", students: usernames.map((username) => ({ username })) });
const course = createCourse(setup, klass.id, { subject: "WMC", language: "de" });
// Twelve questions, as a 15-minute test would have, with four answers each.
setup.exec("INSERT INTO question_category (id, parent_id, name_de, name_en, position) VALUES (1, NULL, 'Load', 'Load', 0)");
const at = new Date().toISOString();
for (let q = 1; q <= 12; q += 1) {
  const type = q % 3 === 0 ? "multichoice" : "multichoiceset";
  setup
    .prepare("INSERT INTO question (id, category_id, type, name_de, name_en, text_de, text_en, position, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(q, type, `Q${q}`, `Q${q}`, `<p>Frage ${q} (2 richtige Antworten)</p>`, `<p>Question ${q}</p>`, q, at, at);
  for (let a = 0; a < 4; a += 1) {
    setup.prepare("INSERT INTO answer (question_id, position, text_de, text_en, correct) VALUES (?, ?, ?, ?, ?)").run(q, a, `<p>A${a}</p>`, `<p>A${a}</p>`, a < 2 ? 1 : 0);
  }
}
const test = createTest(setup, course.id, { name: "Load", questionIds: Array.from({ length: 12 }, (_, i) => i + 1) });
const sitting = createSitting(setup, test.id, {
  opensAt: new Date(Date.now() - 60000).toISOString(),
  closesAt: new Date(Date.now() + (minutes + 5) * 60000).toISOString(),
  durationMinutes: Math.ceil(minutes) + 2,
});
setup.close();

// ------------------------------------------------------------ the server

const module = await init({ startPage: () => "/" });
if (!module.active) throw new Error(`The module did not start: ${module.reason}`);
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const username = req.get("x-load-user");
  if (username) req.user = { preferred_username: username, rolesCalculated: JSON.stringify({ student: true }) };
  next();
});
app.use("/exam", module.router);
const server = await new Promise((resolve) => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const base = `http://127.0.0.1:${server.address().port}/exam/api`;

// -------------------------------------------------------------- measuring

const timings = new Map();
const errors = new Map();
function record(kind, ms) {
  if (!timings.has(kind)) timings.set(kind, []);
  timings.get(kind).push(ms);
}

async function request(kind, student, method, pathname, body) {
  const started = performance.now();
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      "x-load-user": student.username,
      "Content-Type": "application/json",
      ...(student.cookie ? { Cookie: student.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  record(kind, performance.now() - started);
  const cookie = response.headers.get("set-cookie");
  if (cookie) student.cookie = cookie.split(";")[0];
  if (!response.ok) errors.set(`${kind} ${response.status}`, (errors.get(`${kind} ${response.status}`) ?? 0) + 1);
  return text ? JSON.parse(text) : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeAsStudent(username, until) {
  const student = { username, cookie: null };
  // Everyone opens the test within the first 30 seconds.
  await sleep(Math.random() * 30000);
  const writing = await request("start", student, "POST", `/tests/${test.id}/attempt`);
  let lastResume = Date.now();
  while (Date.now() < until) {
    await sleep(secondsBetweenSaves * 1000 * (0.5 + Math.random()));
    const question = writing.questions[Math.floor(Math.random() * writing.questions.length)];
    const shuffled = [...question.answers].sort(() => Math.random() - 0.5);
    const tokens = question.type === "multichoiceset" ? shuffled.slice(0, 1 + Math.floor(Math.random() * 2)).map((a) => a.token) : [shuffled[0].token];
    await request("save", student, "PUT", `/attempts/${writing.attempt}/questions/${question.n}`, { tokens });
    // Now and then a reload, which resumes the attempt.
    if (Date.now() - lastResume > 60000 * (0.5 + Math.random())) {
      await request("resume", student, "GET", `/attempts/${writing.attempt}`);
      lastResume = Date.now();
    }
  }
  await request("submit", student, "POST", `/attempts/${writing.attempt}/submit`);
}

const until = Date.now() + minutes * 60000;
const snapshots = setInterval(() => {
  const db = openDatabase(process.env.EXAM_DB_PATH).db;
  try {
    const started = performance.now();
    liveSnapshot(db, sitting.id);
    record("live snapshot (in process)", performance.now() - started);
  } finally {
    db.close();
  }
}, 5000);

console.log(`${students} students, ${minutes} min, a change every ~${secondsBetweenSaves} s each; database ${process.env.EXAM_DB_PATH}`);
const started = Date.now();
await Promise.all(usernames.map((username) => writeAsStudent(username, until)));
clearInterval(snapshots);
server.close();

// ---------------------------------------------------------------- report

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const rows = [...timings.entries()].map(([kind, values]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const fixed = (ms) => ms.toFixed(1);
  return { kind, count: sorted.length, p50: fixed(quantile(sorted, 0.5)), p95: fixed(quantile(sorted, 0.95)), p99: fixed(quantile(sorted, 0.99)), max: fixed(sorted.at(-1)) };
});
console.log(`ran ${((Date.now() - started) / 60000).toFixed(1)} min; response times in ms:`);
console.table(rows);
console.log(errors.size === 0 ? "no request was refused" : `refused: ${JSON.stringify(Object.fromEntries(errors))}`);
const check = openDatabase(process.env.EXAM_DB_PATH).db;
console.log(
  `attempts submitted: ${check.prepare("SELECT COUNT(*) AS n FROM attempt WHERE submitted_at IS NOT NULL").get().n}/${students}, ` +
    `database ${(fs.statSync(process.env.EXAM_DB_PATH).size / 1024).toFixed(0)} KiB`
);
check.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
