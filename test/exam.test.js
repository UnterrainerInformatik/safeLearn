/**
 * The instance with the exam module switched on (`browser-verification`).
 *
 * A test file of its own, so it runs in its own process against an instance of
 * its own: `useExamModule()` starts that instance with `EXAM_MODULE=on` and a
 * database in a directory created for this run, on a port of its own, and the
 * harness removes the directory when the run ends however it ends. Two runs
 * in a row therefore never see each other's records.
 *
 * The same fixture page without the module is `test/checks/exam-embedding.js`.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  applicationOutput,
  applicationUrl,
  reauthenticate,
  render,
  restartApplication,
  setPreferences,
  sharedSession,
  shutdown,
  useExamModule,
  whileUnanswered,
} from "./harness.js";
import { openDatabase } from "../exam/db.js";
import { importPool } from "../exam/pool-import.js";
import { purgeUploads } from "../exam/pool-edit.js";
import { viennaInstant, viennaLocal } from "../exam/client/periods.js";

const run = useExamModule();

const fixture = "/md/test-exam-embedding.md";
const plainPage = "/md/test-md-file.md";
const absent = "/no-deployment-has-a-file-at-this-path-exam-7d1e.json";

/**
 * A request from inside the page, carrying the session's cookies. `body`, if
 * given, is sent as JSON.
 */
async function fetchAs(session, reference, { method = "GET", body } = {}) {
  return session.page.evaluate(async (address, method, body) => {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(address, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Not JSON - a page.
    }
    return { status: response.status, servedFrom: new URL(response.url).pathname, redirected: response.redirected, json };
  }, `${applicationUrl}${reference}`, method, body);
}

/** What the rendered page holds of the module, once its client had a turn. */
async function moduleTraces(page) {
  await page
    .waitForFunction(
      () => [...document.querySelectorAll(".sl-embed")].every((el) => el.dataset.slMounted === "1"),
      { timeout: 10000 }
    )
    .catch(() => {});
  return page.evaluate(() => ({
    placeholders: [...document.querySelectorAll(".sl-embed")].map((el) => ({
      kind: el.dataset.slEmbed,
      params: { ...el.dataset },
      status: el.textContent.trim(),
    })),
    notices: document.querySelectorAll(".sl-embed-notice").length,
    moduleScripts: [...document.querySelectorAll("script[src]")]
      .map((s) => s.getAttribute("src"))
      .filter((src) => src.startsWith("/exam/")),
  }));
}

after(async () => {
  await shutdown();
  assert.ok(!existsSync(run.directory), `the run's database directory ${run.directory} should be gone after the run`);
});

describe("the instance with the exam module", () => {
  let student;
  let teacher;

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
  });

  test("starts the module against a database created for this run", () => {
    const output = applicationOutput();
    assert.match(output, /Exam module: active, database /);
    assert.ok(output.includes(run.databasePath), "the start-up log names the run's database");
    assert.match(output, /Migrated .* from schema version 0 to /, "the database was new, not one a previous run left");
    assert.ok(existsSync(run.databasePath));
    assert.ok(readdirSync(run.directory).includes("exam-backups"), "the backups sit beside the run's database");
  });

  test("answers who a session is, after the student-view downgrade", async () => {
    const asTeacher = await fetchAs(teacher, "/exam/api/me");
    assert.equal(asTeacher.status, 200);
    assert.deepEqual(asTeacher.json, { username: teacher.username.toLowerCase(), teacher: true, admin: false, periods: [], lang: "en", loc: "de-AT" });

    const asStudent = await fetchAs(student, "/exam/api/me");
    assert.deepEqual(asStudent.json, { username: student.username.toLowerCase(), teacher: false, admin: false, periods: [], lang: "en", loc: "de-AT" });

    await setPreferences(teacher, { vt: 0 });
    try {
      assert.equal((await fetchAs(teacher, "/exam/api/me")).json.teacher, false, "a teacher in student view is a student");
    } finally {
      await setPreferences(teacher, {});
    }
    assert.equal((await fetchAs(teacher, "/exam/api/me")).json.teacher, true, "and a teacher again after switching back");
  });

  test("refuses a request without a session the way every route does", async () => {
    const response = await fetch(`${applicationUrl}/exam/api/me`, { redirect: "manual" });
    assert.equal(response.status, 401);
  });

  test("shows its page to a teacher in the instance's frame, and to nobody else", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.body.style.display !== "none", { timeout: 45000 });
    const frame = await teacher.page.evaluate(() => ({
      title: document.title,
      topbar: document.querySelector("#topbar .topbar-title")?.textContent.trim(),
      sidebar: Boolean(document.querySelector("#sidebar")),
      heading: document.querySelector("#markdown-content h1")?.textContent,
    }));
    assert.deepEqual(frame, {
      title: "Classes and courses",
      topbar: "Classes and courses",
      sidebar: true,
      heading: "Classes and courses",
    });

    const nothing = await fetchAs(student, absent);
    assert.deepEqual(await fetchAs(student, "/exam/"), nothing, "a student finds nothing there");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.deepEqual(await fetchAs(teacher, "/exam/"), await fetchAs(teacher, absent), "nor does a teacher in student view");
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("the top bar leads a teacher to the module and a student to their Exams page; module pages use the whole width", async () => {
    const buttons = async (session) => {
      await render(session, plainPage);
      return session.page.evaluate(() => [...document.querySelectorAll("#topbar a.sl-exam-button")].map((a) => a.getAttribute("href")));
    };
    assert.deepEqual(await buttons(teacher), ["/exam/"]);
    assert.deepEqual(await buttons(student), ["/exam/my"], "a student reaches their Exams page from every page");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.deepEqual(await buttons(teacher), ["/exam/my"], "in student view, what a student gets, and not the module's home");
    } finally {
      await setPreferences(teacher, {});
    }
    assert.equal(
      await teacher.page.evaluate(() => document.querySelector("#markdown-content").classList.contains("sl-wide")),
      false,
      "a content page keeps its reading column"
    );

    await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.body.style.display !== "none", { timeout: 45000 });
    const wide = await teacher.page.evaluate(() => {
      const content = document.querySelector("#markdown-content");
      return { marked: content.classList.contains("sl-wide"), width: content.getBoundingClientRect().width, viewport: window.innerWidth };
    });
    assert.ok(wide.marked, "the module's page is marked wide");
    if (wide.viewport > 1200) {
      assert.ok(wide.width > 900, `the content is ${wide.width}px wide in a ${wide.viewport}px window, wider than the reading column`);
    }
  });

  test("a teacher's page mounts every element, and the client reports what it cannot show", async () => {
    await render(teacher, fixture);
    const seen = await moduleTraces(teacher.page);
    assert.deepEqual(seen.placeholders.map((p) => p.kind), ["test", "test", "gradebook"]);
    assert.equal(seen.placeholders[0].params.slTest, "embedding-fixture-test");
    assert.equal(seen.placeholders[1].params.slTest, "embedding-fixture-teacher-test");
    assert.equal(seen.placeholders[2].params.slCourse, "embedding-fixture-course");
    assert.equal(seen.notices, 0);
    assert.deepEqual(seen.moduleScripts, ["/exam/assets/exam-client.js"]);
    await teacher.page.waitForFunction(() => ![...document.querySelectorAll("sl-exam-test .sl-embed-status")].some((s) => s.textContent === "Loading…"), {
      timeout: 10000,
    });
    const tests = await teacher.page.evaluate(() => [...document.querySelectorAll("sl-exam-test")].map((el) => el.textContent.trim()));
    assert.deepEqual(tests, ["This record does not exist.", "This record does not exist."], "a test block naming no test says so in its own area");
    await teacher.page.waitForFunction(() => !document.querySelector("sl-exam-gradebook .sl-embed-status:not(.sl-embed-error)"), {
      timeout: 10000,
    });
    const gradebook = await teacher.page.evaluate(() => document.querySelector("sl-exam-gradebook").textContent.trim());
    assert.equal(gradebook, "This record does not exist.", "a gradebook naming no course says so in its own area");
  });

  test("a student's page holds the open test element only", async () => {
    await render(student, fixture);
    const seen = await moduleTraces(student.page);
    assert.deepEqual(seen.placeholders.map((p) => p.kind), ["test"], "nothing from the teacher section, no gradebook");
    assert.equal(seen.placeholders[0].params.slTest, "embedding-fixture-test");
  });

  test("a teacher in student view gets what a student gets", async () => {
    await setPreferences(teacher, { vt: 0 });
    try {
      await render(teacher, fixture);
      const seen = await moduleTraces(teacher.page);
      assert.deepEqual(seen.placeholders.map((p) => p.params.slTest), ["embedding-fixture-test"]);
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("the presentation and document views do not run elements", async () => {
    for (const view of ["presentation", "document"]) {
      await render(teacher, fixture, { view });
      const seen = await moduleTraces(teacher.page);
      assert.deepEqual(seen.placeholders, [], `the ${view} view holds no placeholder`);
      assert.equal(seen.notices, 3, `the ${view} view shows the notices instead`);
      assert.deepEqual(seen.moduleScripts, [], `the ${view} view loads no module script`);
    }
  });

  test("a page without an element does not load the module's script", async () => {
    await render(teacher, plainPage);
    assert.deepEqual((await moduleTraces(teacher.page)).moduleScripts, []);
  });

  test("the database is not retrievable over HTTP", async () => {
    const nothing = await fetchAs(teacher, absent);
    for (const reference of [
      "/data/exam.sqlite",
      "/exam/exam.sqlite",
      "/exam/assets/../db.js",
      "/exam/assets/%2e%2e/db.js",
      "/exam/migrations/001-skeleton.sql",
      "/exam/db.js",
    ]) {
      const answer = await fetchAs(teacher, reference);
      assert.ok(
        answer.status !== 200 || answer.servedFrom === nothing.servedFrom,
        `${reference} answered ${answer.status} from ${answer.servedFrom}; it must not serve a file`
      );
    }
  });
});

describe("classes and courses", () => {
  let student;
  let teacher;
  let year;
  let klass;
  let candidates;

  /**
   * The directory's class names once it holds them. The instance warms the
   * directory at start-up; until that fetch is done the module says "loading".
   */
  async function directoryClasses() {
    const deadline = Date.now() + 90000;
    for (;;) {
      const answer = await fetchAs(teacher, "/exam/api/directory/classes");
      assert.equal(answer.status, 200);
      assert.notEqual(
        answer.json.state,
        "unavailable",
        "the instance has no directory-service credentials (DIRECTORY_SERVICE_CLIENT_ID/_SECRET in .env)"
      );
      if (answer.json.ready) return answer.json.classes;
      assert.ok(Date.now() < deadline, "the directory should be loaded within 90 s");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
  });

  test("a teacher creates the school year, and it is the current one", async () => {
    const created = await fetchAs(teacher, "/exam/api/years", {
      method: "POST",
      body: { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    year = created.json;
    assert.equal(year.current, true);
    const again = await fetchAs(teacher, "/exam/api/years", { method: "POST", body: { ...year } });
    assert.equal(again.status, 409, "the same year twice is refused");
  });

  test("a roster is ticked from the demo realm's client-role class", async () => {
    const classes = await directoryClasses();
    assert.ok(classes.length > 0, "the demo realm grants at least one class as a client role");
    let name = null;
    for (const candidate of classes) {
      const answer = await fetchAs(teacher, `/exam/api/directory/classes/${candidate}`);
      if (answer.json.candidates.length > 0) {
        name = candidate;
        candidates = answer.json.candidates;
        break;
      }
    }
    assert.ok(name, `one of ${classes.join(", ")} should have a member who is not a teacher`);

    const created = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, {
      method: "POST",
      body: { name: name.toUpperCase(), students: candidates.map((c) => c.username) },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    klass = created.json;
    assert.equal(klass.name, name);
    assert.deepEqual(
      klass.roster.map((entry) => entry.username).sort(),
      candidates.map((c) => c.username).sort(),
      "exactly the ticked members"
    );
    const named = klass.roster.filter((entry) => entry.givenName || entry.familyName);
    assert.equal(named.length, candidates.filter((c) => c.givenName || c.familyName).length, "names come from the directory");
  });

  test("a teacher is never put on a roster", async () => {
    const answer = await fetchAs(teacher, `/exam/api/classes/${klass.id}/roster`, {
      method: "POST",
      body: { username: teacher.username },
    });
    assert.equal(answer.status, 400);
  });

  test("a student removed from the roster keeps their entry, marked as left", async () => {
    const username = student.username.toLowerCase();
    const added = await fetchAs(teacher, `/exam/api/classes/${klass.id}/roster`, { method: "POST", body: { username } });
    assert.equal(added.status, 200, JSON.stringify(added.json));
    const removed = await fetchAs(teacher, `/exam/api/classes/${klass.id}/roster/${username}`, { method: "DELETE" });
    assert.equal(removed.status, 200);
    const entry = removed.json.find((e) => e.username === username);
    assert.ok(entry, "the entry is still there");
    assert.ok(entry.leftAt, "and marked as left");
  });

  test("a course is created once per class and subject, however it is capitalized", async () => {
    const created = await fetchAs(teacher, `/exam/api/classes/${klass.id}/courses`, {
      method: "POST",
      body: { subject: "WMC", language: "en" },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const duplicate = await fetchAs(teacher, `/exam/api/classes/${klass.id}/courses`, {
      method: "POST",
      body: { subject: "wmc", language: "de" },
    });
    assert.equal(duplicate.status, 409);

    const weights = { onlineTests: 50, manualTests: 30, participation: 10, homework: 10 };
    const saved = await fetchAs(teacher, `/exam/api/courses/${created.json.id}`, { method: "PUT", body: { weights } });
    assert.deepEqual(saved.json.weights, weights);
    const wrong = await fetchAs(teacher, `/exam/api/courses/${created.json.id}`, {
      method: "PUT",
      body: { weights: { ...weights, homework: 20 } },
    });
    assert.equal(wrong.status, 400, "weights that do not make 100 % are refused");
  });

  test("the class page draws the class for a teacher", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/classes/${klass.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("#markdown-content h1")?.textContent.startsWith("Class "), {
      timeout: 20000,
    });
    const seen = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1").textContent,
      rows: document.querySelectorAll(".sl-exam-roster tr").length,
      courses: [...document.querySelectorAll('a[href^="/exam/courses/"]:not([href$="/gradebook"])')].map((a) => a.textContent),
    }));
    assert.equal(seen.heading, `Class ${klass.name.toUpperCase()} – 2026/27`);
    assert.equal(seen.rows, candidates.length + 1, "the attending members and the one who left");
    assert.deepEqual(seen.courses, ["WMC"]);
  });

  test("no route of classes and courses answers a student, or a teacher in student view", async () => {
    const api = [
      ["GET", "/exam/api/years"],
      ["POST", "/exam/api/years", {}],
      ["POST", `/exam/api/years/${year.id}/current`],
      ["GET", `/exam/api/years/${year.id}/classes`],
      ["POST", `/exam/api/years/${year.id}/classes`, { name: "1xhif" }],
      ["GET", `/exam/api/classes/${klass.id}`],
      ["POST", `/exam/api/classes/${klass.id}/roster`, { username: "someone" }],
      ["DELETE", `/exam/api/classes/${klass.id}/roster/${candidates[0].username}`],
      ["POST", `/exam/api/classes/${klass.id}/names`],
      ["POST", `/exam/api/classes/${klass.id}/courses`, { subject: "X" }],
      ["GET", "/exam/api/courses/1"],
      ["PUT", "/exam/api/courses/1", { language: "de" }],
      ["GET", "/exam/api/directory/classes"],
      ["GET", `/exam/api/directory/classes/${klass.name}`],
      ["GET", "/exam/api/directory/people?q=st"],
    ];
    const pages = ["/exam/", `/exam/classes/${klass.id}`, "/exam/courses/1"];

    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const [method, reference, body] of api) {
        const answer = await fetchAs(session, reference, { method, body });
        assert.equal(answer.status, 403, `${method} ${reference} answered ${answer.status}`);
      }
      for (const reference of pages) {
        assert.deepEqual(await fetchAs(session, reference), nothing, `${reference} is not there`);
      }
    };

    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }

    const afterwards = await fetchAs(teacher, `/exam/api/classes/${klass.id}`);
    assert.equal(afterwards.json.roster.filter((e) => !e.leftAt).length, candidates.length, "nothing a refused request asked for happened");
    assert.equal(afterwards.json.courses.length, 1);
  });

  test("taking a student off the roster asks by a second click on the same button, never by a browser dialog", async () => {
    const page = teacher.page;
    const dialogs = [];
    const onDialog = (dialog) => {
      dialogs.push(dialog.type());
      dialog.dismiss().catch(() => {});
    };
    page.on("dialog", onDialog);
    try {
      const username = candidates[0].username;
      await page.goto(`${applicationUrl}/exam/classes/${klass.id}`, { waitUntil: "domcontentloaded" });
      const row = await page.waitForFunction(
        (name) => [...document.querySelectorAll(".sl-exam-roster tr")].find((tr) => tr.children[1]?.textContent === name && tr.querySelector(".sl-exam-roster-remove")),
        { timeout: 20000 },
        username
      );
      const button = await row.asElement().$(".sl-exam-roster-remove");
      await button.click();
      assert.match(await button.evaluate((b) => b.textContent), /^Click again to take .* off the roster/, "the label says what the second click does");
      const attending = async () => (await fetchAs(teacher, `/exam/api/classes/${klass.id}`)).json.roster.find((e) => e.username === username && !e.leftAt);
      assert.ok(await attending(), "one click takes nobody off");
      await button.click();
      await page.waitForFunction(
        (name) => [...document.querySelectorAll(".sl-exam-roster tr")].some((tr) => tr.children[1]?.textContent === name && tr.classList.contains("sl-exam-left")),
        { timeout: 10000 },
        username
      );
      assert.equal(await attending(), undefined, "the second click does");
      assert.deepEqual(dialogs, [], "no browser dialog");
    } finally {
      page.off("dialog", onDialog);
    }
  });
});

describe("the gradebook", () => {
  const fixturePage = "/md/test-exam-gradebook.md";
  const other = "gb-other-student";
  let student;
  let teacher;
  let year;
  let klass;
  let course;
  let test1;
  let entry;

  /** The student's GB course in their own results. */
  async function ownResults(session = student) {
    const answer = await fetchAs(session, "/exam/api/my/results");
    assert.equal(answer.status, 200);
    return { answer, gb: answer.json.courses.find((c) => c.subject === "GB") };
  }

  /** The row of `username` in the course's sheet for `semester`. */
  async function overviewRow(username, semester = "ws") {
    const answer = await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=${semester}`);
    assert.equal(answer.status, 200, JSON.stringify(answer.json));
    return answer.json.students.find((row) => row.username === username);
  }

  /** A column of the course, created through the API. */
  async function addColumn(body) {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/assessments`, { method: "POST", body });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    return created.json;
  }

  /** One student's result in one column, through the API. */
  function putResult(column, username, body) {
    return fetchAs(teacher, `/exam/api/assessments/${column.id}/results/${username}`, { method: "PUT", body });
  }

  /** Opens the course's sheet for `semester` as a teacher, once the client drew it. */
  async function openSheet(semester = "ws") {
    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=${semester}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
  }

  /** The selector of a student's field in a column of the sheet. */
  const field = (column, username) => `input.sl-exam-cell[data-assessment="${column.id}"][data-student="${username}"]`;

  /** Replaces a field's value as a teacher would - select it, type, leave it - and waits for the save. */
  async function enter(selector, text) {
    const page = teacher.page;
    await page.focus(selector);
    await page.evaluate((s) => document.querySelector(s).select(), selector);
    if (text === "") await page.keyboard.press("Backspace");
    else await page.keyboard.type(text);
    await page.keyboard.press("Tab");
    await settled(selector);
  }

  /** Waits until a field is no longer being saved. */
  async function settled(selector) {
    await teacher.page.waitForFunction((s) => !document.querySelector(s).classList.contains("is-saving"), { timeout: 10000 }, selector);
  }

  /** The focused field's student and column, or null when the focus is not in a result field. */
  function focused() {
    return teacher.page.evaluate(() => {
      const element = document.activeElement;
      return element?.classList.contains("sl-exam-cell") ? { student: element.dataset.student, column: Number(element.dataset.assessment), value: element.value } : null;
    });
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const years = await fetchAs(teacher, "/exam/api/years");
    year = years.json.current;
    if (!year) {
      year = (
        await fetchAs(teacher, "/exam/api/years", {
          method: "POST",
          body: { name: "2026/27", startsOn: "2026-09-07", summerStartsOn: "2027-02-15", endsOn: "2027-07-02" },
        })
      ).json;
    }
    // The class the fixture page names, with the shared student and one
    // username the directory does not know.
    const created = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, {
      method: "POST",
      body: { name: "9XGB", students: [student.username, other] },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    klass = created.json;
    const gb = await fetchAs(teacher, `/exam/api/classes/${klass.id}/courses`, {
      method: "POST",
      body: { subject: "GB", language: "de", weights: { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 } },
    });
    assert.equal(gb.status, 200, JSON.stringify(gb.json));
    course = gb.json;
  });

  test("results in columns become a proposal, end to end", async () => {
    const username = student.username.toLowerCase();
    const date = year.startsOn;
    test1 = await addColumn({ kind: "test", name: "1st test", date, maxPoints: 24 });
    const round = await addColumn({ kind: "plusminus", date });
    const homework = await addColumn({ kind: "homework", name: "Essay", date });
    assert.equal(round.name, date, "a column without a name is named by its date");
    for (const [column, who, body] of [
      [test1, username, { points: 18 }],
      [round, username, { mark: "+" }],
      [homework, username, { percent: 90 }],
      [test1, other, { points: 6 }],
    ]) {
      const answer = await putResult(column, who, body);
      assert.equal(answer.status, 200, JSON.stringify(answer.json));
    }

    const row = await overviewRow(username);
    assert.deepEqual(row.results[test1.id], { value: 0.75, points: 18 }, "17/24-style points are kept");
    assert.equal(row.categories.manualTests.fraction, 0.75);
    assert.equal(row.categories.participation.fraction, 1);
    assert.equal(row.categories.homework.fraction, 0.9);
    assert.equal(row.categories.onlineTests, undefined, "no online test yet, so the category is left out");
    // (30 × 0.75 + 15 × 1 + 15 × 0.9) / 60
    assert.ok(Math.abs(row.proposal.fraction - 0.85) < 1e-9, `the proposal is ${row.proposal.fraction}`);
    assert.equal(row.proposal.grade, 2);
    assert.equal(row.effective, 2);
    assert.equal((await overviewRow(other)).effective, 5);

    const record = await fetchAs(teacher, `/exam/api/courses/${course.id}/students/${username}`);
    entry = record.json.entries.find((e) => e.columnId === test1.id);
    assert.deepEqual([entry.points, entry.maxPoints, entry.grade, entry.name], [18, 24, 2, "1st test"]);

    assert.equal((await putResult(test1, "not-on-the-roster", { points: 1 })).status, 400, "only a student on the roster gets a result");
    assert.equal((await putResult(test1, username, { points: 30 })).status, 400, "nor more points than the maximum");
    const batch = await fetchAs(teacher, `/exam/api/courses/${course.id}/entries`, {
      method: "POST",
      body: { entries: [{ username, kind: "test", fraction: 1, date }] },
    });
    assert.ok(!(batch.status === 200 && batch.json !== null), "the batch route is gone");
    assert.equal((await overviewRow(username)).entries, 3, "and recorded nothing");
  });

  test("the student sees their proposal, then the override instead, and the comment only once it is visible", async () => {
    const username = student.username.toLowerCase();
    let { gb } = await ownResults();
    assert.ok(gb, "the student's results list the course");
    assert.deepEqual([gb.semesters.ws.grade, gb.semesters.ws.overridden], [2, false]);
    assert.ok(Math.abs(gb.semesters.ws.fraction - 0.85) < 1e-9);
    assert.ok(gb.entries.some((e) => e.name === "1st test" && e.date === year.startsOn), "a result carries its column's name and date");

    const grade = (body) =>
      fetchAs(teacher, `/exam/api/courses/${course.id}/grades/${username}/ws`, { method: "PUT", body });
    assert.equal((await grade({ override: 1, comment: "strong oral exam", commentVisible: false })).status, 200);
    ({ gb } = await ownResults());
    assert.deepEqual([gb.semesters.ws.grade, gb.semesters.ws.fraction, gb.semesters.ws.overridden, gb.semesters.ws.comment], [1, null, true, null]);
    const row = await overviewRow(username);
    assert.deepEqual([row.proposal.grade, row.override, row.comment, row.effective], [2, 1, "strong oral exam", 1], "teachers see both");

    await grade({ commentVisible: true });
    ({ gb } = await ownResults());
    assert.equal(gb.semesters.ws.comment, "strong oral exam", "saving the visibility alone keeps override and comment");
    assert.equal(gb.semesters.ws.grade, 1);

    await student.page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
    await student.page.waitForFunction(() => document.querySelector(".sl-exam-results"), { timeout: 20000 });
    const page = await student.page.evaluate(() => document.querySelector(".sl-exam-results").textContent);
    assert.match(page, /GB – 9XGB/);
    assert.match(page, /grade 1/);
    assert.match(page, /strong oral exam/);
    assert.match(page, /1st test/, "the result is shown by its column's name");
  });

  test("a student reaches nobody else's data and no teacher route, nor does a teacher in student view", async () => {
    const api = [
      ["GET", `/exam/api/courses/${course.id}/gradebook`],
      ["GET", `/exam/api/courses/${course.id}/students/${other}`],
      ["POST", `/exam/api/courses/${course.id}/assessments`, { kind: "test", date: year.startsOn }],
      ["PUT", `/exam/api/assessments/${test1.id}`, { name: "renamed" }],
      ["DELETE", `/exam/api/assessments/${test1.id}`],
      ["PUT", `/exam/api/assessments/${test1.id}/results/${other}`, { points: 24 }],
      ["DELETE", `/exam/api/assessments/${test1.id}/results/${other}`],
      ["PUT", `/exam/api/courses/${course.id}/grades/${other}/ws`, { override: 1 }],
      ["GET", "/exam/api/scale"],
      ["PUT", "/exam/api/scale", { thresholds: { 1: 10, 2: 8, 3: 6, 4: 4 } }],
      ["GET", "/exam/api/course-lookup?class=9xgb&subject=GB"],
    ];
    const pages = [`/exam/courses/${course.id}/gradebook`, `/exam/courses/${course.id}/students/${other}`, "/exam/scale"];
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const [method, reference, body] of api) {
        const answer = await fetchAs(session, reference, { method, body });
        assert.equal(answer.status, 403, `${method} ${reference} answered ${answer.status}`);
      }
      for (const reference of pages) {
        assert.deepEqual(await fetchAs(session, reference), nothing, `${reference} is not there`);
      }
      // The one route of a student's own takes no username; naming one changes nothing.
      for (const reference of [`/exam/api/my/results?username=${other}`, `/exam/api/my/results?user=${other}`]) {
        const answer = await fetchAs(session, reference);
        assert.equal(answer.status, 200);
        assert.ok(!JSON.stringify(answer.json).includes(other), `${reference} mentions ${other}`);
      }
    };

    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }

    const after = await fetchAs(teacher, `/exam/api/courses/${course.id}/students/${other}`);
    assert.deepEqual(after.json.entries.map((e) => [e.name, e.points]), [["1st test", 6]], "nothing a refused request asked for happened");
    assert.equal(after.json.semesters.ws.override, null);
    assert.equal((await fetchAs(teacher, "/exam/api/scale")).json[0].minPercent, 88);
  });

  test("the page's elements: the results for everyone, the gradebook for a teacher only", async () => {
    const drawn = async (session, selectors) => {
      await session.page.waitForFunction(
        (selectors) => selectors.every((selector) => document.querySelector(selector)),
        { timeout: 20000 },
        selectors
      );
      return session.page.evaluate(() => ({
        kinds: [...document.querySelectorAll(".sl-embed")].map((el) => el.dataset.slEmbed),
        results: document.querySelector(".sl-exam-results")?.textContent ?? "",
        gradebookRows: document.querySelectorAll(".sl-exam-gradebook tbody tr").length,
        bar: Boolean(document.querySelector(".sl-exam-bar")),
      }));
    };

    await render(student, fixturePage);
    const asStudent = await drawn(student, [".sl-exam-results"]);
    assert.deepEqual(asStudent.kinds, ["results"]);
    assert.match(asStudent.results, /grade 1/);
    assert.match(asStudent.results, /18\/24/, "the result as it was entered");

    await render(teacher, fixturePage);
    const asTeacher = await drawn(teacher, [".sl-exam-results", ".sl-exam-gradebook"]);
    assert.deepEqual(asTeacher.kinds, ["results", "gradebook"]);
    assert.equal(asTeacher.gradebookRows, 2, "the student and the one the directory does not know");
    assert.match(asTeacher.results, /no results for you/, "a teacher is on no roster");
    assert.equal(asTeacher.bar, false, "an embedded element brings no module bar");

    await setPreferences(teacher, { vt: 0 });
    try {
      await render(teacher, fixturePage);
      const inStudentView = await drawn(teacher, [".sl-exam-results"]);
      assert.deepEqual(inStudentView.kinds, ["results"], "no gradebook in student view");
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("the sheet: the + of a category adds a column, and the category heading spans its columns", async () => {
    await openSheet();
    const heading = () =>
      teacher.page.evaluate(() => {
        const cell = [...document.querySelectorAll(".sl-exam-sheet .sl-exam-category")].find((th) => th.textContent.startsWith("Manual tests"));
        return { span: cell.colSpan, heads: document.querySelectorAll(".sl-exam-sheet .sl-exam-column-head[data-column]").length };
      });
    assert.equal((await heading()).span, 1, "one manual test so far");
    assert.equal(
      await teacher.page.evaluate(() => document.querySelectorAll(".sl-exam-sheet .sl-exam-category button.sl-exam-add").length),
      3,
      "a + for manual tests, participation and homework, none for online tests"
    );
    assert.deepEqual(
      await teacher.page.evaluate(() => {
        const cell = [...document.querySelectorAll(".sl-exam-sheet .sl-exam-category")].find((th) => th.textContent.startsWith("Online tests ("));
        return cell ? [...document.querySelectorAll(".sl-exam-sheet .sl-exam-column-head")].map((th) => th.textContent).filter((text) => text === "no tests yet").length : null;
      }),
      1,
      "online tests keep their heading with the weight before any test is written"
    );

    await teacher.page.click('button.sl-exam-add[aria-label="Add a column to Manual tests"]');
    await teacher.page.waitForSelector("dialog[open] input[name=name]");
    await teacher.page.type("dialog[open] input[name=name]", "2nd test");
    await teacher.page.type("dialog[open] input[name=maxPoints]", "20");
    await teacher.page.click("dialog[open] button[type=submit]");
    await teacher.page.waitForFunction(
      () => [...document.querySelectorAll(".sl-exam-column-head input[type=text]")].some((input) => input.value === "2nd test"),
      { timeout: 10000 }
    );
    assert.equal((await heading()).span, 2, "the heading spans both manual tests");

    const columns = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json.columns;
    const added = columns.find((c) => c.name === "2nd test");
    assert.ok(added, "the column exists");
    assert.deepEqual([added.kind, added.maxPoints], ["test", 20]);
    assert.deepEqual(columns.map((c) => c.category), ["manualTests", "manualTests", "participation", "homework"], "grouped by category in the config sheet's order");
  });

  test("the sheet: deleting a column asks by a second click on its ×, never by a browser dialog", async () => {
    const column = await addColumn({ kind: "test", name: "To be deleted", date: year.startsOn, maxPoints: 10 });
    assert.equal((await putResult(column, other, { points: 5 })).status, 200);
    const dialogs = [];
    const onDialog = (dialog) => {
      dialogs.push(dialog.type());
      dialog.dismiss().catch(() => {});
    };
    teacher.page.on("dialog", onDialog);
    try {
      await openSheet();
      const button = `th[data-column="${column.id}"] .sl-exam-delete`;
      await teacher.page.waitForSelector(button, { timeout: 20000 });
      await teacher.page.click(button);
      assert.equal(await teacher.page.$eval(button, (b) => b.textContent), "Click again to delete it and its 1 result");
      const exists = async () => (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json.columns.some((c) => c.id === column.id);
      assert.equal(await exists(), true, "one click deletes nothing");
      await teacher.page.click(button);
      await teacher.page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, `th[data-column="${column.id}"]`);
      assert.equal(await exists(), false, "the second click deletes");
      assert.deepEqual(dialogs, [], "no browser dialog");
    } finally {
      teacher.page.off("dialog", onDialog);
    }
  });

  test("the sheet: a typed result is stored as it changes, emptying removes it, a refused value leaves the stored one", async () => {
    await openSheet();
    const columns = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json.columns;
    const test2 = columns.find((c) => c.name === "2nd test");
    const target = field(test2, other);

    await enter(target, "15");
    let row = await overviewRow(other);
    assert.deepEqual(row.results[test2.id], { value: 0.75, points: 15 }, "stored without any save action");
    const shown = await teacher.page.evaluate((who) => document.querySelector(`tr[data-student="${who}"] .sl-exam-proposal`).textContent, other);
    assert.ok(shown.startsWith(String(row.proposal.grade)), `the row's proposal follows: ${shown}`);
    assert.equal(await teacher.page.evaluate((s) => document.querySelector(s).classList.contains("is-saved"), target), true);

    await enter(target, "25");
    const refused = await teacher.page.evaluate((s) => {
      const input = document.querySelector(s);
      return { marked: input.classList.contains("is-refused"), reason: input.title, value: input.value };
    }, target);
    assert.equal(refused.marked, true, "the field is marked as refused");
    assert.match(refused.reason, /maximum/, "with the reason");
    assert.equal(refused.value, "25", "and keeps what was typed");
    assert.deepEqual((await overviewRow(other)).results[test2.id], { value: 0.75, points: 15 }, "the stored result is unchanged");

    await enter(target, "");
    row = await overviewRow(other);
    assert.equal(row.results[test2.id], undefined, "emptying the field removes the result");
  });

  test("the sheet: the override is saved as it changes, and one row at a time is marked", async () => {
    await openSheet();
    const select = `tr[data-student="${other}"] select.sl-exam-override`;
    await teacher.page.select(select, "3");
    await settled(select);
    const row = await overviewRow(other);
    assert.deepEqual([row.override, row.effective], [3, 3]);
    assert.equal(await teacher.page.evaluate((who) => document.querySelector(`tr[data-student="${who}"] .sl-exam-grade`).textContent, other), "3");
    await teacher.page.select(select, "");
    await settled(select);
    assert.equal((await overviewRow(other)).override, null);

    const username = student.username.toLowerCase();
    await teacher.page.click(`tr[data-student="${username}"] .sl-exam-proposal`);
    await teacher.page.click(`tr[data-student="${other}"] .sl-exam-proposal`);
    const marked = await teacher.page.evaluate(() => [...document.querySelectorAll(".sl-exam-sheet tr.is-marked")].map((tr) => tr.dataset.student));
    assert.deepEqual(marked, [other], "only the second row is marked");
  });

  test("the sheet: the left four columns keep their place while the sheet scrolls sideways", async () => {
    await openSheet();
    const lefts = () =>
      teacher.page.evaluate(() => ({
        sticky: [...document.querySelectorAll(".sl-exam-sheet tbody tr:first-child [data-sticky]")].map((cell) => Math.round(cell.getBoundingClientRect().left)),
        field: Math.round(document.querySelector(".sl-exam-sheet tbody tr:first-child input.sl-exam-cell").getBoundingClientRect().left),
      }));
    // A narrow wrapper, so the sheet is wider than the room it has.
    await teacher.page.evaluate(() => {
      document.querySelector(".sl-exam-scroll").style.maxWidth = "420px";
    });
    await teacher.page.waitForFunction(() => {
      const wrapper = document.querySelector(".sl-exam-scroll");
      return wrapper.scrollWidth > wrapper.clientWidth;
    });
    const before = await lefts();
    assert.equal(before.sticky.length, 4, "name, proposal, override and grade");
    const scrolled = await teacher.page.evaluate(() => {
      const wrapper = document.querySelector(".sl-exam-scroll");
      wrapper.scrollLeft = 200;
      return wrapper.scrollLeft;
    });
    assert.ok(scrolled > 0, "the scrollbar belongs to the sheet");
    const after = await lefts();
    after.sticky.forEach((left, index) => assert.ok(Math.abs(left - before.sticky[index]) <= 2, `column ${index} moved from ${before.sticky[index]} to ${left}`));
    assert.ok(before.field - after.field >= scrolled - 2, "the result columns scrolled");
    assert.equal(await teacher.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "the page itself does not scroll sideways");
  });

  test("the sheet: the arrow keys move between results, save the field left and never change a + or −", async () => {
    await openSheet();
    const username = student.username.toLowerCase();
    const { columns, students } = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json;
    const [first, second] = students.map((row) => row.username);
    const test2 = columns.find((c) => c.name === "2nd test");
    const round = columns.find((c) => c.kind === "plusminus");
    const page = teacher.page;

    // Down and up along a column; the field left is saved.
    await page.focus(field(test2, first));
    await page.evaluate((s) => document.querySelector(s).select(), field(test2, first));
    await page.keyboard.type("12");
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await focused(), { student: second, column: test2.id, value: "" });
    await settled(field(test2, first));
    assert.deepEqual((await overviewRow(first)).results[test2.id], { value: 0.6, points: 12 }, "moving saved the field left");
    await page.keyboard.press("ArrowUp");
    assert.equal((await focused()).student, first);
    await page.keyboard.press("ArrowUp");
    assert.equal((await focused()).student, first, "at the sheet's edge the focus stays");

    // Inside a typed value the arrows move the cursor; at its end they move on.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("17.5");
    await page.keyboard.press("ArrowLeft");
    assert.deepEqual(await focused(), { student: second, column: test2.id, value: "17.5" }, "the cursor moved inside the value");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    const secondMark = await page.evaluate((s) => document.querySelector(s).value, field(round, second));
    assert.deepEqual(await focused(), { student: second, column: round.id, value: secondMark }, "right at the end crosses into participation");
    await settled(field(test2, second));
    assert.equal((await overviewRow(second)).results[test2.id].points, 17.5);
    await page.keyboard.press("ArrowLeft");
    assert.equal((await focused()).column, test2.id, "left from a + or − field goes back");
    await page.keyboard.press("ArrowRight");
    assert.equal((await focused()).column, round.id, "and right again from a value arrived at");

    // Participation down the list: typed, never changed by an arrow.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.type("+");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("-");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    assert.deepEqual(await focused(), { student: second, column: round.id, value: "−" }, "the arrows left the mark as typed");
    await settled(field(round, first));
    await settled(field(round, second));
    assert.equal((await overviewRow(first)).results[round.id].value, 1);
    assert.equal((await overviewRow(second)).results[round.id].value, 0);
    assert.equal(await page.evaluate((s) => document.querySelector(s).value, field(round, first)), "+");
    assert.ok([first, second].includes(username));
  });

  test("the year view shows the winter grade beside the year proposal, combined by the winter share", async () => {
    const username = student.username.toLowerCase();
    const summer = await addColumn({ kind: "test", name: "summer test", date: year.summerStartsOn });
    assert.equal((await putResult(summer, username, { percent: 70 })).status, 200);
    const row = await overviewRow(username, "ss");
    // The winter semester is overridden to 1 (its band's middle, 94 %), the summer's own fraction is 0.70.
    assert.deepEqual(row.winter, { grade: 1, overridden: true });
    assert.ok(Math.abs(row.proposal.fraction - 0.82) < 1e-9, `the year proposal is ${row.proposal.fraction}`);
    assert.equal(row.proposal.grade, 2);

    await openSheet("ss");
    const seen = await teacher.page.evaluate((who) => ({
      leading: [...document.querySelectorAll(".sl-exam-sheet thead th[data-sticky]")].map((th) => th.textContent),
      winter: document.querySelector(`tr[data-student="${who}"] .sl-exam-winter`).textContent,
      proposal: document.querySelector(`tr[data-student="${who}"] .sl-exam-proposal`).textContent,
      columns: [...document.querySelectorAll('.sl-exam-column-head input[aria-label="Column name"]')].map((input) => input.value),
    }), username);
    assert.deepEqual(seen.leading, ["Student", "Winter", "Calculated proposal", "Teacher override", "Actual grade"]);
    assert.equal(seen.winter, "1 (override)");
    assert.ok(seen.proposal.startsWith("2 ("), seen.proposal);
    assert.deepEqual(seen.columns, ["summer test"], "the summer semester's columns only");

    const share = await fetchAs(teacher, `/exam/api/courses/${course.id}`, { method: "PUT", body: { winterShare: 100 } });
    assert.equal(share.status, 200);
    assert.ok(Math.abs((await overviewRow(username, "ss")).proposal.fraction - 0.94) < 1e-9, "a new share recalculates the year");
    await fetchAs(teacher, `/exam/api/courses/${course.id}`, { method: "PUT", body: { winterShare: 50 } });
  });

  test("the config sheet saves its weights as they change, only while they add up to 100 %", async () => {
    const original = { onlineTests: 40, manualTests: 30, participation: 15, homework: 15 };
    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-config input");
    const setWeight = async (label, value) => {
      const selector = `.sl-exam-config input[aria-label="${label}"]`;
      await teacher.page.focus(selector);
      await teacher.page.evaluate((s) => document.querySelector(s).select(), selector);
      await teacher.page.keyboard.type(value);
      await teacher.page.keyboard.press("Tab");
      await teacher.page.waitForFunction(() => !document.querySelector(".sl-exam-config").classList.contains("is-saving"));
    };
    const stored = async () => (await fetchAs(teacher, `/exam/api/courses/${course.id}`)).json.weights;
    try {
      await setWeight("Manual tests", "40");
      assert.deepEqual(await stored(), original, "nothing is saved at 110 %");
      assert.match(await teacher.page.evaluate(() => document.querySelector(".sl-exam").textContent), /Together 110 %/, "the sum is shown");
      await setWeight("Participation (+/−)", "5");
      assert.deepEqual(await stored(), { ...original, manualTests: 40, participation: 5 }, "saved once they are back at 100 %");
    } finally {
      await fetchAs(teacher, `/exam/api/courses/${course.id}`, { method: "PUT", body: { weights: original } });
    }
  });
});

describe("the module bar", () => {
  let student;
  let teacher;
  let year;
  let gbClass;
  let course;
  let spare;

  /** A page's markup as the server sends it, before any script ran. */
  async function html(session, reference) {
    return session.page.evaluate(async (address) => (await fetch(address, { credentials: "include" })).text(), `${applicationUrl}${reference}`);
  }

  /** The bar's positions as the page shows them: chosen text, link and whether a new one can be created. */
  function bar(page) {
    return page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll(".sl-exam-bar-position")].map((position) => {
          const select = position.querySelector("select");
          return [
            position.dataset.position,
            {
              chosen: select.value ? select.selectedOptions[0].textContent : null,
              link: position.querySelector("a")?.getAttribute("href") ?? null,
              create: position.querySelector("button") ? !position.querySelector("button").disabled : null,
            },
          ];
        })
      )
    );
  }

  async function open(reference) {
    await teacher.page.goto(`${applicationUrl}${reference}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-bar", { timeout: 20000 });
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const classes = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json;
    gbClass = classes.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    const created = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, { method: "POST", body: { name: "9XBAR", students: [] } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    spare = created.json;
  });

  test("every teacher page carries the bar as it is first shown, with the right values and links", async () => {
    for (const reference of [
      "/exam/",
      `/exam/classes/${gbClass.id}`,
      `/exam/courses/${course.id}`,
      `/exam/courses/${course.id}/gradebook`,
      `/exam/courses/${course.id}/students/${student.username.toLowerCase()}`,
      "/exam/scale",
    ]) {
      assert.match(await html(teacher, reference), /class="sl-exam-bar"/, `${reference} carries the bar`);
    }

    await open(`/exam/courses/${course.id}/gradebook?semester=ws`);
    assert.deepEqual(await bar(teacher.page), {
      year: { chosen: `${year.name} (current)`, link: `/exam/?year=${year.id}`, create: true },
      class: { chosen: "9XGB", link: `/exam/classes/${gbClass.id}`, create: true },
      course: { chosen: "GB", link: `/exam/courses/${course.id}`, create: true },
      gradebook: { chosen: "Winter semester", link: `/exam/courses/${course.id}/gradebook?semester=ws`, create: null },
    });

    await open("/exam/");
    const home = await bar(teacher.page);
    assert.equal(home.year.chosen, `${year.name} (current)`, "the current school year when nothing else is chosen");
    assert.deepEqual([home.class.chosen, home.course.create], [null, false], "no course is offered without a class");
  });

  test("the buttons to the pool and the online tests are on every teacher page and keep what the bar has chosen", async () => {
    for (const reference of [
      "/exam/",
      `/exam/classes/${gbClass.id}`,
      `/exam/courses/${course.id}`,
      `/exam/courses/${course.id}/gradebook`,
      "/exam/scale",
      "/exam/pool",
      "/exam/tests",
    ]) {
      const served = await html(teacher, reference);
      assert.match(served, /class="sl-exam-action sl-exam-bar-page" data-page="pool"/, `${reference} carries the pool's button`);
      assert.match(served, /class="sl-exam-action sl-exam-bar-page" data-page="tests"/, `${reference} carries the tests' button`);
      assert.match(served, /class="sl-exam-action sl-exam-bar-page" data-page="scale"/, `${reference} carries the scale's button`);
    }

    const buttons = () =>
      teacher.page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll(".sl-exam-bar-page")].map((a) => [a.dataset.page, { href: a.getAttribute("href"), current: a.getAttribute("aria-current") }])
        )
      );
    await open("/exam/");
    assert.deepEqual(await buttons(), {
      pool: { href: `/exam/pool?year=${year.id}`, current: null },
      tests: { href: `/exam/tests?year=${year.id}`, current: null },
      scale: { href: `/exam/scale?year=${year.id}`, current: null },
    });

    await open(`/exam/courses/${course.id}/gradebook?semester=ws`);
    assert.deepEqual(await buttons(), {
      pool: { href: `/exam/pool?course=${course.id}`, current: null },
      tests: { href: `/exam/tests?course=${course.id}`, current: null },
      scale: { href: `/exam/scale?course=${course.id}`, current: null },
    });
    const chosen = async () => {
      const seen = await bar(teacher.page);
      return [seen.year.chosen, seen.class.chosen, seen.course.chosen];
    };
    const expected = [`${year.name} (current)`, "9XGB", "GB"];

    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click('.sl-exam-bar-page[data-page="pool"]')]);
    await teacher.page.waitForSelector(".sl-exam-bar");
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/pool");
    assert.deepEqual(await chosen(), expected, "the pool's bar keeps year, class and course");
    assert.equal((await buttons()).pool.current, "page", "the pool's button is marked");

    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click('.sl-exam-bar-page[data-page="tests"]')]);
    await teacher.page.waitForSelector(".sl-exam-bar");
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/tests");
    assert.deepEqual(await chosen(), expected, "the tests' bar keeps year, class and course");
    assert.deepEqual(Object.values(await buttons()).map((b) => b.current), [null, "page", null], "the tests' button is marked");
    await teacher.page.waitForSelector(`.sl-exam-tests-course[data-course="${course.id}"]`, { timeout: 20000 });

    // Emptying the course on the tests page stays there; with the class but
    // no course chosen, that class's courses are listed, one group each.
    await Promise.all([
      teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      teacher.page.select('.sl-exam-bar select[data-position="course"]', ""),
    ]);
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/tests");
    await teacher.page.waitForSelector(".sl-exam-tests-course h2", { timeout: 20000 });
    const groups = await teacher.page.evaluate(() => [...document.querySelectorAll(".sl-exam-tests-course h2")].map((h2) => h2.textContent));
    assert.ok(groups.includes("9XGB GB"), `the class's courses are listed: ${groups.join(", ")}`);
    assert.ok(groups.every((group) => group.startsWith("9XGB ")), `and only the class's: ${groups.join(", ")}`);
    assert.deepEqual((await chosen()).slice(0, 2), expected.slice(0, 2), "the class stays chosen");
  });

  test("choosing a class opens its page and clears the course", async () => {
    await open(`/exam/courses/${course.id}/gradebook?semester=ws`);
    await Promise.all([
      teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      teacher.page.select('.sl-exam-bar select[data-position="class"]', String(spare.id)),
    ]);
    assert.equal(new URL(teacher.page.url()).pathname, `/exam/classes/${spare.id}`);
    await teacher.page.waitForSelector(".sl-exam-bar");
    const seen = await bar(teacher.page);
    assert.deepEqual([seen.class.chosen, seen.course.chosen, seen.gradebook.chosen], ["9XBAR", null, null]);
    const offered = await teacher.page.evaluate(() => [...document.querySelectorAll('.sl-exam-bar select[data-position="course"] option')].map((o) => o.textContent));
    assert.deepEqual(offered, ["–"], "the course position offers the courses of 9XBAR - none yet");
  });

  test("a new course is created from the bar and chosen afterwards", async () => {
    await open(`/exam/classes/${spare.id}`);
    await teacher.page.click('.sl-exam-bar button[data-create="course"]');
    await teacher.page.waitForSelector("dialog[open] input[name=subject]", { timeout: 20000 });
    await teacher.page.type("dialog[open] input[name=subject]", "NVS");
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click("dialog[open] button[type=submit]")]);
    const created = (await fetchAs(teacher, `/exam/api/classes/${spare.id}`)).json.courses.find((c) => c.subject === "NVS");
    assert.ok(created, "the course exists");
    assert.equal(new URL(teacher.page.url()).pathname, `/exam/courses/${created.id}`, "its config sheet is open");
    await teacher.page.waitForSelector(".sl-exam-bar");
    assert.equal((await bar(teacher.page)).course.chosen, "NVS");

    await teacher.page.click('.sl-exam-bar button[data-create="course"]');
    await teacher.page.waitForSelector("dialog[open] input[name=subject]", { timeout: 20000 });
    await teacher.page.type("dialog[open] input[name=subject]", "nvs");
    await teacher.page.click("dialog[open] button[type=submit]");
    await teacher.page.waitForFunction(() => document.querySelector("dialog[open] .sl-exam-message")?.textContent, { timeout: 10000 });
    assert.match(await teacher.page.evaluate(() => document.querySelector("dialog[open] .sl-exam-message").textContent), /already/, "a duplicate is refused as before");
  });

  test("choosing another class keeps the course of the same subject, the semester and the page", async () => {
    const kept = await fetchAs(teacher, `/exam/api/classes/${spare.id}/courses`, { method: "POST", body: { subject: "gb" } });
    assert.equal(kept.status, 200, JSON.stringify(kept.json));
    const choose = (position, value) =>
      Promise.all([
        teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        teacher.page.select(`.sl-exam-bar select[data-position="${position}"]`, value),
      ]);

    await open(`/exam/courses/${course.id}/gradebook?semester=ws`);
    await choose("class", String(spare.id));
    const url = new URL(teacher.page.url());
    assert.equal(`${url.pathname}${url.search}`, `/exam/courses/${kept.json.id}/gradebook?semester=ws`, "the other class's GB, winter semester");
    await teacher.page.waitForSelector(".sl-exam-bar");
    const seen = await bar(teacher.page);
    assert.deepEqual([seen.class.chosen, seen.course.chosen, seen.gradebook.chosen], ["9XBAR", "gb", "Winter semester"]);

    await open(`/exam/pool?course=${kept.json.id}`);
    await choose("class", String(gbClass.id));
    assert.equal(`${new URL(teacher.page.url()).pathname}${new URL(teacher.page.url()).search}`, `/exam/pool?course=${course.id}`, "the pool stays open, for GB");

    const created = await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, { method: "POST", body: { name: "9XBAR2", students: [] } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    await open(`/exam/courses/${kept.json.id}`);
    await choose("class", String(created.json.id));
    assert.equal(new URL(teacher.page.url()).pathname, `/exam/classes/${created.json.id}`, "a class without the subject opens as before");
  });

  test("no bar for a student, a teacher in student view, or anyone's own results", async () => {
    assert.doesNotMatch(await html(student, "/exam/my"), /sl-exam-bar/);
    assert.doesNotMatch(await html(teacher, "/exam/my"), /sl-exam-bar/, "a teacher's own results carry none either");
    assert.doesNotMatch(await html(student, `/exam/courses/${course.id}/gradebook`), /sl-exam-bar/);
    for (const reference of ["/exam/pool", "/exam/tests", `/exam/tests?course=${course.id}`]) {
      assert.doesNotMatch(await html(student, reference), /sl-exam-bar/, `${reference} for a student`);
    }
    assert.equal((await fetchAs(student, "/exam/api/tests")).status, 403, "the tests' list refuses a student");
    await setPreferences(teacher, { vt: 0 });
    try {
      for (const reference of ["/exam/", `/exam/courses/${course.id}/gradebook`, "/exam/pool", `/exam/tests?course=${course.id}`]) {
        assert.doesNotMatch(await html(teacher, reference), /sl-exam-bar/, `${reference} in student view`);
      }
    } finally {
      await setPreferences(teacher, {});
    }
  });
});

describe("the question pool", () => {
  let student;
  let teacher;
  let questionId;
  let imageId;

  // A 1×1 PNG.
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  /** A trimmed Moodle export: one category, a question with an image, and one without. */
  const pool = (lang) => `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category"><category><text>$course$/top/HTTP/${lang === "de" ? "Grundlagen" : "Basics"}</text></category></question>
  <question type="multichoice"><name><text>Bild ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p style="color: red"><img src="@@PLUGINFILE@@/image.png" alt="">${lang} picture (1 richtige Antwort)</p>]]></text>
      <file name="image.png" path="/" encoding="base64">${pixel}</file></questiontext>
    <answer fraction="100" format="html"><text><![CDATA[<p>yes ${lang}</p>]]></text></answer>
    <answer fraction="0" format="html"><text><![CDATA[<p>no ${lang}</p>]]></text></answer>
  </question>
  <question type="truefalse"><name><text>Wahr ${lang}</text></name>
    <questiontext format="html"><text><![CDATA[<p>${lang} statement</p>]]></text></questiontext>
    <answer fraction="100" format="moodle_auto_format"><text>true</text></answer>
    <answer fraction="0" format="moodle_auto_format"><text>false</text></answer>
  </question>
</quiz>`;

  /** An image request from inside the page: what it answered, without the bytes. */
  async function imageAs(session, reference) {
    return session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        cache: response.headers.get("cache-control"),
        bytes: (await response.arrayBuffer()).byteLength,
      };
    }, `${applicationUrl}${reference}`);
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    // The import runs beside the instance, as it does on babylon5: a second
    // connection to the run's database.
    const { db } = openDatabase(run.databasePath);
    try {
      importPool(db, pool("de"), pool("en"));
      const row = db.prepare("SELECT q.id AS questionId, i.id AS imageId FROM question q JOIN image i ON i.question_id = q.id").get();
      questionId = row.questionId;
      imageId = row.imageId;
    } finally {
      db.close();
    }
  });

  test("a teacher browses the categories and finds a question by its text", async () => {
    const tree = await fetchAs(teacher, "/exam/api/pool/categories");
    assert.equal(tree.status, 200);
    assert.deepEqual(
      tree.json.map((node) => [node.nameDe, node.nameEn, node.total, node.children.map((child) => [child.nameDe, child.nameEn])]),
      [["HTTP", "HTTP", 2, [["Grundlagen", "Basics"]]]]
    );
    const found = await fetchAs(teacher, "/exam/api/pool/questions?q=EN%20PICTURE");
    assert.deepEqual(found.json.map((q) => q.id), [questionId], "found by its English text, ignoring case");
    assert.equal((await fetchAs(teacher, "/exam/api/pool/questions?q=nothing-like-this")).json.length, 0);
  });

  test("the preview has both languages, the correct answers and the image from the module", async () => {
    const shown = (await fetchAs(teacher, `/exam/api/pool/questions/${questionId}`)).json;
    assert.match(shown.textDe, /de picture \(1 richtige Antwort\)/);
    assert.match(shown.textEn, /en picture/);
    assert.doesNotMatch(shown.textDe, /style=|base64|@@PLUGINFILE@@/);
    assert.ok(shown.textDe.includes(`src="/exam/api/images/${imageId}"`));
    assert.deepEqual(shown.answers.map((a) => [a.textDe, a.correct]), [["<p>yes de</p>", true], ["<p>no de</p>", false]]);
    assert.deepEqual(shown.usage, []);

    const image = await imageAs(teacher, `/exam/api/images/${imageId}`);
    assert.deepEqual(image, { status: 200, type: "image/png", cache: "private, no-store", bytes: Buffer.from(pixel, "base64").length });
    assert.equal((await imageAs(teacher, "/exam/api/images/999999")).status, 404);
  });

  test("the browser page draws the tree, the list and a preview with the answers marked", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
    await teacher.page.click(`.sl-exam-pool-questions tr[data-question="${questionId}"] button`);
    await teacher.page.waitForSelector(".sl-exam-pool-question", { timeout: 10000 });
    await teacher.page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-pool-text img")].every((img) => img.complete), {
      timeout: 10000,
    });
    const seen = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1")?.textContent,
      bar: Boolean(document.querySelector(".sl-exam-bar")),
      categories: [...document.querySelectorAll(".sl-exam-pool-category")].map((b) => b.textContent),
      rows: document.querySelectorAll(".sl-exam-pool-questions tbody tr").length,
      correct: [...document.querySelectorAll(".sl-exam-pool-answers li.is-correct")].map((li) => li.textContent.trim()),
      imageLoaded: [...document.querySelectorAll(".sl-exam-pool-text img")].every((img) => img.complete && img.naturalWidth === 1),
    }));
    assert.deepEqual(seen, {
      heading: "Question pool",
      bar: true,
      categories: ["All categories", "HTTP (2)", "Grundlagen (2)"],
      rows: 2,
      correct: ["✓yes de"],
      imageLoaded: true,
    });
    await teacher.page.click(".sl-exam-pool-languages button:last-child");
    assert.match(await teacher.page.$eval(".sl-exam-pool-text", (el) => el.textContent), /en picture/);
  });

  test("a long category tree keeps the buttons above it reachable at the bottom of the page", async () => {
    const viewport = teacher.page.viewport();
    await teacher.page.setViewport({ width: 1280, height: 600 });
    try {
      await teacher.page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
      const reachable = await teacher.page.evaluate(async () => {
        const list = document.querySelector(".sl-exam-pool-tree ul");
        for (let i = 0; i < 80; i++) {
          list.append(Object.assign(document.createElement("li"), { textContent: `Filler ${i}` }));
        }
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return [".sl-exam-pool-import-link"].map((selector) => {
          const link = document.querySelector(selector);
          // A link wrapped over two lines has a gap in its bounding box; hit its first line.
          const line = link.getClientRects()[0];
          const hit = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2);
          return link.getBoundingClientRect().bottom <= window.innerHeight && hit === link;
        });
      });
      assert.deepEqual(reachable, [true], "Import questions stays visible and clickable");
    } finally {
      await teacher.page.setViewport(viewport);
    }
  });

  test("the home page leads a teacher to the pool through the bar, with no line of links at its end", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector('.sl-exam-bar-page[data-page="pool"]', { timeout: 20000 });
    await teacher.page.waitForSelector("sl-exam-classes-home .sl-exam", { timeout: 20000 });
    assert.equal(
      await teacher.page.evaluate(() => document.querySelectorAll('sl-exam-classes-home a[href^="/exam/pool"], sl-exam-classes-home a[href^="/exam/scale"]').length),
      0,
      "the start page carries no links to the pool or the scale"
    );
  });

  test("no student, and no teacher in student view, reaches the pool, its preview or its images", async () => {
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const reference of ["/exam/api/pool/categories", "/exam/api/pool/questions", `/exam/api/pool/questions/${questionId}`]) {
        assert.equal((await fetchAs(session, reference)).status, 403, `${reference} is refused`);
      }
      assert.equal((await imageAs(session, `/exam/api/images/${imageId}`)).status, 403, "an image outside a test is refused");
      assert.deepEqual(
        await imageAs(session, "/exam/api/images/999999"),
        await imageAs(session, `/exam/api/images/${imageId}`),
        "and refused the same way as one that does not exist"
      );
      assert.deepEqual(await fetchAs(session, "/exam/pool"), nothing, "the page is not there");
    };
    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }
  });
});

describe("online tests: assembly", () => {
  let student;
  let teacher;
  let course;
  let questions;

  /** The 9XGB course of the gradebook's checks, and the pool the pool's checks imported. */
  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
    assert.equal(questions.length, 2, "the pool's checks imported two questions");
  });

  test("without a course in the bar the browser offers no way to create a test", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
    const [first] = await teacher.page.$$(".sl-exam-pool-questions tbody tr");
    await first.click();
    await teacher.page.waitForSelector(".sl-exam-pool-question", { timeout: 10000 });
    const seen = await teacher.page.evaluate(() => ({
      chosen: document.querySelectorAll(".sl-exam-pool-questions tr.is-chosen, .sl-exam-pool-questions tr[aria-selected]").length,
      assembly: Boolean(document.querySelector(".sl-exam-pool-assembly")),
    }));
    assert.deepEqual(seen, { chosen: 0, assembly: false }, "a click shows the preview and chooses nothing");
  });

  test("with a course in the bar, ticked questions become a test with their usage shown in the browser", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool?course=${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
    assert.match(await teacher.page.$eval(".sl-exam-pool-assembly h2", (el) => el.textContent), /9XGB GB/);
    assert.equal(await teacher.page.$$eval(".sl-exam-pool-questions tbody input[type=checkbox]", (inputs) => inputs.length), questions.length, "one box per row");
    const chosen = () => teacher.page.$$eval(".sl-exam-pool-questions tr.is-chosen", (rows) => rows.map((row) => Number(row.dataset.question)));
    // A click anywhere on a row chooses it, a second one unchooses it; the
    // first column is the row's box.
    await teacher.page.click(`tr[data-question="${questions[0].id}"] td:nth-child(3)`);
    assert.deepEqual(await chosen(), [questions[0].id]);
    await teacher.page.click(`tr[data-question="${questions[0].id}"] td:nth-child(4)`);
    assert.deepEqual(await chosen(), [], "unchosen again");
    await teacher.page.waitForSelector(".sl-exam-pool-question", { timeout: 10000 });
    for (const question of questions) await teacher.page.click(`tr[data-question="${question.id}"] td:nth-child(2) .sl-exam-pool-kind`);
    assert.deepEqual((await chosen()).sort(), questions.map((q) => q.id).sort());
    assert.match(await teacher.page.$eval(".sl-exam-pool-count", (el) => el.textContent), /2 questions chosen/);
    await teacher.page.type(".sl-exam-pool-create input[name=name]", "HTTP basics");
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-pool-create button[type=submit]")]);
    const testId = Number(new URL(teacher.page.url()).pathname.split("/").pop());
    assert.ok(testId > 0, `the test's page opened: ${teacher.page.url()}`);
    await teacher.page.waitForSelector(".sl-exam-test-questions li", { timeout: 20000 });
    const page = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1")?.textContent,
      current: document.querySelector(".sl-exam-bar-page[aria-current]")?.dataset.page,
      course: document.querySelector('.sl-exam-bar select[data-position="course"]').selectedOptions[0].textContent,
      questions: document.querySelectorAll(".sl-exam-test-questions > li").length,
      correct: document.querySelectorAll(".sl-exam-test-questions .is-correct").length,
    }));
    assert.deepEqual(page, { heading: "HTTP basics", current: "tests", course: "GB", questions: 2, correct: 2 });

    const shown = (await fetchAs(teacher, `/exam/api/pool/questions/${questions[0].id}`)).json;
    assert.deepEqual(shown.usage.map((u) => [u.testId, u.subject, u.className]), [[testId, "GB", "9xgb"]]);
    await teacher.page.goto(`${applicationUrl}/exam/pool?course=${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`tr[data-question="${questions[0].id}"]`, { timeout: 20000 });
    assert.equal(await teacher.page.$eval(`tr[data-question="${questions[0].id}"] td:nth-child(3)`, (td) => td.textContent), "1×", "the browser shows the usage");

    const listed = (await fetchAs(teacher, `/exam/api/tests?course=${course.id}`)).json.groups[0].tests;
    assert.deepEqual(listed.map((t) => [t.id, t.name, t.questions]), [[testId, "HTTP basics", 2]]);
    await fetchAs(teacher, `/exam/api/tests/${testId}`, { method: "DELETE" });
  });

  test("no student, and no teacher in student view, reaches a test", async () => {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Probe", questionIds: [questions[0].id] } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const id = created.json.id;
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const [method, reference, body] of [
        ["GET", "/exam/api/tests"],
        ["GET", `/exam/api/tests?course=${course.id}`],
        ["GET", `/exam/api/tests/${id}`],
        ["PUT", `/exam/api/tests/${id}`, { name: "Stolen" }],
        ["DELETE", `/exam/api/tests/${id}`],
        ["POST", `/exam/api/courses/${course.id}/tests`, { name: "Mine", questionIds: [questions[0].id] }],
      ]) {
        assert.equal((await fetchAs(session, reference, { method, body })).status, 403, `${method} ${reference} is refused`);
      }
      for (const reference of ["/exam/tests", `/exam/tests/${id}`]) {
        assert.deepEqual(await fetchAs(session, reference), nothing, `${reference} is not there`);
      }
    };
    try {
      await probe(student);
      await setPreferences(teacher, { vt: 0 });
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }
    const after = (await fetchAs(teacher, `/exam/api/tests/${id}`)).json;
    assert.equal(after.name, "Probe", "nothing was changed");
    await fetchAs(teacher, `/exam/api/tests/${id}`, { method: "DELETE" });
  });

  test("a test somebody has started cannot be deleted, and its questions cannot change", async () => {
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Started", questionIds: [questions[0].id] } })).json;
    // An attempt as the writing will start one, written beside the instance.
    const { db } = openDatabase(run.databasePath);
    try {
      const at = new Date().toISOString();
      const sitting = db
        .prepare("INSERT INTO sitting (test_id, opens_at, closes_at, duration_s, created_at) VALUES (?, ?, ?, 600, ?)")
        .run(created.id, at, new Date(Date.now() + 3600000).toISOString(), at);
      db.prepare("INSERT OR IGNORE INTO student (username) VALUES ('probe-student')").run();
      db.prepare("INSERT INTO attempt (test_id, sitting_id, username, started_at, deadline, question_count) VALUES (?, ?, 'probe-student', ?, ?, 1)").run(
        created.id,
        Number(sitting.lastInsertRowid),
        at,
        at
      );
    } finally {
      db.close();
    }
    const refused = await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "DELETE" });
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, /written/);
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "PUT", body: { questionIds: [questions[1].id] } })).status, 409);
    const kept = (await fetchAs(teacher, `/exam/api/tests/${created.id}`)).json;
    assert.deepEqual([kept.started, kept.questions.map((q) => q.questionId)], [true, [questions[0].id]]);
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "PUT", body: { name: "Renamed" } })).json.name, "Renamed", "renaming stays possible");
  });

  test("a scheduled sitting is deleted only by a second click on its Delete, and a click elsewhere disarms it", async () => {
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Sitting to delete", questionIds: [questions[0].id] } })).json;
    const sitting = await fetchAs(teacher, `/exam/api/tests/${created.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() + 24 * 3600000).toISOString(), closesAt: new Date(Date.now() + 25 * 3600000).toISOString(), durationMinutes: 15 },
    });
    assert.equal(sitting.status, 200, JSON.stringify(sitting.json));
    const page = teacher.page;
    const button = `li[data-sitting="${sitting.json.id}"] .sl-exam-sitting-delete`;
    const label = () => page.$eval(button, (b) => b.textContent);
    const sittings = async () => (await fetchAs(teacher, `/exam/api/tests/${created.id}`)).json.sittings.length;
    try {
      await page.goto(`${applicationUrl}/exam/tests/${created.id}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(button, { timeout: 20000 });
      assert.equal(await label(), "Delete");
      await page.click(button);
      assert.equal(await label(), "Click again to delete this sitting", "the first click only arms it");
      assert.equal(await sittings(), 1, "and deletes nothing");

      await page.click("#markdown-content h1");
      assert.equal(await label(), "Delete", "a click elsewhere disarms it");
      await page.click(button);
      await page.keyboard.press("Escape");
      assert.equal(await label(), "Delete", "so does Escape");

      await page.click(button);
      await page.click(button);
      await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, button);
      assert.equal(await sittings(), 0, "the second click deletes");
    } finally {
      await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "DELETE" });
    }
  });
});

describe("online tests: writing", () => {
  let student;
  let teacher;
  let course;
  let questions;
  let imageId;

  /** A connection to the run's database beside the instance, for what only the server knows. */
  function database(fn) {
    const { db } = openDatabase(run.databasePath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  /** A test of both pool questions with a sitting open from a minute ago for 50 minutes. */
  async function openTest(name) {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds: questions.map((q) => q.id) } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const sitting = await fetchAs(teacher, `/exam/api/tests/${created.json.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
    });
    assert.equal(sitting.status, 200, JSON.stringify(sitting.json));
    return { ...created.json, sitting: sitting.json };
  }

  /** The answer texts the teacher's page marks correct, per question name. */
  async function correctTexts(testId) {
    const test = (await fetchAs(teacher, `/exam/api/tests/${testId}`)).json;
    return test.questions.map((q) => q.answers.filter((a) => a.correct).map((a) => a.textDe.replace(/<[^>]+>/g, "").trim()));
  }

  /** Clicks the answer whose text is `text` on the writing page, and waits for its save. */
  async function choose(page, text) {
    const clicked = await page.evaluate((wanted) => {
      const label = [...document.querySelectorAll(".sl-exam-attempt-answers label")].find((l) => l.textContent.trim() === wanted);
      if (!label) return false;
      label.querySelector("input").click();
      return label.closest("fieldset").dataset.n;
    }, text);
    assert.ok(clicked, `the answer "${text}" is on the page`);
    await page.waitForFunction((n) => document.querySelector(`fieldset[data-n="${n}"] .sl-exam-attempt-state`).dataset.state === "saved", { timeout: 10000 }, clicked);
  }

  /** An image request from inside the page: its status only. */
  const imageStatus = (session) =>
    session.page.evaluate(async (address) => (await fetch(address, { credentials: "include" })).status, `${applicationUrl}/exam/api/images/${imageId}`);

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
    imageId = database((db) => db.prepare("SELECT id FROM image").get().id);
  });

  test("a student writes a test: shuffled tokens only, saved at once, resumed on reload, focus counted, submitted with points and grade only", async () => {
    const test = await openTest("Writing");
    const correct = await correctTexts(test.id);
    const page = student.page;
    const bodies = [];
    // The student's own results, drawn anew under the result once it is
    // submitted, name records by id and are not part of the writing session.
    const collect = (response) => {
      const { pathname } = new URL(response.url());
      if (pathname.startsWith("/exam/api/") && pathname !== "/exam/api/my/results" && (response.headers()["content-type"] ?? "").includes("json")) {
        bodies.push(response.text().catch(() => ""));
      }
    };
    page.on("response", collect);
    try {
      await page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
      assert.equal(await page.$(".sl-exam-bar"), null, "no bar on the student's page");
      assert.ok(await page.$("#slExamsButton.sl-exam-open"), "the Exams button is violet while a test is open");
      await page.waitForSelector(`.sl-exam-attempt-open[data-test="${test.id}"] button`, { timeout: 20000 });
      await page.click(`.sl-exam-attempt-open[data-test="${test.id}"] button`);
      await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
      await page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-writing img")].every((img) => img.complete && img.naturalWidth === 1), { timeout: 10000 });
      assert.equal(await imageStatus(student), 200, "the image of an open attempt is served");

      await choose(page, correct[0][0]);
      const before = await page.$eval(".sl-exam-countdown", (el) => el.textContent);
      assert.match(before, /^1[45]:\d\d$/, `the countdown runs from the server's 15 minutes: ${before}`);

      // Leaving the page and coming back, twice.
      for (let i = 0; i < 2; i += 1) {
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await new Promise((resolve) => setTimeout(resolve, 300));
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
      const resumed = await page.evaluate(() => [...document.querySelectorAll(".sl-exam-attempt-answers input:checked")].map((input) => input.closest("label").textContent.trim()));
      assert.deepEqual(resumed, [correct[0][0]], "the reload resumes with the saved answer");
      assert.match(await page.$eval(".sl-exam-countdown", (el) => el.textContent), /^1[45]:\d\d$/, "and the time left");

      await choose(page, correct[1][0]);
      await page.click(".sl-exam-attempt-submit");
      assert.match(await page.$eval(".sl-exam-attempt-submit", (el) => el.textContent), /Really submit/, "submitting asks once more, in the student's language");
      await page.click(".sl-exam-attempt-submit");
      await page.waitForSelector(".sl-exam-attempt-result", { timeout: 10000 });
      const result = await page.$eval(".sl-exam-attempt-result", (el) => el.textContent);
      assert.match(result, /2 of 2 questions correct – grade 1/);
      assert.equal(await page.$(".sl-exam-attempt-result input, .sl-exam-attempt-result .is-correct"), null, "nothing about the answers");
    } finally {
      page.off("response", collect);
    }

    const forbidden = new Set(["correct", "position", "questionId", "id", "testQuestionId", "testAnswerId"]);
    const keys = (value, found = new Set()) => {
      if (Array.isArray(value)) value.forEach((item) => keys(item, found));
      else if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) found.add(key) && keys(inner, found);
      return found;
    };
    const texts = await Promise.all(bodies);
    assert.ok(texts.length >= 5, `the writing session's answers were seen: ${texts.length}`);
    for (const text of texts) {
      const leaked = [...keys(JSON.parse(text || "null"))].filter((key) => forbidden.has(key));
      assert.deepEqual(leaked, [], `a response of the writing session carries ${leaked.join(", ")}: ${text.slice(0, 200)}`);
    }

    const attempt = database((db) => db.prepare("SELECT * FROM attempt WHERE test_id = ?").get(test.id));
    assert.deepEqual([attempt.score, attempt.question_count], [2, 2], "the grade is the answers', whatever the focus log says");
    assert.ok(attempt.focus_count >= 2, `the focus losses are counted: ${attempt.focus_count}`);

    // After submission: nothing more to read.
    assert.equal(await imageStatus(student), 403, "the image is refused after submission");
    const again = await fetchAs(student, `/exam/api/attempts/${attempt.id}`);
    assert.deepEqual(Object.keys(again.json).sort(), ["grade", "questionCount", "score", "submitted"]);
    assert.equal((await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).status, 409, "no second attempt");
    assert.deepEqual((await fetchAs(student, "/exam/api/my/tests")).json.tests.filter((t) => t.testId === test.id), [], "the test is hidden");
    const stillOpen = (await fetchAs(student, "/exam/api/my/tests")).json.tests.length > 0;
    await student.page.goto(`${applicationUrl}${plainPage}`, { waitUntil: "domcontentloaded" });
    assert.equal(!!(await student.page.$("#slExamsButton.sl-exam-open")), stillOpen, "and the button is violet only while another test is still open");
  });

  /** Whether the Exams page's results section is shown, and what it holds. */
  const resultsSection = (page) =>
    page.evaluate(() => {
      const section = document.querySelector(".sl-exam-my-results");
      return section ? { hidden: section.hidden, shown: section.offsetParent !== null, text: section.textContent } : null;
    });

  test("the Exams page hides the student's results while they write, also after a reload, and shows them again with the new result", async () => {
    const test = await openTest("Hidden results");
    const correct = await correctTexts(test.id);
    const page = student.page;
    await page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-my-results sl-exam-results .sl-exam-results", { timeout: 20000 });
    assert.deepEqual(
      [(await resultsSection(page)).hidden, (await resultsSection(page)).shown],
      [false, true],
      "the results are shown while no test is written"
    );
    await page.click(`.sl-exam-attempt-open[data-test="${test.id}"] button`);
    await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
    assert.deepEqual([(await resultsSection(page)).hidden, (await resultsSection(page)).shown], [true, false], "hidden once the test is started");

    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal((await resultsSection(page)).hidden, true, "a reload during the attempt renders them hidden from the start");
    await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
    assert.equal((await resultsSection(page)).hidden, true, "and they stay hidden once the attempt is resumed");

    await choose(page, correct[0][0]);
    await page.click(".sl-exam-attempt-submit");
    await page.click(".sl-exam-attempt-submit");
    await page.waitForSelector(".sl-exam-attempt-result", { timeout: 10000 });
    await page.waitForFunction(
      (name) => {
        const section = document.querySelector(".sl-exam-my-results");
        return !section.hidden && section.offsetParent !== null && section.textContent.includes(name);
      },
      { timeout: 10000 },
      test.name
    );
  });

  test("the Exams page shows the results again when the server submits at the deadline with the page open", async () => {
    const test = await openTest("Hidden until the deadline");
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    database((db) => db.prepare("UPDATE attempt SET deadline = ? WHERE id = ?").run(new Date(Date.now() + 4000).toISOString(), writing.attempt));
    const page = student.page;
    await page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
    assert.equal((await resultsSection(page)).hidden, true, "hidden while the attempt runs");
    await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
    await page.waitForSelector(".sl-exam-attempt-result", { timeout: 20000 });
    await page.waitForFunction(
      (name) => {
        const section = document.querySelector(".sl-exam-my-results");
        return !section.hidden && section.offsetParent !== null && section.textContent.includes(name);
      },
      { timeout: 10000 },
      test.name
    );
    assert.ok(database((db) => db.prepare("SELECT submitted_at FROM attempt WHERE id = ?").get(writing.attempt).submitted_at), "the server submitted it");
  });

  test("a content page that places a test beside results keeps the results visible while the student writes", async () => {
    const test = await openTest("Beside results");
    const page = student.page;
    await render(student, "/md/test-exam-writing-beside-results.md");
    await page.waitForSelector(`.sl-exam-attempt-open[data-test="${test.id}"] button`, { timeout: 20000 });
    await page.waitForSelector("sl-exam-results .sl-exam-results", { timeout: 20000 });
    await page.click(`.sl-exam-attempt-open[data-test="${test.id}"] button`);
    await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
    assert.ok(await page.$eval("sl-exam-results", (el) => el.offsetParent !== null && !el.closest("[hidden]")), "the results element stays visible");
    const attempt = database((db) => db.prepare("SELECT id FROM attempt WHERE test_id = ?").get(test.id).id);
    assert.equal((await fetchAs(student, `/exam/api/attempts/${attempt}/submit`, { method: "POST" })).status, 200);
  });

  test("a student's open tests appear and go without a reload: a sitting created, one whose window opens later, a test deleted", async () => {
    const page = student.page;
    await page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("sl-exam-test .sl-exam-attempt", { timeout: 20000 });
    const shown = (id) => page.$(`.sl-exam-attempt-open[data-test="${id}"]`);

    const now = await openTest("Streamed now");
    await page.waitForSelector(`.sl-exam-attempt-open[data-test="${now.id}"]`, { timeout: 5000 });
    await page.waitForSelector("#slExamsButton.sl-exam-open", { timeout: 5000 });

    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Streamed later", questionIds: questions.map((q) => q.id) } });
    const sitting = await fetchAs(teacher, `/exam/api/tests/${created.json.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() + 3000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
    });
    assert.equal(sitting.status, 200, JSON.stringify(sitting.json));
    assert.equal(await shown(created.json.id), null, "not before its window opens");
    await page.waitForSelector(`.sl-exam-attempt-open[data-test="${created.json.id}"]`, { timeout: 10000 });

    for (const id of [now.id, created.json.id]) {
      assert.equal((await fetchAs(teacher, `/exam/api/tests/${id}`, { method: "DELETE" })).status, 200);
    }
    await page.waitForFunction(
      (ids) => ids.every((id) => !document.querySelector(`.sl-exam-attempt-open[data-test="${id}"]`)),
      { timeout: 5000 },
      [now.id, created.json.id]
    );
  });

  test("a teacher tries a test in a window of its own, and nothing is saved, submitted or graded", async () => {
    const test = await openTest("Preview");
    await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-test-preview", { timeout: 20000 });
    assert.deepEqual(
      await teacher.page.$eval(".sl-exam-test-preview", (a) => [a.getAttribute("href"), a.getAttribute("target")]),
      [`/exam/tests/${test.id}/preview`, "_blank"],
      "it opens in a new window"
    );
    const writes = [];
    const watch = (request) => {
      if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/exam/api/")) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    };
    teacher.page.on("request", watch);
    try {
      await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}/preview`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(".sl-exam-writing[data-preview='1'] .sl-exam-attempt-question", { timeout: 20000 });
      assert.equal(await teacher.page.$(".sl-exam-bar"), null, "as a student sees it, without the bar");
      assert.match(await teacher.page.$eval(".sl-exam-attempt-preview", (el) => el.textContent), /Teacher preview/, "the controls follow the teacher's language, English by default");
      assert.match(await teacher.page.$eval(".sl-exam-countdown", (el) => el.textContent), /^1[45]:\d\d$/, "the sitting's duration");
      await teacher.page.click(".sl-exam-attempt-answers label");
      await teacher.page.click(".sl-exam-attempt-submit");
      await teacher.page.click(".sl-exam-attempt-submit");
      assert.match(await teacher.page.$eval(".sl-exam-writing .sl-exam-message", (el) => el.textContent), /nothing is submitted/);
      assert.equal(await teacher.page.$(".sl-exam-attempt-result"), null, "no result");
    } finally {
      teacher.page.off("request", watch);
    }
    assert.deepEqual(writes, [], "the preview wrote nothing");
    const preview = (await fetchAs(teacher, `/exam/api/tests/${test.id}/preview`)).json;
    assert.doesNotMatch(JSON.stringify(preview), /"correct"|"position"|"id"/, "the preview carries no flags either");
    assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE test_id = ?").get(test.id).n), 0, "no attempt");
    assert.equal((await fetchAs(student, `/exam/api/tests/${test.id}/preview`)).status, 403, "a student is refused");
    assert.deepEqual(await fetchAs(student, `/exam/tests/${test.id}/preview`), await fetchAs(student, absent), "and finds no page");
  });

  test("a teacher shows a test's solution on the board: correct answers and the class's share, no names, no foreign host", async () => {
    const tests = (await fetchAs(teacher, `/exam/api/tests?course=${course.id}`)).json.groups[0].tests;
    const written = tests.find((t) => t.name === "Writing");
    const unwritten = tests.find((t) => t.name === "Preview");
    await teacher.page.goto(`${applicationUrl}/exam/tests/${written.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-test-solution", { timeout: 20000 });
    assert.deepEqual(
      await teacher.page.$eval(".sl-exam-test-solution", (a) => [a.getAttribute("href"), a.getAttribute("target")]),
      [`/exam/tests/${written.id}/solution`, "_blank"],
      "the test's page opens the solution in a new window"
    );

    const deck = async (testId) => {
      const hosts = new Set();
      const record = (request) => hosts.add(new URL(request.url()).host);
      teacher.page.on("request", record);
      try {
        await teacher.page.goto(`${applicationUrl}/exam/tests/${testId}/solution`, { waitUntil: "networkidle0" });
        await teacher.page.waitForFunction(() => document.body.style.display !== "none", { timeout: 10000 });
        const seen = await teacher.page.evaluate(() => ({
          html: document.documentElement.outerHTML,
          revealed: Boolean(document.querySelector(".reveal.ready, .reveal .slides section.present")),
          questions: [...document.querySelectorAll("section.sl-board-question")].map((s) => ({
            correct: s.querySelectorAll(".sl-board-correct").length,
            share: s.querySelector(".sl-board-share")?.textContent ?? null,
          })),
        }));
        return { ...seen, hosts: [...hosts] };
      } finally {
        teacher.page.off("request", record);
      }
    };

    const flags = (await fetchAs(teacher, `/exam/api/tests/${written.id}`)).json.questions.map((q) => q.answers.filter((a) => a.correct).length);
    const solved = await deck(written.id);
    assert.ok(solved.revealed, "the deck runs in the presentation view");
    assert.deepEqual(
      solved.questions,
      flags.map((correct) => ({ correct, share: "Richtig beantwortet: 100 %" })),
      "one slide per question, its correct answers marked and the share of the one submitted attempt"
    );
    assert.deepEqual(solved.hosts, [new URL(applicationUrl).host], `the deck contacts no other host: ${solved.hosts.join(", ")}`);
    const names = database((db) => db.prepare("SELECT username, given_name, family_name FROM student").all())
      .flatMap((s) => [s.username, s.given_name, s.family_name])
      .filter((value) => typeof value === "string" && value.length > 2);
    assert.ok(names.length > 0);
    assert.deepEqual(names.filter((name) => solved.html.toLowerCase().includes(name.toLowerCase())), [], "no student is named in the deck");

    const fresh = await deck(unwritten.id);
    assert.ok(fresh.questions.length > 0 && fresh.questions.every((q) => q.correct > 0 && q.share === null), "a test nobody wrote shows the answers and no share");

    assert.deepEqual(await fetchAs(student, `/exam/tests/${written.id}/solution`), await fetchAs(student, absent), "a student finds no deck");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.deepEqual(await fetchAs(teacher, `/exam/tests/${written.id}/solution`), await fetchAs(teacher, absent), "nor does a teacher in student view");
    } finally {
      await setPreferences(teacher, {});
    }
  });

  test("a submitted attempt is a read-only field of its test's column in the sheet, and counts in the proposal", async () => {
    const tests = (await fetchAs(teacher, `/exam/api/tests?course=${course.id}`)).json.groups[0].tests;
    const written = tests.find((t) => t.name === "Writing");
    const username = student.username.toLowerCase();
    const overview = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json;
    const column = overview.columns.find((c) => c.id === `test-${written.id}`);
    assert.deepEqual([column.category, column.readOnly, column.maxPoints, column.name], ["onlineTests", true, 2, "Writing"]);
    const row = overview.students.find((r) => r.username === username);
    assert.deepEqual(row.results[column.id], { value: 1, points: 2 });
    assert.ok(row.categories.onlineTests, "the online tests count in the proposal");
    assert.equal(overview.students.find((r) => r.username === "gb-other-student").results[column.id], undefined, "nobody else has a result");

    const own = (await fetchAs(student, "/exam/api/my/results")).json.courses.find((c) => c.subject === "GB");
    assert.ok(own.entries.some((e) => e.name === "Writing" && e.points === 2 && e.maxPoints === 2), "the student's own results show the test by name");

    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=ws`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
    const cell = await teacher.page.$eval(`td.sl-exam-online-result[data-column="${column.id}"][data-student="${username}"]`, (td) => ({
      text: td.textContent,
      fields: td.querySelectorAll("input, select, textarea").length,
    }));
    assert.deepEqual(cell, { text: "2/2", fields: 0 }, "shown, and nothing to type into");
    const head = await teacher.page.$eval(`th[data-column="${column.id}"]`, (th) => ({ link: th.querySelector("a")?.getAttribute("href"), delete: Boolean(th.querySelector(".sl-exam-delete")) }));
    assert.deepEqual(head, { link: `/exam/tests/${written.id}`, delete: false });

    // The arrow keys pass over the online columns: they are the sheet's first,
    // so left from the first manual field stays there, and right goes on.
    const fields = await teacher.page.$$eval(`input.sl-exam-cell[data-student="${username}"]`, (inputs) => inputs.map((input) => Number(input.dataset.col)));
    const online = await teacher.page.$$eval("th.sl-exam-column-online", (ths) => ths.length);
    assert.ok(online >= 1 && fields.length >= 2, `online columns ${online}, fields ${fields.join(",")}`);
    assert.equal(Math.min(...fields), online, "the first field is the first manual column");
    const first = `input.sl-exam-cell[data-student="${username}"][data-col="${online}"]`;
    await teacher.page.focus(first);
    await teacher.page.evaluate((s) => document.querySelector(s).select(), first);
    await teacher.page.keyboard.press("ArrowLeft");
    assert.equal(await teacher.page.evaluate(() => Number(document.activeElement.dataset.col)), online, "left stays in the first field");
    await teacher.page.keyboard.press("ArrowRight");
    assert.equal(await teacher.page.evaluate(() => Number(document.activeElement.dataset.col)), Math.min(...fields.filter((col) => col > online)));
    await teacher.page.keyboard.press("ArrowLeft");
    await teacher.page.keyboard.press("ArrowLeft");
    assert.equal(await teacher.page.evaluate(() => Number(document.activeElement.dataset.col)), online, "and back, never into an online column");
  });

  test("a second browser is refused and recorded until the teacher unbinds the attempt, and the live view names both browsers", async () => {
    const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36";
    const original = await student.page.browser().userAgent();
    const test = await openTest("Device");
    const username = student.username.toLowerCase();
    const row = `sl-exam-live tr[data-username="${username}"]`;
    const dialogs = [];
    const onDialog = (dialog) => {
      dialogs.push(dialog.type());
      dialog.dismiss().catch(() => {});
    };
    teacher.page.on("dialog", onDialog);
    try {
      await student.page.setUserAgent(firefox);
      const started = await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" });
      assert.equal(started.status, 200);
      const attemptId = started.json.attempt;
      const cookieName = `sl-attempt-${attemptId}`;
      const cookie = (await student.context.cookies()).find((c) => c.name === cookieName);
      assert.ok(cookie, "the browser holds the attempt's cookie");
      assert.deepEqual([cookie.httpOnly, cookie.sameSite, cookie.path], [true, "Strict", "/exam/"]);

      await teacher.page.goto(`${applicationUrl}/exam/sittings/${test.sitting.id}/live`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
      await teacher.page.waitForSelector(`${row} .sl-exam-live-bound .sl-exam-live-ua-short`, { timeout: 20000 });
      assert.deepEqual(
        await teacher.page.$eval(`${row} .sl-exam-live-ua-short`, (el) => [el.textContent, el.title]),
        ["Firefox 131 · Windows", firefox],
        "the short label, and the full string on mouse-over"
      );
      const toggle = `${row} .sl-exam-live-bound .sl-exam-live-ua-toggle`;
      const fullShown = () => teacher.page.$eval(`${row} .sl-exam-live-bound .sl-exam-live-ua-full`, (el) => (el.hidden ? null : el.textContent));
      assert.equal(await fullShown(), null);
      await teacher.page.tap(toggle);
      assert.equal(await fullShown(), firefox, "a tap shows the full string in place");
      assert.equal(await teacher.page.$eval(toggle, (el) => el.getAttribute("aria-expanded")), "true");
      await teacher.page.tap(toggle);
      assert.equal(await fullShown(), null, "and another hides it");

      // Another browser of the same account: the session without the cookie.
      await student.context.deleteCookie(cookie);
      await student.page.setUserAgent(safari);
      const refused = await fetchAs(student, `/exam/api/attempts/${attemptId}`);
      assert.equal(refused.status, 409);
      assert.match(refused.json.error, /another browser/);
      assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM refused_device WHERE attempt_id = ?").get(attemptId).n), 1, "the refusal is recorded");
      await teacher.page.waitForFunction(
        (selector) => document.querySelector(`${selector} .sl-exam-live-refused`)?.textContent.includes("Safari 18 · iOS"),
        { timeout: 10000 },
        row
      );
      assert.match(await teacher.page.$eval(`${row} .sl-exam-live-refused`, (el) => el.textContent), /^1 refused/, "the count, and the browser refused last");

      assert.equal((await fetchAs(student, `/exam/api/attempts/${attemptId}/release`, { method: "POST" })).status, 403, "a student cannot unbind");
      assert.equal(await teacher.page.$eval(`${row} .sl-exam-live-release`, (b) => b.textContent), "Unbind browser");
      await teacher.page.click(`${row} .sl-exam-live-release`);
      await teacher.page.waitForSelector(`${row} .sl-exam-live-bound[data-bound="waiting"]`, { timeout: 10000 });
      assert.match(await teacher.page.$eval(`${row} .sl-exam-live-bound`, (el) => el.textContent), /waiting for the next browser/);
      assert.deepEqual(dialogs, [], "a single click, no dialog");

      await student.page.setUserAgent(android);
      const resumed = await fetchAs(student, `/exam/api/attempts/${attemptId}`);
      assert.equal(resumed.status, 200, "the unbound attempt resumes on the new browser");
      assert.ok(resumed.json.remainingMs > 0 && resumed.json.questions.length === 2);
      assert.ok((await student.context.cookies()).some((c) => c.name === cookieName && c.value !== cookie.value), "bound to the new browser");
      await teacher.page.waitForFunction(
        (selector) => document.querySelector(`${selector} .sl-exam-live-bound .sl-exam-live-ua-short`)?.textContent === "Chrome 130 · Android",
        { timeout: 10000 },
        row
      );

      // Nothing of it reaches the class screen or the student.
      const agents = [firefox, safari, android];
      const carries = (text) => agents.filter((agent) => text.includes(agent) || text.includes(agent.slice(0, 60)));
      await teacher.page.goto(`${applicationUrl}/exam/sittings/${test.sitting.id}/screen`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(".sl-exam-screen-clock", { timeout: 20000 });
      const screen = await teacher.page.evaluate(() => document.body.innerText + document.body.innerHTML);
      assert.deepEqual(carries(screen), [], "the class screen names no browser");
      assert.doesNotMatch(screen, /Firefox 131|Safari 18|Chrome 130/);
      assert.deepEqual(carries(JSON.stringify(resumed.json)), [], "the student's attempt names no browser");
      await student.page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
      await student.page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
      const own = await student.page.evaluate(() => document.body.innerHTML);
      assert.deepEqual(carries(own), [], "nor does the student's writing page");
      assert.doesNotMatch(own, /Chrome 130 · Android|Bound to browser/);
      await fetchAs(student, `/exam/api/attempts/${attemptId}/submit`, { method: "POST" });
    } finally {
      teacher.page.off("dialog", onDialog);
      await student.page.setUserAgent(original);
    }
  });

  test("a write after the deadline is refused, and the attempt is submitted with what was saved", async () => {
    const test = await openTest("Late");
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    const first = writing.questions[0];
    assert.equal((await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[0].token] } })).status, 200);
    database((db) => db.prepare("UPDATE attempt SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), writing.attempt));
    const late = await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[1].token] } });
    assert.equal(late.status, 409, "the late write is refused");
    const row = database((db) => db.prepare("SELECT * FROM attempt WHERE id = ?").get(writing.attempt));
    assert.ok(row.submitted_at, "submitted");
    const chosen = database((db) => db.prepare("SELECT COUNT(*) AS n FROM response WHERE attempt_id = ?").get(writing.attempt).n);
    assert.equal(chosen, 1, "with the answer saved before the deadline, unchanged");
  });

  test("at the deadline an attempt whose page is closed is submitted by the server", async () => {
    const test = await openTest("Closed");
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    const first = writing.questions[0];
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[0].token] } });
    await student.page.goto(`${applicationUrl}${plainPage}`, { waitUntil: "domcontentloaded" });
    database((db) => db.prepare("UPDATE attempt SET deadline = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), writing.attempt));
    const until = Date.now() + 45000;
    let row;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      row = database((db) => db.prepare("SELECT * FROM attempt WHERE id = ?").get(writing.attempt));
    } while (!row.submitted_at && Date.now() < until);
    assert.ok(row.submitted_at, "the sweep submitted it within 45 s");
    assert.equal(row.submitted_at, row.deadline, "at its deadline");
    assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM response WHERE attempt_id = ?").get(writing.attempt).n), 1);
  });

  test("no student reaches another student's attempt, and a teacher cannot write a test", async () => {
    const test = await openTest("Others");
    const foreign = database((db) => {
      const sitting = db.prepare("SELECT id FROM sitting WHERE test_id = ?").get(test.id).id;
      const at = new Date().toISOString();
      return Number(
        db
          .prepare("INSERT INTO attempt (test_id, sitting_id, username, started_at, deadline, question_count, device_hash) VALUES (?, ?, 'gb-other-student', ?, ?, 2, 'x')")
          .run(test.id, sitting, at, new Date(Date.now() + 600000).toISOString()).lastInsertRowid
      );
    });
    for (const [method, reference, body] of [
      ["GET", `/exam/api/attempts/${foreign}`],
      ["PUT", `/exam/api/attempts/${foreign}/questions/1`, { tokens: [] }],
      ["POST", `/exam/api/attempts/${foreign}/submit`],
      ["POST", `/exam/api/attempts/${foreign}/focus`, { state: "away" }],
    ]) {
      assert.equal((await fetchAs(student, reference, { method, body })).status, 404, `${method} ${reference}: somebody else's attempt does not exist`);
    }
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).status, 403, "a teacher is refused");
    assert.deepEqual((await fetchAs(teacher, "/exam/api/my/tests")).json.tests, [], "and has no open test");
    await setPreferences(teacher, { vt: 0 });
    try {
      assert.equal((await fetchAs(teacher, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).status, 404, "in student view, on no roster");
    } finally {
      await setPreferences(teacher, {});
    }
  });
});

describe("online tests: the live view", () => {
  let student;
  let teacher;
  let course;
  let questions;
  let written;
  let sitting;

  /** The live view's row of the shared student, as the page shows it. */
  const studentRow = () =>
    teacher.page.evaluate((username) => {
      const row = document.querySelector(`sl-exam-live tr[data-username="${username}"]`);
      return row ? { status: row.dataset.status, focus: row.querySelector(".sl-exam-live-focus").textContent } : null;
    }, student.username.toLowerCase());

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
  });

  /** A test with a sitting open now, its live view open on the teacher's page. */
  async function openLive(name) {
    written = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds: questions.map((q) => q.id) } })).json;
    sitting = (
      await fetchAs(teacher, `/exam/api/tests/${written.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
    assert.deepEqual(await studentRow(), { status: "not started", focus: "–" });
  }

  test("the stream refuses a request without a session and a student's, and sends them nothing", async () => {
    await openLive("Live refusals");
    const anonymous = await fetch(`${applicationUrl}/exam/api/sittings/${sitting.id}/events`, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    assert.notEqual(anonymous.status, 200);
    assert.doesNotMatch(anonymous.headers.get("content-type") ?? "", /event-stream/);
    const asStudent = await student.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return { status: response.status, type: response.headers.get("content-type") };
    }, `${applicationUrl}/exam/api/sittings/${sitting.id}/events`);
    assert.equal(asStudent.status, 403);
    assert.doesNotMatch(asStudent.type ?? "", /event-stream/);
    for (const reference of [`/exam/api/sittings/${sitting.id}/live`]) assert.equal((await fetchAs(student, reference)).status, 403);
    assert.deepEqual(await fetchAs(student, `/exam/sittings/${sitting.id}/live`), await fetchAs(student, absent), "the page is not there");
  });

  test("a start, a focus loss and a submission reach the teacher at once, and the hot-reload channel carries none of it", async () => {
    await openLive("Live changes");
    // Listening on the unauthenticated hot-reload channel, as anybody can.
    const controller = new AbortController();
    const heard = [];
    const listening = fetch(`${applicationUrl}/hot-reload`, { signal: controller.signal })
      .then(async (response) => {
        const reader = response.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          heard.push(Buffer.from(value).toString("utf8"));
        }
      })
      .catch(() => {});
    try {
      const writing = (await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" })).json;
      await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "writing", { timeout: 5000 }, student.username.toLowerCase());
      await fetchAs(student, `/exam/api/attempts/${writing.attempt}/focus`, { method: "POST", body: { state: "away" } });
      await fetchAs(student, `/exam/api/attempts/${writing.attempt}/focus`, { method: "POST", body: { state: "back" } });
      await teacher.page.waitForFunction((u) => /left 1×/.test(document.querySelector(`sl-exam-live tr[data-username="${u}"] .sl-exam-live-focus`)?.textContent), { timeout: 5000 }, student.username.toLowerCase());
      await fetchAs(student, `/exam/api/attempts/${writing.attempt}/submit`, { method: "POST" });
      await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "submitted", { timeout: 5000 }, student.username.toLowerCase());
      assert.equal(await teacher.page.evaluate(() => document.querySelector("sl-exam-live").dataset.mode), "stream", "pushed, not polled");
    } finally {
      controller.abort();
      await listening;
    }
    const channel = heard.join("");
    for (const trace of [student.username.toLowerCase(), "Live changes", "submitted", "writing", "attempt", "sitting"]) {
      assert.ok(!channel.includes(trace), `the hot-reload channel carried "${trace}": ${channel.slice(0, 200)}`);
    }
  });

  test("when the stream fails the view keeps updating from snapshots", async () => {
    await openLive("Live fallback");
    await teacher.page.evaluate(() => document.querySelector("sl-exam-live").fallBack());
    assert.equal(await teacher.page.evaluate(() => document.querySelector("sl-exam-live").dataset.mode), "polling");
    await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
    await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "writing", { timeout: 12000 }, student.username.toLowerCase());
    assert.equal(await teacher.page.evaluate(() => document.querySelector("sl-exam-live").dataset.mode), "polling", "updated by a snapshot");
  });

  test("the live view of a sitting can be opened before it opens, and shows the first start as it happens", async () => {
    written = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Live early", questionIds: questions.map((q) => q.id) } })).json;
    sitting = (
      await fetchAs(teacher, `/exam/api/tests/${written.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() + 10 * 60000).toISOString(), closesAt: new Date(Date.now() + 60 * 60000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    await teacher.page.goto(`${applicationUrl}/exam/tests/${written.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`li[data-sitting="${sitting.id}"][data-state="scheduled"] a[href="/exam/sittings/${sitting.id}/live"]`, { timeout: 20000 });
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
    const head = await teacher.page.evaluate(() => ({
      badge: document.querySelector(".sl-exam-live-badge").textContent,
      window: document.querySelector(".sl-exam-live-window").textContent,
      clock: document.querySelector(".sl-exam-live-clock").textContent,
      first: document.querySelector("sl-exam-live .sl-exam-live-head") === document.querySelector("sl-exam-live .sl-exam").firstElementChild,
    }));
    assert.equal(head.badge, "Not open yet");
    assert.match(head.window, /opens in (9|10):\d\d$/, head.window);
    assert.match(head.clock, /\d{1,2}:\d\d:\d\d/, "the server's time, in the viewer's time zone");
    assert.ok(head.first, "the state stands at the top");
    assert.deepEqual(await studentRow(), { status: "not started", focus: "–" });
    assert.equal((await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" })).status, 404, "nobody writes before it opens");
    // The sitting opens.
    const { db } = openDatabase(run.databasePath);
    try {
      db.prepare("UPDATE sitting SET opens_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), sitting.id);
    } finally {
      db.close();
    }
    await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
    await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "writing", { timeout: 5000 }, student.username.toLowerCase());
    await teacher.page.waitForFunction(() => document.querySelector(".sl-exam-live-badge").textContent === "Live", { timeout: 3000 });
    assert.match(await teacher.page.$eval(".sl-exam-live-window", (el) => el.textContent), /closes in \d+:\d\d$/);
    const focus = await teacher.page.$eval(`sl-exam-live tr[data-username="${student.username.toLowerCase()}"] .sl-exam-live-focus`, (td) => ({ level: td.dataset.level, share: td.querySelector(".sl-exam-live-share").textContent }));
    assert.deepEqual(focus, { level: "good", share: "100\u00a0%" }, "never left: a full green bar");
  });

  test("the view for the class shows state, window, time left and clock, without navigation and without a name", async () => {
    await openLive("Live screen");
    const fromList = async (reference) => {
      await teacher.page.goto(`${applicationUrl}${reference}`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(`a.sl-exam-screen-link[href="/exam/sittings/${sitting.id}/screen"]`, { timeout: 20000 });
      return teacher.page.$eval(`a.sl-exam-screen-link[href="/exam/sittings/${sitting.id}/screen"]`, (a) => a.getAttribute("target"));
    };
    assert.equal(await fromList(`/exam/tests?course=${course.id}`), "_blank", "the online tests' list links the class screen in a new window");
    assert.equal(await fromList(`/exam/tests/${written.id}`), "_blank", "and so does the test's page");
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-live-screen-link", { timeout: 20000 });
    assert.equal(
      await teacher.page.$eval(".sl-exam-live-screen-link", (a) => [a.getAttribute("href"), a.getAttribute("target")].join(" ")),
      `/exam/sittings/${sitting.id}/screen _blank`
    );
    await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/screen`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "polling", { timeout: 20000 });
    const seen = await teacher.page.evaluate(() => ({
      navigation: Boolean(document.querySelector("#topbar, #sidebar, .sl-exam-bar")),
      list: Boolean(document.querySelector("sl-exam-live table, sl-exam-live button")),
      badge: document.querySelector(".sl-exam-live-badge").textContent,
      label: document.querySelector(".sl-exam-screen-label").textContent,
      remaining: document.querySelector(".sl-exam-screen-remaining").textContent,
      clock: document.querySelector(".sl-exam-screen-clock").textContent,
      summary: document.querySelector(".sl-exam-live-summary").textContent,
      text: document.body.innerText,
      size: parseFloat(getComputedStyle(document.querySelector(".sl-exam-screen-remaining")).fontSize),
    }));
    assert.equal(seen.navigation, false, "no top bar, sidebar or module bar");
    assert.equal(seen.list, false, "no list and nothing to click");
    assert.deepEqual([seen.badge, seen.label], ["Live", "Closes in"]);
    assert.match(seen.remaining, /^\d+:\d\d$/);
    assert.match(seen.clock, /\d{1,2}:\d\d:\d\d/);
    assert.match(seen.summary, /1 writing/);
    assert.ok(!seen.text.toLowerCase().includes(student.username.toLowerCase()), "no name on the screen");
    assert.ok(seen.size >= 64, `the time left is large: ${seen.size}px`);
    assert.deepEqual(await fetchAs(student, `/exam/sittings/${sitting.id}/screen`), await fetchAs(student, absent), "a student finds no page");
  });

  test("the view for the class counts a start and a submission within seconds, without a reload", async () => {
    await openLive("Live screen counts");
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/screen`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-screen .sl-exam-live-summary", { timeout: 20000 });
    const summary = () => teacher.page.$eval(".sl-exam-live-summary", (p) => p.textContent);
    const first = await summary();
    assert.match(first, /^0 writing · 0 submitted · \d+ not started$/, first);
    const roster = Number(first.match(/(\d+) not started/)[1]);
    const counted = (text) =>
      teacher.page.waitForFunction((text) => document.querySelector(".sl-exam-live-summary")?.textContent === text, { timeout: 10000, polling: 250 }, text);
    const writing = (await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" })).json;
    await counted(`1 writing · 0 submitted · ${roster - 1} not started`);
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/submit`, { method: "POST" });
    await counted(`0 writing · 1 submitted · ${roster - 1} not started`);
  });

  test("the view for the class waits through a failed snapshot, says so, draws the next one, and reloads after an ended session", async () => {
    await openLive("Live screen waits");
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/screen`, { waitUntil: "domcontentloaded" });
    const polling = () => teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "polling", { timeout: 20000, polling: 250 });
    await polling();
    /** The next snapshots fail as `failures` says: a status, or "network". */
    const failNext = (failures) =>
      teacher.page.evaluate((failures) => {
        const real = window.fetch;
        window.fetch = (input, init) => {
          if (String(input).endsWith("/live") && failures.length > 0) {
            const failure = failures.shift();
            return failure === "network"
              ? Promise.reject(new TypeError("Failed to fetch"))
              : Promise.resolve(new Response(JSON.stringify({ error: "Failed" }), { status: Number(failure), headers: { "Content-Type": "application/json" } }));
          }
          return real(input, init);
        };
      }, failures);
    await failNext(["500", "network"]);
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "waiting", { timeout: 10000, polling: 250 });
    assert.match(await teacher.page.$eval("sl-exam-live .sl-exam-live-state", (el) => el.textContent), /waiting for the connection/);
    await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
    await teacher.page.waitForFunction(() => /^1 writing/.test(document.querySelector(".sl-exam-live-summary")?.textContent), { timeout: 20000, polling: 250 });
    assert.equal(await teacher.page.evaluate(() => document.querySelector("sl-exam-live").dataset.mode), "polling", "updating again");

    // An ended session: the page goes through the login and comes back polling.
    const reloaded = teacher.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 });
    await failNext(["401"]);
    await reloaded;
    await polling();
    assert.equal(new URL(teacher.page.url()).pathname, `/exam/sittings/${sitting.id}/screen`);
    assert.match(await teacher.page.$eval(".sl-exam-live-summary", (p) => p.textContent), /^1 writing/);
  });

  test("a sitting that is over links its live view, not the view for the class, and the live view shows each focus record", async () => {
    await openLive("Live after");
    const writing = (await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" })).json;
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/submit`, { method: "POST" });
    const setFocus = (count, ms) => {
      const { db } = openDatabase(run.databasePath);
      try {
        db.prepare("UPDATE attempt SET focus_count = ?, focus_ms = ? WHERE id = ?").run(count, ms, writing.attempt);
      } finally {
        db.close();
      }
    };
    setFocus(2, 252000);
    const { db } = openDatabase(run.databasePath);
    try {
      db.prepare("UPDATE sitting SET opens_at = ?, closes_at = ? WHERE id = ?").run(new Date(Date.now() - 3 * 3600000).toISOString(), new Date(Date.now() - 3600000).toISOString(), sitting.id);
    } finally {
      db.close();
    }
    const links = async (reference, item) => {
      await teacher.page.goto(`${applicationUrl}${reference}`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(item, { timeout: 20000 });
      return teacher.page.$eval(item, (li) => ({
        live: li.querySelector("a.sl-exam-live-link")?.getAttribute("href") ?? null,
        screen: Boolean(li.querySelector(".sl-exam-screen-link")),
      }));
    };
    const expected = { live: `/exam/sittings/${sitting.id}/live`, screen: false };
    assert.deepEqual(await links(`/exam/tests?course=${course.id}`, `tr[data-test="${written.id}"] li[data-state="over"]`), expected, "the course's list");
    assert.deepEqual(await links(`/exam/tests/${written.id}`, `li[data-sitting="${sitting.id}"][data-state="over"]`), expected, "the test's page");

    await teacher.page.click(`li[data-sitting="${sitting.id}"] a.sl-exam-live-link`);
    await teacher.page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "submitted", { timeout: 20000 }, student.username.toLowerCase());
    const seen = await teacher.page.evaluate((u) => ({
      badge: document.querySelector(".sl-exam-live-badge").textContent,
      focus: document.querySelector(`sl-exam-live tr[data-username="${u}"] .sl-exam-live-focus`).textContent.trim(),
      others: [...document.querySelectorAll(`sl-exam-live tbody tr:not([data-username="${u}"])`)].map((row) => [row.dataset.status, row.querySelector(".sl-exam-live-focus").textContent]),
      release: Boolean(document.querySelector(".sl-exam-live-release")),
      window: [...document.querySelectorAll(".sl-exam-live-end, .sl-exam-live-extend")].some((button) => button.offsetParent !== null),
      screen: document.querySelector(".sl-exam-live-screen-link")?.offsetParent != null,
    }), student.username.toLowerCase());
    assert.equal(seen.badge, "Over");
    assert.match(seen.focus, /^\d+(\.\d)? % · left 2×, 4 min 12 s$/, seen.focus);
    assert.ok(seen.others.every(([status, focus]) => status === "not started" && focus === "–"), JSON.stringify(seen.others));
    assert.equal(seen.release, false, "no Unbind");
    assert.equal(seen.window, false, "no End now and no Extend");
    assert.equal(seen.screen, false, "no link to the view for the class");

    const shownAs = async (count, ms) => {
      setFocus(count, ms);
      await teacher.page.evaluate(() => document.querySelector("sl-exam-live").poll());
      return teacher.page.$eval(`sl-exam-live tr[data-username="${student.username.toLowerCase()}"] .sl-exam-live-left-page`, (el) => el.textContent);
    };
    assert.equal(await shownAs(2, 300000), " · left 2×, 5 min", "whole minutes");
    assert.equal(await shownAs(3, 47000), " · left 3×, 47 s", "below a minute in seconds");
    assert.equal(await shownAs(1, 60000), " · left 1×, 1 min");
  });

  test("a teacher who switches to the student view gets refused, and the view says why", async () => {
    await openLive("Live student view");
    // Switched in another tab, so the live view's page stays open.
    const other = await teacher.context.newPage();
    await other.goto(`${applicationUrl}${plainPage}`, { waitUntil: "domcontentloaded" });
    const elsewhere = { ...teacher, page: other };
    await setPreferences(elsewhere, { vt: 0 });
    try {
      // The next change of the sitting is checked against the session first.
      await fetchAs(student, `/exam/api/tests/${written.id}/attempt`, { method: "POST" });
      // Polled on an interval: the live view's tab is in the background now,
      // where the default requestAnimationFrame polling never runs again.
      await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "refused", { timeout: 10000, polling: 250 });
      assert.match(await teacher.page.$eval("sl-exam-live .sl-exam-live-state", (el) => el.textContent), /student view is active/);
      assert.equal(await teacher.page.$$eval("sl-exam-live tbody tr", (rows) => rows.length), 0, "nothing of the sitting is left on the page");
    } finally {
      await setPreferences(elsewhere, {});
      await other.close();
    }
  });
});

describe("the question editor", () => {
  let student;
  let teacher;
  let course;
  let categoryId;

  // A 1×1 PNG, and a second, different one.
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const otherPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

  /** A connection to the run's database beside the instance, for what only the server knows. */
  function database(fn) {
    const { db } = openDatabase(run.databasePath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  /**
   * An upload from inside the page, as the editor sends one: the bytes of
   * `base64`, or `size` bytes starting like a PNG, in a file called `name`.
   */
  async function uploadAs(session, { base64 = null, size = 0, name = "image.png" }) {
    return session.page.evaluate(
      async (address, base64, size, name) => {
        let bytes;
        if (base64 !== null) {
          bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        } else {
          bytes = new Uint8Array(size);
          bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        }
        const response = await fetch(address, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "application/octet-stream" },
          body: new File([bytes], name, { type: "image/png" }),
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          // Not JSON.
        }
        return { status: response.status, json };
      },
      `${applicationUrl}/exam/api/pool/uploads`,
      base64,
      size,
      name
    );
  }

  /** What an image address answers inside the page: its status and size. */
  const imageAs = (session, reference) =>
    session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
    }, `${applicationUrl}${reference}`);

  /** A complete new question in the checks' category; `overrides` change any field. */
  async function newQuestion(overrides = {}) {
    const created = await fetchAs(teacher, "/exam/api/pool/questions", {
      method: "POST",
      body: {
        categoryId,
        type: "multichoice",
        nameDe: "Editor-Frage",
        nameEn: "Editor question",
        textDe: "<p>Was ist richtig?</p>",
        textEn: "<p>What is right?</p>",
        answers: [
          { textDe: "<p>das</p>", textEn: "<p>this</p>", correct: true },
          { textDe: "<p>jenes</p>", textEn: "<p>that</p>", correct: false },
        ],
        ...overrides,
      },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    return created.json.question;
  }

  /** The question as the editor sends it back unchanged. */
  async function editable(id) {
    const q = (await fetchAs(teacher, `/exam/api/pool/questions/${id}`)).json;
    return {
      version: q.version,
      categoryId: q.categoryId,
      type: q.type,
      nameDe: q.nameDe,
      nameEn: q.nameEn,
      textDe: q.textDe,
      textEn: q.textEn,
      answers: q.answers.map(({ textDe, textEn, correct }) => ({ textDe, textEn, correct })),
    };
  }

  /** A test of `questionIds` for the GB course; with `written`, the student has started it. */
  async function testOf(name, questionIds, { written = false } = {}) {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    if (written) {
      await fetchAs(teacher, `/exam/api/tests/${created.json.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
      });
      const writing = await fetchAs(student, `/exam/api/tests/${created.json.id}/attempt`, { method: "POST" });
      assert.equal(writing.status, 200, JSON.stringify(writing.json));
      await fetchAs(student, `/exam/api/attempts/${writing.json.attempt}/submit`, { method: "POST" });
    }
    return created.json;
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    const created = await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: null, nameDe: "Editor-Checks", nameEn: "Editor checks" } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    categoryId = created.json.id;
  });

  test("no student, and no teacher in student view, reaches the editor's pages or changes the pool", async () => {
    const question = await newQuestion();
    const { src } = (await uploadAs(teacher, { base64: pixel })).json;
    const before = await editable(question.id);
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const page of [`/exam/pool/questions/${question.id}`, `/exam/pool/questions/new?category=${categoryId}`, "/exam/pool/categories"]) {
        assert.deepEqual(await fetchAs(session, page), nothing, `${page} is not there`);
      }
      for (const [method, reference, body] of [
        ["POST", "/exam/api/pool/questions", { ...before, nameDe: "x" }],
        ["PUT", `/exam/api/pool/questions/${question.id}`, { ...before, nameDe: "x" }],
        ["POST", `/exam/api/pool/questions/${question.id}/retire`],
        ["DELETE", `/exam/api/pool/questions/${question.id}`],
        ["POST", "/exam/api/pool/categories", { nameDe: "x", nameEn: "x" }],
        ["PUT", `/exam/api/pool/categories/${categoryId}`, { nameDe: "x", nameEn: "x" }],
        ["DELETE", `/exam/api/pool/categories/${categoryId}`],
      ]) {
        assert.equal((await fetchAs(session, reference, { method, body })).status, 403, `${method} ${reference} is refused`);
      }
      assert.equal((await uploadAs(session, { base64: pixel })).status, 403, "the upload is refused");
      assert.equal((await imageAs(session, src.replace(applicationUrl, ""))).status, 403, "a staged upload is not served");
    };
    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }
    assert.deepEqual(await editable(question.id), before, "the question is unchanged");
    assert.equal((await fetchAs(teacher, `/exam/api/pool/categories`)).json.find((c) => c.id === categoryId).nameDe, "Editor-Checks");
  });

  test("a mismatch is refused with the answer named, and nothing is stored", async () => {
    const question = await newQuestion();
    const input = await editable(question.id);
    input.answers[1].textEn = "";
    input.answers[1].correct = true;
    const refused = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input });
    assert.equal(refused.status, 422);
    assert.deepEqual(
      refused.json.problems.map((p) => [p.field, p.answer, p.message]),
      [
        ["textEn", 2, "Answer 2 has no English text."],
        ["answers", null, "Exactly one answer may be correct in a single-choice question."],
      ]
    );
    assert.equal((await editable(question.id)).answers[1].textEn, "<p>that</p>");
  });

  test("a styled save is stored without style and script", async () => {
    const question = await newQuestion();
    const input = await editable(question.id);
    input.textDe = '<p style="color: red" onclick="alert(1)">Was ist <b>richtig</b>?</p><script>alert(1)</script><img src="x" onerror="alert(1)">';
    const saved = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input });
    assert.equal(saved.status, 422, "an image from outside the module is refused");
    input.textDe = '<p style="color: red" onclick="alert(1)">Was ist <b>richtig</b>?</p><script>alert(1)</script>';
    const stored = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input });
    assert.equal(stored.status, 200, JSON.stringify(stored.json));
    assert.equal(stored.json.question.textDe, "<p>Was ist <b>richtig</b>?</p>");
  });

  test("a written test's snapshot is unchanged after an edit; the second of two concurrent saves is refused", async () => {
    const question = await newQuestion();
    const written = await testOf("Editor: written", [question.id], { written: true });
    const snapshot = (await fetchAs(teacher, `/exam/api/tests/${written.id}`)).json.questions;
    const first = await editable(question.id);
    const second = await editable(question.id);
    first.textDe = "<p>Neu formuliert</p>";
    first.answers[0].correct = false;
    first.answers[1].correct = true;
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: first })).status, 200);
    assert.deepEqual((await fetchAs(teacher, `/exam/api/tests/${written.id}`)).json.questions, snapshot, "the written test keeps its snapshot");
    second.nameDe = "Zweiter Stand";
    const late = await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: second });
    assert.equal(late.status, 409);
    assert.match(late.json.error, /changed in the meantime/);
    const kept = await editable(question.id);
    assert.deepEqual([kept.nameDe, kept.textDe], ["Editor-Frage", "<p>Neu formuliert</p>"], "the first save is kept");
  });

  test("the editor opens from the preview, saves a fix, and returns to the browser with the category chosen", async () => {
    const question = await newQuestion({ nameDe: "Tippfehler-Frage", nameEn: "Typo question" });
    await teacher.page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`.sl-exam-pool-questions tr[data-question="${question.id}"]`, { timeout: 20000 });
    assert.equal(await teacher.page.$eval(".sl-exam-pool-category.is-chosen", (el) => el.dataset.category), String(categoryId), "the category is chosen");
    assert.equal(await teacher.page.$eval(".sl-exam-pool-new", (el) => el.hidden), false, "New question is offered");
    await teacher.page.click(`.sl-exam-pool-questions tr[data-question="${question.id}"] button`);
    await teacher.page.waitForSelector(".sl-exam-pool-edit", { timeout: 10000 });
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-pool-edit")]);
    await teacher.page.waitForSelector(".sl-exam-editor sl-rich-text .sl-rich-text-area", { timeout: 20000 });
    const shown = await teacher.page.evaluate(() => ({
      heading: document.querySelector("#markdown-content h1")?.textContent,
      current: document.querySelector(".sl-exam-bar-page[aria-current]")?.dataset.page,
      titles: [document.querySelector("input[name=nameDe]").value, document.querySelector("input[name=nameEn]").value],
      texts: [...document.querySelectorAll(".sl-exam-editor-row:not(.sl-exam-editor-answer) sl-rich-text")].map((el) => el.value),
      answers: [...document.querySelectorAll(".sl-exam-editor-answer")].map((row) => [
        row.querySelector("input").checked,
        ...[...row.querySelectorAll("sl-rich-text")].map((el) => el.value),
      ]),
      toolbar: [...document.querySelector("sl-rich-text .sl-rich-text-toolbar").querySelectorAll("button")].map((b) => b.dataset.action),
      answerTools: [...document.querySelectorAll('.sl-exam-editor-answer[data-answer="1"] .sl-exam-editor-label button')].map((b) => b.title),
    }));
    assert.deepEqual(shown, {
      heading: "Edit: Tippfehler-Frage",
      current: "pool",
      titles: ["Tippfehler-Frage", "Typo question"],
      texts: ["<p>Was ist richtig?</p>", "<p>What is right?</p>"],
      answers: [
        [true, "<p>das</p>", "<p>this</p>"],
        [false, "<p>jenes</p>", "<p>that</p>"],
      ],
      toolbar: ["bold", "italic", "code", "codeblock", "ul", "ol", "image"],
      answerTools: ["Remove"],
    });

    // The second answer becomes the correct one, and a third is added.
    await teacher.page.click('.sl-exam-editor-answer[data-answer="2"] input[type=radio]');
    await teacher.page.click(".sl-exam-editor-add");
    await teacher.page.type('.sl-exam-editor-answer[data-answer="3"] .sl-exam-editor-de .sl-rich-text-area', "beides");
    await teacher.page.click(".sl-exam-editor-actions button[type=submit]");
    await teacher.page.waitForSelector(".sl-exam-editor-problems li", { timeout: 10000 });
    const refused = await teacher.page.evaluate(() => ({
      problems: [...document.querySelectorAll(".sl-exam-editor-problems li")].map((li) => li.textContent),
      marked: [...document.querySelectorAll(".is-refused")].map((el) => el.closest("[data-answer]")?.dataset.answer + (el.closest(".sl-exam-editor-en") ? "/en" : "/de")),
    }));
    assert.deepEqual(refused, { problems: ["Answer 3 has no English text."], marked: ["3/en"] }, "the problem is shown at its field");
    await teacher.page.type('.sl-exam-editor-answer[data-answer="3"] .sl-exam-editor-en .sl-rich-text-area', "both");
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-editor-actions button[type=submit]")]);
    assert.equal(new URL(teacher.page.url()).search, `?category=${categoryId}`, "back in the browser with the category chosen");
    const saved = await editable(question.id);
    assert.deepEqual(saved.answers.map((a) => [a.textDe, a.textEn, a.correct]), [
      ["<p>das</p>", "<p>this</p>", false],
      ["<p>jenes</p>", "<p>that</p>", true],
      ["beides", "both", false],
    ]);
  });

  test("a new question from the browser: the rich-text field formats, filters a paste and uploads images by paste and button", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-new:not([hidden])", { timeout: 20000 });
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-pool-new")]);
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/pool/questions/new");
    await teacher.page.waitForSelector(".sl-exam-editor sl-rich-text .sl-rich-text-area", { timeout: 20000 });
    assert.equal(await teacher.page.$eval("select[name=categoryId]", (el) => el.value), String(categoryId), "the browser's category is chosen");

    const de = '.sl-exam-editor-row:not(.sl-exam-editor-answer) .sl-exam-editor-de';
    const en = '.sl-exam-editor-row:not(.sl-exam-editor-answer) .sl-exam-editor-en';
    await teacher.page.type("input[name=nameDe]", "Formatiert");
    await teacher.page.type("input[name=nameEn]", "Formatted");
    // Bold and inline code on a selection; a code block on a line of its own.
    await teacher.page.click(`${de} .sl-rich-text-area`);
    await teacher.page.keyboard.type("fett");
    await teacher.page.evaluate((selector) => {
      const area = document.querySelector(`${selector} .sl-rich-text-area`);
      const range = document.createRange();
      range.selectNodeContents(area);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }, de);
    await teacher.page.click(`${de} button[data-action=bold]`);
    await teacher.page.keyboard.press("End");
    await teacher.page.click(`${de} button[data-action=bold]`);
    await teacher.page.keyboard.type(" und ");
    await teacher.page.keyboard.type("x = 1");
    await teacher.page.keyboard.down("Shift");
    for (let i = 0; i < 5; i += 1) await teacher.page.keyboard.press("ArrowLeft");
    await teacher.page.keyboard.up("Shift");
    await teacher.page.click(`${de} button[data-action=code]`);
    const german = await teacher.page.$eval(`${de} sl-rich-text`, (el) => el.value);
    // Chrome keeps the space after the bold word as `&nbsp;`.
    assert.match(german, /^<b>fett<\/b>(?:&nbsp;| )und <code>x = 1<\/code>$/);

    // A paste from a web page keeps words and basic formatting only; a
    // pasted image file goes through the upload.
    await teacher.page.click(`${en} .sl-rich-text-area`);
    await teacher.page.evaluate((selector, pixel) => {
      const area = document.querySelector(`${selector} .sl-rich-text-area`);
      const paste = (fill) => {
        const data = new DataTransfer();
        fill(data);
        area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      };
      paste((data) => data.setData("text/html", '<p style="color:red" class="x" onclick="alert(1)">Pasted <span style="font-weight:bold"><strong>bold</strong></span><script>alert(1)</script></p>'));
      const bytes = Uint8Array.from(atob(pixel), (c) => c.charCodeAt(0));
      paste((data) => data.items.add(new File([bytes], "clip.png", { type: "image/png" })));
    }, en, pixel);
    await teacher.page.waitForFunction((selector) => document.querySelector(`${selector} .sl-rich-text-area img`), { timeout: 10000 }, en);
    const english = await teacher.page.$eval(`${en} sl-rich-text`, (el) => el.value);
    assert.match(english, /^<p>Pasted <strong>bold<\/strong><img src="\/exam\/api\/pool\/uploads\/[0-9a-f]{32}" alt=""><\/p>$/);

    // The image button uploads a chosen file; a PDF is refused under the field.
    const dir = mkdtempSync(path.join(os.tmpdir(), "safelearn-editor-upload-"));
    try {
      writeFileSync(path.join(dir, "button.png"), Buffer.from(otherPixel, "base64"));
      writeFileSync(path.join(dir, "fake.png"), "%PDF-1.7\n");
      const input = await teacher.page.$(`${de} input[type=file]`);
      await teacher.page.click(`${de} .sl-rich-text-area`);
      await input.uploadFile(path.join(dir, "fake.png"));
      await teacher.page.waitForFunction((selector) => /not an image/.test(document.querySelector(`${selector} .sl-rich-text-status`).textContent), { timeout: 10000 }, de);
      await input.uploadFile(path.join(dir, "button.png"));
      await teacher.page.waitForFunction((selector) => document.querySelector(`${selector} .sl-rich-text-area img`), { timeout: 10000 }, de);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const answers = await teacher.page.$$(".sl-exam-editor-answer");
    for (const [index, row] of answers.entries()) {
      await (await row.$(".sl-exam-editor-de .sl-rich-text-area")).type(`Antwort ${index + 1}`);
      await (await row.$(".sl-exam-editor-en .sl-rich-text-area")).type(`Answer ${index + 1}`);
    }
    await (await answers[0].$("input[type=radio]")).click();
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-editor-actions button[type=submit]")]);
    const created = (await fetchAs(teacher, `/exam/api/pool/questions?category=${categoryId}&q=Formatiert`)).json;
    assert.equal(created.length, 1);
    const stored = await editable(created[0].id);
    assert.match(stored.textDe, /^<b>fett<\/b>(?:&nbsp;| )und <code>x = 1<\/code><img src="\/exam\/api\/images\/\d+" alt="">$/);
    assert.match(stored.textEn, /^<p>Pasted <strong>bold<\/strong><img src="\/exam\/api\/images\/\d+" alt=""><\/p>$/);
    assert.notEqual(/images\/(\d+)/.exec(stored.textDe)[1], /images\/(\d+)/.exec(stored.textEn)[1], "two different pictures, two images");
    assert.deepEqual(stored.answers.map((a) => [a.textDe, a.textEn, a.correct]), [["Antwort 1", "Answer 1", true], ["Antwort 2", "Answer 2", false]]);
  });

  test("uploads: 20 MB and a renamed PDF refused, an unsaved one gone after the purge", async () => {
    const huge = await uploadAs(teacher, { size: 20 * 1024 * 1024 });
    assert.equal(huge.status, 413);
    assert.match(huge.json.error, /2 MB/);
    const pdf = await uploadAs(teacher, { base64: Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n").toString("base64"), name: "picture.png" });
    assert.equal(pdf.status, 400);
    assert.match(pdf.json.error, /not an image/);
    const staged = await uploadAs(teacher, { base64: pixel });
    assert.equal(staged.status, 200, JSON.stringify(staged.json));
    assert.deepEqual(await imageAs(teacher, staged.json.src), { status: 200, bytes: Buffer.from(pixel, "base64").length });
    // A day passes without a save; the server purges at start and daily with
    // this same function.
    database((db) => {
      db.prepare("UPDATE image_upload SET uploaded_at = ?").run(new Date(Date.now() - 25 * 3600 * 1000).toISOString());
      purgeUploads(db);
    });
    assert.equal((await imageAs(teacher, staged.json.src)).status, 404, "the unsaved upload is gone");
  });

  test("a new question with an uploaded image is shown in the browser and in a test assembled from it", async () => {
    const { src } = (await uploadAs(teacher, { base64: otherPixel })).json;
    const question = await newQuestion({ nameDe: "Bildfrage", nameEn: "Picture question", textDe: `<p>Siehe <img src="${src}" alt=""></p>`, textEn: `<p>See <img src="${src}" alt=""></p>` });
    const [, imageId] = /\/exam\/api\/images\/(\d+)/.exec(question.textDe);
    assert.equal(question.textEn, `<p>See <img src="/exam/api/images/${imageId}" alt=""></p>`, "one image for both languages");
    assert.equal((await imageAs(teacher, src)).status, 404, "the upload became the question's image");

    await teacher.page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`.sl-exam-pool-questions tr[data-question="${question.id}"]`, { timeout: 20000 });
    await teacher.page.click(`.sl-exam-pool-questions tr[data-question="${question.id}"] button`);
    await teacher.page.waitForSelector(".sl-exam-pool-text img", { timeout: 10000 });
    await teacher.page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-pool-text img")].every((img) => img.complete && img.naturalWidth === 1), { timeout: 10000 });

    const test = await testOf("Editor: picture", [question.id]);
    await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-test-questions img", { timeout: 20000 });
    await teacher.page.waitForFunction(() => [...document.querySelectorAll(".sl-exam-test-questions img")].every((img) => img.complete && img.naturalWidth === 1), { timeout: 10000 });
    await fetchAs(teacher, `/exam/api/tests/${test.id}`, { method: "DELETE" });
  });

  test("retire, revive and delete: a used question stays and is only retired, a fresh one goes with its images", async () => {
    const used = await newQuestion({ nameDe: "Benutzt", nameEn: "Used" });
    const test = await testOf("Editor: usage", [used.id]);
    const refused = await fetchAs(teacher, `/exam/api/pool/questions/${used.id}`, { method: "DELETE" });
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, /Retire it instead/);
    const snapshot = (await fetchAs(teacher, `/exam/api/tests/${test.id}`)).json.questions;
    const retired = await fetchAs(teacher, `/exam/api/pool/questions/${used.id}/retire`, { method: "POST" });
    assert.equal(retired.json.retired, true);
    assert.deepEqual(retired.json.usage.map((u) => u.testId), [test.id], "the usage stays");
    assert.deepEqual((await fetchAs(teacher, `/exam/api/tests/${test.id}`)).json.questions, snapshot, "the test stays");
    assert.ok(!(await fetchAs(teacher, `/exam/api/pool/questions?category=${categoryId}`)).json.some((q) => q.id === used.id), "hidden in the browser");
    assert.ok((await fetchAs(teacher, `/exam/api/pool/questions?category=${categoryId}&retired=1`)).json.some((q) => q.id === used.id && q.retired), "listed when asked for");
    const assembled = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Editor: retired", questionIds: [used.id] } });
    assert.equal(assembled.status, 400);
    assert.match(assembled.json.error, /retired/);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${used.id}/revive`, { method: "POST" })).json.retired, false);
    const again = await testOf("Editor: revived", [used.id]);
    await fetchAs(teacher, `/exam/api/tests/${again.id}`, { method: "DELETE" });
    await fetchAs(teacher, `/exam/api/tests/${test.id}`, { method: "DELETE" });

    const { src } = (await uploadAs(teacher, { base64: pixel })).json;
    const fresh = await newQuestion({ nameDe: "Frisch", nameEn: "Fresh", textDe: `<p><img src="${src}"></p>` });
    const [, imageId] = /\/exam\/api\/images\/(\d+)/.exec(fresh.textDe);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${fresh.id}`, { method: "DELETE" })).status, 200);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${fresh.id}`)).status, 404);
    assert.equal((await imageAs(teacher, `/exam/api/images/${imageId}`)).status, 404, "its image is gone");
    assert.equal(database((db) => db.prepare("SELECT COUNT(*) AS n FROM answer WHERE question_id = ?").get(fresh.id).n), 0, "and its answers");
  });

  test("categories: a non-empty one is not deleted, none moves into its own subtree, a moved question keeps its usage", async () => {
    const parent = (await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: categoryId, nameDe: "HTTP und REST", nameEn: "HTTP and REST" } })).json;
    const child = (await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: parent.id, nameDe: "Caching", nameEn: "Caching" } })).json;
    const duplicate = await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: parent.id, nameDe: "Caching", nameEn: "Other" } });
    assert.equal(duplicate.status, 409);
    const tree = async () => JSON.stringify((await fetchAs(teacher, "/exam/api/pool/categories")).json);
    const before = await tree();
    const cycle = await fetchAs(teacher, `/exam/api/pool/categories/${parent.id}`, { method: "PUT", body: { parentId: child.id } });
    assert.equal(cycle.status, 400);
    assert.equal(await tree(), before, "the tree is unchanged");

    const question = await newQuestion({ nameDe: "Wandert", nameEn: "Moves", categoryId: child.id });
    const test = await testOf("Editor: moving", [question.id]);
    const full = await fetchAs(teacher, `/exam/api/pool/categories/${child.id}`, { method: "DELETE" });
    assert.equal(full.status, 409);
    assert.match(full.json.error, /1 question/);
    const input = { ...(await editable(question.id)), categoryId: parent.id };
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`, { method: "PUT", body: input })).status, 200);
    const listed = (await fetchAs(teacher, `/exam/api/pool/questions?category=${parent.id}`)).json.find((q) => q.id === question.id);
    assert.deepEqual([listed.category.de.at(-1), listed.uses], ["HTTP und REST", 1]);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/categories/${child.id}`, { method: "DELETE" })).status, 200, "empty now, it goes");

    await fetchAs(teacher, `/exam/api/tests/${test.id}`, { method: "DELETE" });
  });

  // ------------------------------------------- the category tree in the pool

  /** The pool's tree as `[nameDe, [children…]]` for the categories named `names` and below. */
  async function treeOf(names) {
    const shape = (nodes) => nodes.map((node) => [node.nameDe, shape(node.children)]);
    const all = (await fetchAs(teacher, "/exam/api/pool/categories")).json;
    return shape(all.filter((node) => names.includes(node.nameDe)));
  }

  /** Three fresh top-level categories for one check, in this order. */
  async function threeCategories(prefix) {
    const made = [];
    for (const name of ["A", "B", "C"]) {
      const created = await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: null, nameDe: `${prefix} ${name}`, nameEn: `${prefix} ${name} (en)` } });
      assert.equal(created.status, 200, JSON.stringify(created.json));
      made.push(created.json);
    }
    return made;
  }

  const rowOf = (id) => `.sl-exam-pool-tree li[data-category="${id}"] > .sl-exam-tree-row`;
  const nameOf = (id) => `${rowOf(id)} .sl-exam-pool-category`;

  /** Where on `selector` to point: `share` of its height down, a little in from its left. */
  const pointAt = (selector, share = 0.5) =>
    teacher.page.$eval(
      selector,
      (element, share) => {
        element.scrollIntoView({ block: "center" });
        const box = element.getBoundingClientRect();
        return { x: box.left + Math.min(box.width / 2, 60), y: box.top + box.height * share };
      },
      share
    );

  /** Drags `from` onto `to` (`share` of its height down) with the mouse, or with a finger after a long press. */
  async function drag(from, to, share = 0.5, { touch = false } = {}) {
    const page = teacher.page;
    const start = await pointAt(from);
    let finger = null;
    let pressed = false;
    const moveTo = (x, y) => (touch ? finger.move(x, y) : page.mouse.move(x, y));
    try {
      if (touch) {
        finger = await page.touchscreen.touchStart(start.x, start.y);
        await new Promise((resolve) => setTimeout(resolve, 450));
      } else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        pressed = true;
        await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 });
      }
      await page.waitForSelector(".sl-exam-drag-ghost", { timeout: 5000 });
      const end = await pointAt(to, share);
      for (let step = 1; step <= 6; step++) await moveTo(start.x + ((end.x - start.x) * step) / 6, start.y + ((end.y - start.y) * step) / 6);
      await moveTo(end.x, end.y);
    } finally {
      // Released also when the drag failed, so no button stays pressed for the next check.
      if (touch) await finger?.end();
      else if (pressed) await page.mouse.up();
    }
  }

  async function openPoolTree() {
    await teacher.page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-pool-tree li[role=treeitem]", { timeout: 20000 });
  }

  /** Waits until the pool's tree, drawn anew, shows `selector`. */
  const shown = (selector) => teacher.page.waitForSelector(selector, { timeout: 10000 });

  /** Opens the menu of category `id` by its ⋯ button. */
  async function openMenu(id) {
    // Right after the page is drawn the row may still be drawn anew; a click that found no box is tried again.
    for (let tries = 1; ; tries += 1) {
      try {
        await teacher.page.click(`${rowOf(id)} .sl-exam-tree-menu-button`);
        break;
      } catch (error) {
        if (tries === 3 || !/not clickable/.test(error.message)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    await teacher.page.waitForSelector(".sl-exam-tree-menu:not([hidden])", { timeout: 5000 });
  }

  /** `entry` in the open menu. */
  const inMenu = (entry) => `.sl-exam-tree-menu:not([hidden]) ${entry}`;

  test("tree: a category dragged onto another becomes its last subcategory, and between two stands there - by mouse and by touch", async () => {
    const [a, b, c] = await threeCategories("Ziehen");
    const names = [a.nameDe, b.nameDe, c.nameDe];
    await openPoolTree();
    await drag(nameOf(c.id), rowOf(a.id));
    await shown(`.sl-exam-pool-tree li[data-category="${a.id}"] li[data-category="${c.id}"]`);
    assert.deepEqual(await treeOf(names), [[a.nameDe, [[c.nameDe, []]]], [b.nameDe, []]], "onto A: C is A's subcategory");

    await drag(nameOf(c.id), rowOf(b.id), 0.1);
    await shown(`.sl-exam-pool-tree > ul > li[data-category="${c.id}"]`);
    assert.deepEqual(await treeOf(names), [[a.nameDe, []], [c.nameDe, []], [b.nameDe, []]], "onto B's upper edge: C stands between A and B");

    await drag(nameOf(a.id), rowOf(b.id), 0.5, { touch: true });
    await shown(`.sl-exam-pool-tree li[data-category="${b.id}"] li[data-category="${a.id}"]`);
    assert.deepEqual(await treeOf(names), [[c.nameDe, []], [b.nameDe, [[a.nameDe, []]]]], "a long press and a drag with a finger");
  });

  test("tree: a question dragged from the list onto a category moves there, and the list is drawn anew", async () => {
    const [target] = await threeCategories("Frage-Ziel");
    const question = await newQuestion({ nameDe: "Gezogen", nameEn: "Dragged" });
    // Opened on its category, so the list is not drawn anew under the drag.
    await teacher.page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    const row = `.sl-exam-pool-questions tr[data-question="${question.id}"]`;
    await teacher.page.waitForSelector(row, { timeout: 20000 });
    await drag(`${row} .sl-exam-pool-name`, rowOf(target.id));
    await teacher.page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, row);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`)).json.categoryId, target.id);
  });

  test("tree: a drag held at the lower edge scrolls on, in the pool's column and on a narrow screen", async () => {
    const made = [];
    for (let index = 0; index < 40; index++) {
      made.push((await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: null, nameDe: `Rollen ${String(index).padStart(2, "0")}`, nameEn: `Scroll ${index}` } })).json);
    }
    const page = teacher.page;
    const before = page.viewport();
    /** How far the tree and the page have scrolled together. */
    const scrolled = () => page.evaluate(() => document.querySelector(".sl-exam-pool-tree").scrollTop + (document.scrollingElement?.scrollTop ?? 0));
    try {
      for (const viewport of [{ width: 1280, height: 700 }, { width: 900, height: 700 }]) {
        await page.setViewport(viewport);
        await openPoolTree();
        await page.evaluate(() => window.scrollTo(0, 0));
        // The tree's first category, in view at the top; the drag is cancelled, so it stays where it is.
        const start = await page.$eval('.sl-exam-pool-tree li[data-category]:not([data-category=""]) > .sl-exam-tree-row .sl-exam-pool-category', (element) => {
          const box = element.getBoundingClientRect();
          return { x: box.left + 10, y: box.top + box.height / 2 };
        });
        const at = await scrolled();
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        try {
          await page.mouse.move(start.x + 10, start.y + 10, { steps: 3 });
          await page.waitForSelector(".sl-exam-drag-ghost", { timeout: 5000 });
          // Held at the window's lower edge, below the tree's column.
          await page.mouse.move(start.x, viewport.height - 4, { steps: 6 });
          await new Promise((resolve) => setTimeout(resolve, 1000));
          assert.ok((await scrolled()) > at + 50, `${viewport.width}px: held at the edge, the tree scrolls on (${at} → ${await scrolled()})`);
          await page.keyboard.press("Escape");
        } finally {
          await page.mouse.up();
        }
      }
    } finally {
      await page.setViewport(before ?? { width: 1280, height: 800 });
      for (const category of made) await fetchAs(teacher, `/exam/api/pool/categories/${category.id}`, { method: "DELETE" });
    }
  });

  test("tree: a refused drop leaves the order as it was and says why at the dragged category", async () => {
    const [a, b] = await threeCategories("Verweigert");
    const child = (await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: a.id, nameDe: "Verweigert Kind", nameEn: "Refused child" } })).json;
    const names = [a.nameDe, b.nameDe];
    const before = await treeOf(names);
    await openPoolTree();
    await drag(nameOf(a.id), rowOf(child.id));
    await shown(`.sl-exam-pool-tree li[data-category="${a.id}"] > .sl-exam-tree-message`);
    assert.match(await teacher.page.$eval(`.sl-exam-pool-tree li[data-category="${a.id}"] > .sl-exam-tree-message`, (el) => el.textContent), /under itself/);
    assert.deepEqual(await treeOf(names), before);
  });

  test("tree: cut and paste and Alt+↑ by keyboard", async () => {
    const [a, b, c] = await threeCategories("Tasten");
    const question = await newQuestion({ nameDe: "Ausgeschnitten", nameEn: "Cut" });
    const names = [a.nameDe, b.nameDe, c.nameDe];
    const page = teacher.page;
    await openPoolTree();
    const focus = (id) => page.$eval(`.sl-exam-pool-tree li[data-category="${id}"]`, (li) => li.focus());
    await focus(c.id);
    await page.keyboard.down("Control");
    await page.keyboard.press("x");
    await page.keyboard.up("Control");
    await focus(a.id);
    await page.keyboard.down("Control");
    await page.keyboard.press("v");
    await page.keyboard.up("Control");
    await shown(`.sl-exam-pool-tree li[data-category="${a.id}"] li[data-category="${c.id}"]`);
    assert.deepEqual(await treeOf(names), [[a.nameDe, [[c.nameDe, []]]], [b.nameDe, []]], "C is A's last subcategory");

    await focus(b.id);
    await page.keyboard.down("Alt");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Alt");
    await page.waitForFunction(
      (ids) => {
        const order = [...document.querySelectorAll(".sl-exam-pool-tree > ul > li")].map((li) => li.dataset.category);
        return order.indexOf(ids.b) < order.indexOf(ids.a);
      },
      { timeout: 10000 },
      { a: String(a.id), b: String(b.id) }
    );
    assert.deepEqual(await treeOf(names), [[b.nameDe, []], [a.nameDe, [[c.nameDe, []]]]], "B moved up before A");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.category), String(b.id), "the focus stays on B");

    // A question: cut in the list, pasted on a category. Opened on its
    // category, so the list is not drawn anew under the focus.
    await page.goto(`${applicationUrl}/exam/pool?category=${categoryId}`, { waitUntil: "domcontentloaded" });
    const row = `.sl-exam-pool-questions tr[data-question="${question.id}"]`;
    await page.waitForSelector(row, { timeout: 20000 });
    await page.focus(`${row} .sl-exam-pool-name`);
    await page.keyboard.down("Control");
    await page.keyboard.press("x");
    await page.keyboard.up("Control");
    await focus(b.id);
    await page.keyboard.down("Control");
    await page.keyboard.press("v");
    await page.keyboard.up("Control");
    await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, row);
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${question.id}`)).json.categoryId, b.id);
    assert.ok(await page.$eval(".sl-exam-tree-keys", (el) => /Ctrl\+X/.test(el.textContent)), "the keys are listed under the tree");
  });

  test("tree: the popup creates a subcategory, renames by a double click, refuses a duplicate in place, and cancels", async () => {
    const [a, b] = await threeCategories("Popup");
    const page = teacher.page;
    await openPoolTree();
    await openMenu(a.id);
    await page.click(inMenu(".sl-exam-tree-add"));
    assert.equal(await page.$(".sl-exam-tree-menu:not([hidden])"), null, "the menu closes with its action");
    await page.waitForSelector(".sl-exam-tree-popup[role=dialog] input[name=nameDe]", { timeout: 5000 });
    await page.type(".sl-exam-tree-popup input[name=nameDe]", "Popup Neu");
    await page.type(".sl-exam-tree-popup input[name=nameEn]", "Popup new");
    await page.keyboard.press("Enter");
    await shown(`.sl-exam-pool-tree li[data-category="${a.id}"] li[role=treeitem]`);
    const created = (await treeOf([a.nameDe]))[0][1];
    assert.deepEqual(created, [["Popup Neu", []]], "the subcategory is A's last");

    await page.click(nameOf(b.id), { count: 2 });
    await page.waitForSelector(".sl-exam-tree-popup input[name=nameDe]", { timeout: 5000 });
    assert.equal(await page.$eval(".sl-exam-tree-popup input[name=nameDe]", (input) => input.value), b.nameDe, "filled with its names");
    await page.$eval(".sl-exam-tree-popup input[name=nameDe]", (input) => {
      input.value = "";
    });
    await page.type(".sl-exam-tree-popup input[name=nameDe]", a.nameDe);
    await page.click(".sl-exam-tree-popup button[type=submit]");
    await page.waitForFunction(() => document.querySelector(".sl-exam-tree-popup .sl-exam-message")?.textContent, { timeout: 10000 });
    assert.match(await page.$eval(".sl-exam-tree-popup .sl-exam-message", (el) => el.textContent), /already/, "a sibling's name is refused in the popup, which stays open");
    await page.$eval(".sl-exam-tree-popup input[name=nameDe]", (input) => {
      input.value = "";
    });
    await page.type(".sl-exam-tree-popup input[name=nameDe]", "Popup B2");
    await page.click(".sl-exam-tree-popup button[type=submit]");
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.startsWith("Popup B2"), { timeout: 10000 }, nameOf(b.id));

    await openMenu(b.id);
    await page.click(inMenu(".sl-exam-tree-rename"));
    await page.waitForSelector(".sl-exam-tree-popup", { timeout: 5000 });
    await page.type(".sl-exam-tree-popup input[name=nameDe]", "nicht gespeichert");
    await page.click(".sl-exam-tree-popup .sl-exam-tree-cancel");
    assert.equal(await page.$(".sl-exam-tree-popup"), null, "Cancel closes it");
    assert.equal((await treeOf(["Popup B2"])).length, 1, "and nothing changed");
  });

  test("tree: only an empty category's menu offers Delete, and deleting takes a second click", async () => {
    const [a, b] = await threeCategories("Leer");
    await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId: a.id, nameDe: "Leer Kind", nameEn: "Empty child" } });
    const page = teacher.page;
    await openPoolTree();
    const entries = () => page.$$eval(".sl-exam-tree-menu:not([hidden]) [role=menuitem]", (items) => items.map((item) => item.className.match(/sl-exam-tree-(new-question|add|rename|delete)/)[1]));
    await openMenu(a.id);
    assert.deepEqual(await entries(), ["new-question", "add", "rename"], "A holds a subcategory: no Delete");
    await page.keyboard.press("Escape");
    await openMenu(categoryId);
    assert.deepEqual(await entries(), ["new-question", "add", "rename"], "a category with questions: no Delete");
    await page.mouse.click(1, 1);
    assert.equal(await page.$(".sl-exam-tree-menu:not([hidden])"), null, "a click outside closes the menu");
    await openMenu(b.id);
    assert.deepEqual(await entries(), ["new-question", "add", "rename", "delete"]);
    const bin = inMenu(".sl-exam-tree-delete");
    await page.click(bin);
    assert.match(await page.$eval(bin, (button) => button.textContent), /^Click again/, "armed, and the menu stays open");
    await page.click(bin);
    await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, rowOf(b.id));
    assert.deepEqual(await treeOf([b.nameDe]), [], "B is gone");
  });

  test("tree: a long name deep in the tree keeps its menu button in the panel, and the menu works by keyboard", async () => {
    let parentId = null;
    let deepest;
    for (let level = 1; level <= 5; level += 1) {
      const nameDe = level < 5 ? `Tief ${level}` : "Netzwerkprotokollzustandsautomatenübergangstabellenverwaltungsrichtlinienentwurf".padEnd(80, "s");
      const created = await fetchAs(teacher, "/exam/api/pool/categories", { method: "POST", body: { parentId, nameDe, nameEn: `Deep ${level}` } });
      assert.equal(created.status, 200, JSON.stringify(created.json));
      parentId = created.json.id;
      deepest = created.json;
    }
    assert.equal(deepest.nameDe.length, 80);
    const page = teacher.page;
    await openPoolTree();
    await page.$eval(".sl-exam-pool-tree", (nav) => {
      nav.style.width = "280px";
      nav.style.maxWidth = "280px";
    });
    const button = `${rowOf(deepest.id)} .sl-exam-tree-menu-button`;
    await page.$eval(button, (element) => element.scrollIntoView({ block: "center" }));
    const placed = await page.$eval(button, (element) => {
      const nav = element.closest(".sl-exam-pool-tree");
      const panel = nav.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return { inside: box.left >= panel.left && box.right <= panel.left + nav.clientWidth && box.width > 0, label: element.getAttribute("aria-label") };
    });
    assert.ok(placed.inside, "the button is fully inside the 280 px panel");
    assert.equal(placed.label, `Actions for ${deepest.nameDe}`);
    await openMenu(deepest.id);
    assert.equal(await page.$eval(button, (element) => element.getAttribute("aria-expanded")), "true");
    await page.keyboard.press("Escape");

    // By keyboard: Enter opens with the first entry focused, ↓ moves, Escape returns to the button, Tab closes.
    await page.$eval(button, (element) => element.focus());
    await page.keyboard.press("Enter");
    await page.waitForSelector(".sl-exam-tree-menu:not([hidden])", { timeout: 5000 });
    const focused = () => page.evaluate(() => document.activeElement?.className ?? "");
    assert.match(await focused(), /sl-exam-tree-new-question/);
    await page.keyboard.press("ArrowDown");
    assert.match(await focused(), /sl-exam-tree-add/);
    await page.keyboard.press("Escape");
    assert.equal(await page.$(".sl-exam-tree-menu:not([hidden])"), null, "Escape closes the menu");
    assert.match(await focused(), /sl-exam-tree-menu-button/, "and the focus is back on the button");
    assert.equal(await page.$eval(button, (element) => element.getAttribute("aria-expanded")), "false");
    await page.keyboard.press("ArrowDown");
    await page.waitForSelector(".sl-exam-tree-menu:not([hidden])", { timeout: 5000 });
    await page.keyboard.press("Tab");
    assert.equal(await page.$(".sl-exam-tree-menu:not([hidden])"), null, "Tab closes it");

    // The Delete key still arms and deletes an empty category, through its menu.
    await page.$eval(`.sl-exam-pool-tree li[data-category="${deepest.id}"]`, (li) => li.focus());
    await page.keyboard.press("Delete");
    assert.match(await page.$eval(inMenu(".sl-exam-tree-delete"), (entry) => entry.textContent), /^Click again/);
    await page.keyboard.press("Delete");
    await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, rowOf(deepest.id));
  });

  test("tree: the former categories page lands on the pool, keeping the course", async () => {
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const klass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.courses > 0);
    const courseId = (await fetchAs(teacher, `/exam/api/classes/${klass.id}`)).json.courses[0].id;
    const answer = await teacher.page.goto(`${applicationUrl}/exam/pool/categories?course=${courseId}`, { waitUntil: "domcontentloaded" });
    assert.equal(answer.request().redirectChain()[0]?.response()?.status(), 301, "a permanent redirect");
    assert.equal(`${new URL(teacher.page.url()).pathname}${new URL(teacher.page.url()).search}`, `/exam/pool?course=${courseId}`);
    await teacher.page.goto(`${applicationUrl}/exam/pool/categories`, { waitUntil: "domcontentloaded" });
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/pool");
    await teacher.page.waitForSelector(".sl-exam-pool-tree", { timeout: 20000 });
  });

  test("an unwritten test takes up an edit only on request, with the same questions in the same order", async () => {
    const question = await newQuestion({ nameDe: "Nachziehen", nameEn: "Take up" });
    const other = await newQuestion({ nameDe: "Daneben", nameEn: "Beside" });
    const unwritten = await testOf("Editor: next week", [other.id, question.id]);
    const written = await testOf("Editor: last week", [question.id], { written: true });

    await teacher.page.goto(`${applicationUrl}/exam/pool/questions/${question.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-editor sl-rich-text .sl-rich-text-area", { timeout: 20000 });
    await teacher.page.click(".sl-exam-editor-en .sl-rich-text-area");
    await teacher.page.evaluate(() => {
      document.querySelectorAll(".sl-exam-editor-row:not(.sl-exam-editor-answer) sl-rich-text")[1].value = "<p>What is correct?</p>";
    });
    await teacher.page.click(".sl-exam-editor-actions button[type=submit]");
    await teacher.page.waitForSelector(".sl-exam-editor-tests li", { timeout: 10000 });
    const offered = await teacher.page.$$eval(".sl-exam-editor-tests button", (buttons) => buttons.map((b) => Number(b.dataset.test)));
    assert.deepEqual(offered, [unwritten.id], "only the unwritten test is offered");
    const texts = async (id) => (await fetchAs(teacher, `/exam/api/tests/${id}`)).json.questions.map((q) => [q.questionId, q.textEn]);
    assert.deepEqual(await texts(unwritten.id), [[other.id, "<p>What is right?</p>"], [question.id, "<p>What is right?</p>"]], "not asked: the old text");

    await teacher.page.click(`.sl-exam-editor-tests button[data-test="${unwritten.id}"]`);
    await teacher.page.waitForFunction(() => /Updated/.test(document.querySelector(".sl-exam-editor-tests [role=status]").textContent), { timeout: 10000 });
    assert.deepEqual(await texts(unwritten.id), [[other.id, "<p>What is right?</p>"], [question.id, "<p>What is correct?</p>"]], "taken up, same order");
    assert.deepEqual(await texts(written.id), [[question.id, "<p>What is right?</p>"]], "the written test keeps its text");

    const late = await fetchAs(teacher, `/exam/api/tests/${written.id}`, { method: "PUT", body: { questionIds: [question.id] } });
    assert.equal(late.status, 409, "a test written in the meantime is refused");
    await fetchAs(teacher, `/exam/api/tests/${unwritten.id}`, { method: "DELETE" });
  });
});

describe("the question import", () => {
  let student;
  let teacher;
  let course;
  let scratch;

  /** A connection to the run's database beside the instance, for what only the server knows. */
  function database(fn) {
    const { db } = openDatabase(run.databasePath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  /** A file of `questions` in the category Import-Checks / `sub`, in the format safelearn-questions/1. */
  function questionFile(sub, questions) {
    const block = ({ title, marks = ["x", "x", "-", "-"], hintDe = null, titleEn = `${title} (en)` }) => {
      const correct = marks.filter((mark) => mark === "x").length;
      const answers = (language) => marks.map((mark, index) => `- [${mark === "x" ? "x" : " "}] \`${language}-${index + 1}\``).join("\n");
      return `## ${title}
en: ${titleEn}
type: multichoiceset

### de

Welche Antworten zu ${title} sind richtig? ${hintDe ?? `(${correct} richtige Antworten)`}

${answers("de")}

### en

Which answers about ${title} are right? (${correct} correct answers)

${answers("en")}
`;
    };
    return `---\nformat: safelearn-questions/1\n---\n\n# Import-Checks / ${sub}\nen: Import checks / ${sub}\n\n${questions.map(block).join("\n")}`;
  }

  /** A file's text sent to the import API from inside the page, as the import page sends it. */
  async function sendAs(session, reference, text, name = "questions.md") {
    return session.page.evaluate(
      async (address, text) => {
        const response = await fetch(address, {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json", "Content-Type": "text/markdown; charset=utf-8" },
          body: text,
        });
        let json = null;
        try {
          json = await response.json();
        } catch {
          // Not JSON.
        }
        return { status: response.status, json };
      },
      `${applicationUrl}${reference}?name=${encodeURIComponent(name)}`,
      text
    );
  }

  /** The import page with `text` chosen as the file `name`; resolves once the check answered. */
  async function uploadInPage(text, name) {
    const file = path.join(scratch, name);
    writeFileSync(file, text);
    await teacher.page.goto(`${applicationUrl}/exam/pool/import`, { waitUntil: "domcontentloaded" });
    const input = await teacher.page.waitForSelector(".sl-exam-import input[type=file]", { timeout: 20000 });
    await input.uploadFile(file);
    await teacher.page.waitForSelector(".sl-exam-import-problem-list, .sl-exam-import-go", { timeout: 20000 });
  }

  const imports = async () => (await fetchAs(teacher, "/exam/api/pool/imports")).json;
  const questionCount = () => database((db) => db.prepare("SELECT COUNT(*) AS n FROM question").get().n);

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    scratch = mkdtempSync(path.join(os.tmpdir(), "safelearn-import-"));
  });

  after(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  test("no student, and no teacher in student view, reaches the import page, the format description or the import's API", async () => {
    const content = questionFile("Verboten", [{ title: "Verboten" }]);
    const before = questionCount();
    const someQuestion = database((db) => db.prepare("SELECT id FROM question LIMIT 1").get().id);
    const probe = async (session) => {
      const nothing = await fetchAs(session, absent);
      for (const page of ["/exam/pool/import", "/exam/pool/import/format"]) {
        assert.deepEqual(await fetchAs(session, page), nothing, `${page} is not there`);
      }
      assert.equal((await sendAs(session, "/exam/api/pool/imports/check", content)).status, 403, "the check is refused");
      assert.equal((await sendAs(session, "/exam/api/pool/imports", content)).status, 403, "the import is refused");
      for (const [method, reference] of [
        ["GET", "/exam/api/pool/imports"],
        ["DELETE", "/exam/api/pool/imports/1"],
        ["POST", `/exam/api/pool/questions/${someQuestion}/reviewed`],
      ]) {
        assert.equal((await fetchAs(session, reference, { method })).status, 403, `${method} ${reference} is refused`);
      }
    };
    await probe(student);
    await setPreferences(teacher, { vt: 0 });
    try {
      await probe(teacher);
    } finally {
      await setPreferences(teacher, {});
    }
    assert.equal(questionCount(), before, "the pool is unchanged");
  });

  test("a broken file lists its problems with lines and question, ready to copy, and stores nothing", async () => {
    const before = { questions: questionCount(), imports: (await imports()).length };
    const content = questionFile("Kaputt", [{ title: "Falscher Hinweis", hintDe: "(3 richtige Antworten)" }, { title: "Ohne Englisch", titleEn: "" }]);
    await uploadInPage(content, "broken.md");
    const shown = await teacher.page.evaluate(() => ({
      problems: [...document.querySelectorAll(".sl-exam-import-problem-list li")].map((li) => li.textContent),
      importButton: document.querySelector(".sl-exam-import-go") !== null,
      copy: [...document.querySelectorAll(".sl-exam-import-problems button")].map((b) => b.textContent),
    }));
    const line = (needle) => content.slice(0, content.indexOf(needle)).split("\n").length;
    assert.deepEqual(shown, {
      problems: [
        `Line ${line("### de")} (Falscher Hinweis): The German hint says 3, but 2 answers are marked correct.`,
        `Line ${line("en: \n")} (Ohne Englisch): The English title is missing.`,
      ],
      importButton: false,
      copy: ["Copy problems"],
    });
    assert.equal(questionCount(), before.questions, "nothing is stored");
    assert.equal((await imports()).length, before.imports);
  });

  test("a clean file is previewed, imported, and the browser opens with only the unreviewed questions, highlighted", async () => {
    const content = questionFile("Statuscodes", [{ title: "Import eins" }, { title: "Import zwei" }, { title: "Import drei" }]);
    await uploadInPage(content, "statuscodes.md");
    const preview = await teacher.page.evaluate(() => ({
      button: document.querySelector(".sl-exam-import-go").textContent,
      rows: [...document.querySelectorAll(".sl-exam-import-preview tbody tr")].map((tr) => tr.textContent),
      created: [...document.querySelectorAll(".sl-exam-import-preview h3 + ul li")].map((li) => li.textContent),
    }));
    assert.equal(preview.button, "Import 3 questions");
    assert.deepEqual(preview.rows, ["Import-Checks / Statuscodes / Import checks / Statuscodesnew3003"]);
    assert.deepEqual(preview.created, ["Import-Checks at the top", "Statuscodes under Import-Checks (new as well)"]);
    assert.equal((await imports()).length, 0, "the preview stores nothing");

    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click(".sl-exam-import-go")]);
    assert.equal(new URL(teacher.page.url()).search, "?unreviewed=1");
    await teacher.page.waitForSelector(".sl-exam-pool-questions tr.is-unreviewed", { timeout: 20000 });
    const browser = await teacher.page.evaluate(() => ({
      filter: document.querySelector(".sl-exam-pool-unreviewed-filter input").checked,
      rows: [...document.querySelectorAll(".sl-exam-pool-questions tbody tr")].map((tr) => [
        tr.querySelector("button").textContent,
        tr.classList.contains("is-unreviewed"),
        tr.querySelector(".sl-exam-pool-badge")?.textContent ?? null,
      ]),
      stripe: getComputedStyle(document.querySelector(".sl-exam-pool-questions tr.is-unreviewed > td")).boxShadow,
    }));
    assert.equal(browser.filter, true, "the filter is on");
    assert.deepEqual(browser.rows, [
      ["Import eins", true, "not reviewed"],
      ["Import zwei", true, "not reviewed"],
      ["Import drei", true, "not reviewed"],
    ]);
    assert.match(browser.stripe, /inset/, "the row carries the stripe");
    const [record] = await imports();
    assert.deepEqual({ fileName: record.fileName, questions: record.questions, unreviewed: record.unreviewed, inUse: record.inUse }, { fileName: "statuscodes.md", questions: 3, unreviewed: 3, inUse: false });
  });

  test("Mark as reviewed moves on to the next one, an editor save clears the mark too, and a chosen row shows both", async () => {
    const listed = (await fetchAs(teacher, "/exam/api/pool/questions?unreviewed=1")).json.filter((q) => q.nameDe.startsWith("Import "));
    const [first, second, third] = listed;
    await teacher.page.goto(`${applicationUrl}/exam/pool?unreviewed=1&course=${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`.sl-exam-pool-questions tr[data-question="${first.id}"]`, { timeout: 20000 });
    await teacher.page.click(`.sl-exam-pool-questions tr[data-question="${first.id}"] button`);
    await teacher.page.waitForSelector(".sl-exam-pool-review button", { timeout: 10000 });
    const state = await teacher.page.evaluate((id) => {
      const row = document.querySelector(`.sl-exam-pool-questions tr[data-question="${id}"]`);
      return {
        chosen: row.classList.contains("is-chosen"),
        unreviewed: row.classList.contains("is-unreviewed"),
        banner: document.querySelector(".sl-exam-pool-review p").textContent,
        count: document.querySelector(".sl-exam-pool-count").textContent,
      };
    }, first.id);
    assert.equal(state.chosen && state.unreviewed, true, "chosen and not reviewed at once");
    assert.match(state.banner, /^Imported on \d{2}\.\d{2}\.\d{4} by .+ from statuscodes\.md, not reviewed yet\.$/);
    assert.equal(state.count, "1 question chosen. 1 of 1 chosen question is not reviewed yet.");

    await teacher.page.click(".sl-exam-pool-review button");
    await teacher.page.waitForFunction((id) => document.querySelector(".sl-exam-pool-question h2")?.textContent === id, { timeout: 10000 }, "Import zwei");
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${first.id}`)).json.unreviewed, false);
    assert.equal(await teacher.page.$eval(`.sl-exam-pool-questions tr[data-question="${first.id}"]`, (tr) => tr.classList.contains("is-unreviewed")), false);
    assert.equal(await teacher.page.$eval(".sl-exam-pool-count", (el) => el.textContent), "1 question chosen.");

    const q = (await fetchAs(teacher, `/exam/api/pool/questions/${second.id}`)).json;
    const saved = await fetchAs(teacher, `/exam/api/pool/questions/${second.id}`, {
      method: "PUT",
      body: {
        version: q.version,
        categoryId: q.categoryId,
        type: q.type,
        nameDe: q.nameDe,
        nameEn: q.nameEn,
        textDe: q.textDe,
        textEn: q.textEn,
        answers: q.answers.map(({ textDe, textEn, correct }) => ({ textDe, textEn, correct })),
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.json));
    assert.equal(saved.json.question.unreviewed, false, "a save is a review");
    assert.equal((await fetchAs(teacher, `/exam/api/pool/questions/${third.id}`)).json.unreviewed, true, "the third still waits");
  });

  test("taking back: refused while a question is in a test, then the questions and created categories go, and the same file is accepted again", async () => {
    const content = questionFile("Zuruecknehmen", [{ title: "Zurück eins" }, { title: "Zurück zwei" }]);
    const imported = await sendAs(teacher, "/exam/api/pool/imports", content, "back.md");
    assert.equal(imported.status, 200, JSON.stringify(imported.json));
    const again = await sendAs(teacher, "/exam/api/pool/imports/check", content, "back.md");
    assert.match(again.json.problems[0].message, /^Exactly this file was imported on .* \(as "back\.md"\)/, "the same file is refused");

    const used = (await fetchAs(teacher, "/exam/api/pool/questions?q=Zur%C3%BCck%20zwei")).json[0];
    const test = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Import: in use", questionIds: [used.id] } });
    assert.equal(test.status, 200, JSON.stringify(test.json));
    const refused = await fetchAs(teacher, `/exam/api/pool/imports/${imported.json.id}`, { method: "DELETE" });
    assert.equal(refused.status, 409);
    assert.equal(refused.json.error, 'This import cannot be taken back: its question "Zurück zwei" is in a test.');
    assert.equal((await imports()).find((record) => record.id === imported.json.id).inUse, true);

    await fetchAs(teacher, `/exam/api/tests/${test.json.id}`, { method: "DELETE" });
    await teacher.page.goto(`${applicationUrl}/exam/pool/import`, { waitUntil: "domcontentloaded" });
    const row = `.sl-exam-import-past tr[data-import="${imported.json.id}"]`;
    await teacher.page.waitForSelector(`${row} button`, { timeout: 20000 });
    await teacher.page.click(`${row} button`);
    assert.match(await teacher.page.$eval(`${row} .sl-exam-import-take-back button`, (el) => el.textContent), /^Click again to delete its 2 questions/, "asks by a second click");
    await teacher.page.click(`${row} .sl-exam-import-take-back button`);
    await teacher.page.waitForFunction((selector) => !document.querySelector(selector) && document.querySelector(".sl-exam-import"), { timeout: 10000 }, row);
    assert.deepEqual((await fetchAs(teacher, "/exam/api/pool/questions?q=Zur%C3%BCck")).json, [], "its questions are gone");
    const tree = (await fetchAs(teacher, "/exam/api/pool/categories")).json;
    assert.deepEqual(tree.find((node) => node.nameDe === "Import-Checks").children.map((node) => node.nameDe), ["Statuscodes"], "its own category is gone");
    const accepted = await sendAs(teacher, "/exam/api/pool/imports/check", content, "back.md");
    assert.deepEqual(accepted.json.problems, [], "the same file is accepted again");
  });

  test("the downloaded description names the format and lists the current categories", async () => {
    const download = await teacher.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return { status: response.status, type: response.headers.get("content-type"), disposition: response.headers.get("content-disposition"), text: await response.text() };
    }, `${applicationUrl}/exam/pool/import/format`);
    assert.equal(download.status, 200);
    assert.equal(download.type, "text/markdown; charset=utf-8");
    assert.equal(download.disposition, 'attachment; filename="safelearn-question-format.md"');
    assert.ok(download.text.includes("format: safelearn-questions/1"));
    assert.ok(download.text.includes("- Import-Checks / Statuscodes — Import checks / Statuscodes"), "the tree as it is now");
    assert.ok(download.text.includes("(2 richtige Antworten)"));
  });
});

// Last in the file: it restarts the instance, and every session has to come
// back through the identity provider afterwards.
describe("online tests: a restart", () => {
  test("a restarted server keeps the attempt, its answers and its browser", async () => {
    const student = await sharedSession("student");
    const teacher = await sharedSession("teacher");
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    const course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    const questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
    const test = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Restart", questionIds: questions.map((q) => q.id) } })).json;
    await fetchAs(teacher, `/exam/api/tests/${test.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
    });
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    const first = writing.questions[0];
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/questions/${first.n}`, { method: "PUT", body: { tokens: [first.answers[1].token] } });

    await restartApplication();
    assert.match(applicationOutput(), /Exam module: active/);
    await reauthenticate(student);
    await reauthenticate(teacher);

    const resumed = await fetchAs(student, `/exam/api/attempts/${writing.attempt}`);
    assert.equal(resumed.status, 200, JSON.stringify(resumed.json));
    assert.deepEqual(resumed.json.questions.find((q) => q.n === first.n).chosen, [first.answers[1].token], "the saved answer is there");
    assert.ok(resumed.json.remainingMs > 0 && resumed.json.remainingMs <= writing.remainingMs, "and the time left runs on");
    await fetchAs(student, `/exam/api/attempts/${writing.attempt}/submit`, { method: "POST" });
  });
});

// After the restart above, and restarting twice more: the school's periods
// are read when the module starts (`school-periods`).
describe("the school's periods", () => {
  const schoolList =
    "0=07:05-07:55,1=08:00-08:50,2=08:55-09:45,3=10:00-10:50,4=10:55-11:45,5=11:50-12:40,6=12:45-13:35,7=13:40-14:30," +
    "8=14:35-15:25,9=15:30-16:20,10=16:25-17:15,11=17:20-18:05,12=18:05-18:50,13=19:00-19:45,14=19:45-20:30,15=20:40-21:25,16=21:25-22:10";
  // Two days ahead, so every sitting below is still scheduled and can change.
  const date = viennaLocal(Date.now() + 2 * 24 * 60 * 60 * 1000).date;
  const at = (time) => viennaInstant(date, time).toISOString();
  let teacher;
  let course;
  let questions;
  let byForm;
  let offGrid;

  /** A new test of the GB course with the pool's questions. */
  async function newTest(name) {
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds: questions.map((q) => q.id) } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    return created.json;
  }

  /** The window of each sitting on a page, with the tooltip of its periods if it shows any. */
  async function windows(page, selector) {
    await page.waitForSelector(`${selector} .sl-exam-window`, { timeout: 20000 });
    return page.$$eval(`${selector} .sl-exam-window`, (spans) =>
      spans.map((span) => ({ text: span.textContent, title: span.querySelector(".sl-exam-periods")?.title ?? null }))
    );
  }

  before(async () => {
    teacher = await sharedSession("teacher");
    // The clock-time fields are in the browser's time zone; the periods are Vienna's.
    await teacher.page.emulateTimezone("Europe/Vienna");
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
  });

  test("without SCHOOL_PERIODS the form and every window are in clock times, as before", async () => {
    assert.deepEqual((await fetchAs(teacher, "/exam/api/me")).json.periods, []);
    const plain = await newTest("Periods: none configured");
    const created = await fetchAs(teacher, `/exam/api/tests/${plain.id}/sittings`, { method: "POST", body: { opensAt: at("10:00"), closesAt: at("11:45"), durationMinutes: 15 } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    await teacher.page.goto(`${applicationUrl}/exam/tests/${plain.id}`, { waitUntil: "domcontentloaded" });
    const [shown] = await windows(teacher.page, `li[data-sitting="${created.json.id}"]`);
    assert.equal(shown.title, null, "no periods");
    assert.match(shown.text, /^\d\d\.\d\d\.\d{4},? 10:00 – 11:45$/, shown.text);
    const form = await teacher.page.$eval(".sl-exam-sitting-form form", (form) => ({
      fields: [...form.querySelectorAll("sl-date-input, input[name], select")].map((input) => input.getAttribute("name")),
      toggle: Boolean(form.querySelector(".sl-exam-sitting-mode")),
      wrapper: Boolean(form.querySelector(".sl-exam-sitting-window")),
    }));
    assert.deepEqual(form.fields.slice(0, 4), ["date", "opensTime", "closesTime", "durationMinutes"], "one date and two times - a sitting never runs across midnight");
    assert.equal(form.fields.includes("fromPeriod"), false);
    assert.equal(form.toggle, false, "no switch");
    assert.equal(form.wrapper, false);
  });

  test("in clock times a sitting is scheduled by one date and two times, and an unreadable time is refused", async () => {
    const fresh = await newTest("Periods: none, by form");
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/tests/${fresh.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-sitting-form input[name=opensTime]", { timeout: 20000 });
    const fill = (opens, closes) =>
      page.$eval(
        ".sl-exam-sitting-form form",
        (form, date, opens, closes) => {
          const field = form.querySelector("sl-date-input[name=date]");
          field.value = date;
          field.dispatchEvent(new Event("change"));
          for (const [name, value] of [["opensTime", opens], ["closesTime", closes]]) {
            const input = form.querySelector(`input[name=${name}]`);
            input.value = value;
            input.dispatchEvent(new Event("input"));
          }
        },
        date,
        opens,
        closes
      );
    await fill("10:05", "10.5x");
    await page.click(".sl-exam-sitting-form button[type=submit]");
    assert.equal(await page.$eval(".sl-exam-sitting-form input[name=closesTime]", (input) => input.getAttribute("aria-invalid")), "true");
    assert.deepEqual((await fetchAs(teacher, `/exam/api/tests/${fresh.id}`)).json.sittings, [], "nothing is scheduled");
    await fill("10:05", "10:55");
    await page.click(".sl-exam-sitting-form button[type=submit]");
    await page.waitForSelector(".sl-exam-test-sittings li[data-sitting]", { timeout: 10000 });
    const [stored] = (await fetchAs(teacher, `/exam/api/tests/${fresh.id}`)).json.sittings;
    assert.deepEqual([stored.opensAt, stored.closesAt], [at("10:05"), at("10:55")]);
  });

  test("a malformed SCHOOL_PERIODS switches the module off and the reader keeps serving", async () => {
    await restartApplication({ env: { SCHOOL_PERIODS: "1=8-9" } });
    assert.match(applicationOutput(), /Exam module: disabled - SCHOOL_PERIODS: the entry "1=8-9" is not of the form/);
    await reauthenticate(teacher);
    assert.equal((await fetchAs(teacher, plainPage)).status, 200, "pages are served");
    const me = await fetchAs(teacher, "/exam/api/me");
    assert.ok(me.redirected && !me.servedFrom.startsWith("/exam/"), "the module is not there: /exam/ lands where a path with nothing behind it lands");
  });

  test("with the school's list, /me carries the periods", async () => {
    await restartApplication({ env: { SCHOOL_PERIODS: schoolList } });
    assert.match(applicationOutput(), /Exam module: active/);
    await reauthenticate(teacher);
    const periods = (await fetchAs(teacher, "/exam/api/me")).json.periods;
    assert.equal(periods.length, 17);
    assert.deepEqual(periods[12], { n: 12, start: "18:05", end: "18:50" });
  });

  test("scheduling periods 3 to 4 stores 10:00 to 11:45 Vienna time, each choice with its times as tooltip", async () => {
    byForm = await newTest("Periods: by form");
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/tests/${byForm.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-sitting-form select[name=fromPeriod]", { timeout: 20000 });
    const fresh = await page.$eval(".sl-exam-sitting-form form", (form) => ({
      opensAt: Boolean(form.querySelector("input[name=opensTime]")),
      toggle: form.querySelector(".sl-exam-sitting-mode")?.textContent,
      tag: form.querySelector(".sl-exam-sitting-mode")?.tagName,
    }));
    assert.deepEqual(fresh, { opensAt: false, toggle: "Exact times instead", tag: "BUTTON" }, "a new sitting starts with periods");
    await page.$eval(
      ".sl-exam-sitting-form sl-date-input[name=date]",
      (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event("change"));
      },
      date
    );
    // From an early pair first: what the form proposes depends on the time
    // of day, and the to period must start out below the from period chosen next.
    await page.select(".sl-exam-sitting-form select[name=fromPeriod]", "2");
    await page.select(".sl-exam-sitting-form select[name=toPeriod]", "2");
    await page.select(".sl-exam-sitting-form select[name=fromPeriod]", "5");
    assert.deepEqual(
      await page.$eval(".sl-exam-sitting-form select[name=toPeriod]", (select) => ({ first: select.options[0].value, value: select.value })),
      { first: "5", value: "5" },
      "the to period offers nothing before the from period, and moves up to it"
    );
    await page.select(".sl-exam-sitting-form select[name=fromPeriod]", "3");
    await page.select(".sl-exam-sitting-form select[name=toPeriod]", "4");
    const chosen = await page.$eval(".sl-exam-sitting-form form", (form) => ({
      times: form.querySelector(".sl-exam-sitting-times").textContent,
      twelve: form.querySelector('select[name=toPeriod] option[value="12"]').title,
      three: form.querySelector('select[name=fromPeriod] option[value="3"]').title,
    }));
    assert.deepEqual(chosen, { times: "10:00–11:45", twelve: "18:05–18:50", three: "10:00–10:50" });
    await page.click(".sl-exam-sitting-form button[type=submit]");
    await page.waitForSelector(".sl-exam-test-sittings li[data-sitting]", { timeout: 10000 });
    const [stored] = (await fetchAs(teacher, `/exam/api/tests/${byForm.id}`)).json.sittings;
    assert.equal(stored.opensAt, at("10:00"));
    assert.equal(stored.closesAt, at("11:45"));
  });

  test("the sittings of a test, the list of tests and the live view show lessons 3–4 with 10:00–11:45 as tooltip", async () => {
    const [sitting] = (await fetchAs(teacher, `/exam/api/tests/${byForm.id}`)).json.sittings;
    const expected = { text: new RegExp(`^[A-Z][a-z]{2} ${date.slice(8, 10)}\\.${date.slice(5, 7)}\\. · lessons 3–4$`), title: "10:00–11:45" };
    const check = ([shown], where) => {
      assert.match(shown.text, expected.text, `${where}: ${shown.text}`);
      assert.equal(shown.title, expected.title, where);
    };
    check(await windows(teacher.page, `li[data-sitting="${sitting.id}"]`), "the sittings of the test");
    await teacher.page.goto(`${applicationUrl}/exam/tests?course=${course.id}`, { waitUntil: "domcontentloaded" });
    check(await windows(teacher.page, `tr[data-test="${byForm.id}"]`), "the list of tests");
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    check(await windows(teacher.page, ".sl-exam-live-window"), "the live view");
    // Redrawn every second, the time left changes and the periods stay the same node.
    await teacher.page.$eval(".sl-exam-live-window .sl-exam-periods", (span) => (span.dataset.kept = "1"));
    const before = await teacher.page.$eval(".sl-exam-live-window", (el) => el.textContent);
    await new Promise((resolve) => setTimeout(resolve, 2200));
    const later = await teacher.page.$eval(".sl-exam-live-window", (el) => ({ text: el.textContent, kept: el.querySelector(".sl-exam-periods")?.dataset.kept }));
    assert.notEqual(later.text, before, "the time left counts");
    assert.equal(later.kept, "1", "the tooltip's element stays put");
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/screen`, { waitUntil: "domcontentloaded" });
    check(await windows(teacher.page, ".sl-exam-screen-window"), "the class screen");
  });

  test("switching a sitting on periods to exact times carries its window over", async () => {
    const [sitting] = (await fetchAs(teacher, `/exam/api/tests/${byForm.id}`)).json.sittings;
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/tests/${byForm.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`li[data-sitting="${sitting.id}"] .sl-exam-sitting-edit`, { timeout: 20000 });
    await page.click(`li[data-sitting="${sitting.id}"] .sl-exam-sitting-edit`);
    const editing = await page.$eval(".sl-exam-sitting-form form", (form) => ({
      from: form.querySelector("select[name=fromPeriod]")?.value,
      to: form.querySelector("select[name=toPeriod]")?.value,
      date: form.querySelector("sl-date-input[name=date]")?.value,
    }));
    assert.deepEqual(editing, { from: "3", to: "4", date });
    await page.click(".sl-exam-sitting-form .sl-exam-sitting-mode");
    const exact = await page.$eval(".sl-exam-sitting-form form", (form) => ({
      date: form.querySelector("sl-date-input[name=date]").value,
      opens: form.querySelector("input[name=opensTime]").value,
      closes: form.querySelector("input[name=closesTime]").value,
      toggle: form.querySelector(".sl-exam-sitting-mode").textContent,
    }));
    assert.deepEqual(exact, { date, opens: "10:00", closes: "11:45", toggle: "Lessons instead" });
  });

  test("a sitting off the periods shows clock times and opens the form in exact times", async () => {
    offGrid = await newTest("Periods: off the grid");
    const created = await fetchAs(teacher, `/exam/api/tests/${offGrid.id}/sittings`, { method: "POST", body: { opensAt: at("10:05"), closesAt: at("10:55"), durationMinutes: 15 } });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/tests/${offGrid.id}`, { waitUntil: "domcontentloaded" });
    const [shown] = await windows(page, `li[data-sitting="${created.json.id}"]`);
    assert.equal(shown.title, null);
    assert.match(shown.text, /10:05 – 10:55$/, shown.text);
    await page.click(`li[data-sitting="${created.json.id}"] .sl-exam-sitting-edit`);
    const editing = await page.$eval(".sl-exam-sitting-form form", (form) => ({
      date: form.querySelector("sl-date-input[name=date]")?.value,
      opens: form.querySelector("input[name=opensTime]")?.value,
      closes: form.querySelector("input[name=closesTime]")?.value,
      toggle: form.querySelector(".sl-exam-sitting-mode")?.textContent,
    }));
    assert.deepEqual(editing, { date, opens: "10:05", closes: "10:55", toggle: "Lessons instead" });
    // Back to periods: the date stays, the periods are the ones a new sitting gets.
    await page.click(".sl-exam-sitting-form .sl-exam-sitting-mode");
    assert.equal(await page.$eval(".sl-exam-sitting-form sl-date-input[name=date]", (input) => input.value), date);
  });
});

// Last: an admin's corrections of what students have written (`online-test`).
describe("online tests: an admin's corrections", () => {
  let student;
  let teacher;
  let admin;
  let course;
  let questions;

  /** A test of the GB course that the shared student has written and submitted, in a sitting still open. */
  async function writtenTest(name) {
    const test = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds: questions.slice(0, 3).map((q) => q.id) } })).json;
    const sitting = (
      await fetchAs(teacher, `/exam/api/tests/${test.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    const writing = (await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).json;
    const submitted = await fetchAs(student, `/exam/api/attempts/${writing.attempt}/submit`, { method: "POST" });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.json));
    return { test, sitting, attempt: writing.attempt };
  }

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    admin = await sharedSession("admin");
    for (const session of [student, teacher, admin]) await reauthenticate(session).catch(() => {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
  });

  test("/me tells an admin from a teacher", async () => {
    assert.equal((await fetchAs(admin, "/exam/api/me")).json.admin, true);
    assert.equal((await fetchAs(teacher, "/exam/api/me")).json.admin, false);
  });

  test("a teacher who is no admin can take back nothing written, and is offered nothing", async () => {
    const { test, attempt } = await writtenTest("Admin: refused");
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${test.id}`, { method: "DELETE" })).status, 409);
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${test.id}/questions/${questions[0].id}`, { method: "DELETE" })).status, 403);
    assert.equal((await fetchAs(teacher, `/exam/api/attempts/${attempt}`, { method: "DELETE" })).status, 403);
    assert.equal((await fetchAs(student, `/exam/api/attempts/${attempt}`, { method: "DELETE" })).status, 403);
    await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-test-questions li", { timeout: 20000 });
    const offered = await teacher.page.evaluate(() => ({
      admin: document.querySelectorAll(".sl-exam-admin").length,
      remove: document.querySelectorAll(".sl-exam-test-remove").length,
      deleteTest: document.querySelectorAll(".sl-exam-test-delete").length,
    }));
    assert.deepEqual(offered, { admin: 0, remove: 0, deleteTest: 0 });
    assert.equal((await fetchAs(teacher, `/exam/api/tests/${test.id}`)).json.questions.length, 3, "nothing changed");
  });

  test("an admin removes a question from a written test in the page, and the attempt is scored over the rest", async () => {
    const { test, attempt } = await writtenTest("Admin: remove");
    const page = admin.page;
    await page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-test-questions .sl-exam-test-remove.sl-exam-admin", { timeout: 20000 });
    const first = await page.$eval(".sl-exam-test-questions > li", (li) => li.dataset.question);
    const button = `.sl-exam-test-questions > li[data-question="${first}"] .sl-exam-test-remove`;
    await page.click(button);
    assert.match(await page.$eval(button, (b) => b.textContent), /score every attempt again/, "asks once more");
    await page.click(button);
    await page.waitForFunction(() => document.querySelectorAll(".sl-exam-test-questions > li").length === 2, { timeout: 10000 });
    assert.equal((await fetchAs(admin, `/exam/api/tests/${test.id}`)).json.questions.length, 2);
    const { db } = openDatabase(run.databasePath);
    try {
      const row = db.prepare("SELECT score, question_count FROM attempt WHERE id = ?").get(attempt);
      assert.equal(row.question_count, 2);
      assert.ok(row.score >= 0 && row.score <= 2);
    } finally {
      db.close();
    }
  });

  test("an admin deletes an attempt in the live view, and the student counts as not started", async () => {
    const { sitting } = await writtenTest("Admin: attempt");
    const page = admin.page;
    const username = student.username.toLowerCase();
    await page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    const button = `sl-exam-live tr[data-username="${username}"] .sl-exam-live-delete`;
    // The stream's first snapshot draws every row anew; armed before it, the button would be gone.
    await page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
    await page.waitForSelector(button, { timeout: 20000 });
    await page.click(button);
    await page.click(button);
    await page.waitForFunction((u) => document.querySelector(`sl-exam-live tr[data-username="${u}"]`)?.dataset.status === "not started", { timeout: 10000 }, username);
    const snapshot = (await fetchAs(admin, `/exam/api/sittings/${sitting.id}/live`)).json;
    assert.equal(snapshot.participants.find((p) => p.username === username).attemptId, null);
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`sl-exam-live tr[data-username="${username}"]`, { timeout: 20000 });
    assert.equal(await teacher.page.$$eval(".sl-exam-live-delete", (buttons) => buttons.length), 0, "no teacher is offered it");
  });

  test("an admin deletes a written test with its attempts", async () => {
    const { test, attempt } = await writtenTest("Admin: delete");
    const page = admin.page;
    await page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-test-delete.sl-exam-admin", { timeout: 20000 });
    await page.click(".sl-exam-test-delete");
    assert.match(await page.$eval(".sl-exam-test-delete", (b) => b.textContent), /and 1 attempt$/);
    await Promise.all([page.waitForNavigation({ timeout: 20000 }), page.click(".sl-exam-test-delete")]);
    assert.equal((await fetchAs(admin, `/exam/api/tests/${test.id}`)).status, 404);
    const { db } = openDatabase(run.databasePath);
    try {
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM attempt WHERE id = ?").get(attempt).n, 0);
    } finally {
      db.close();
    }
  });

  /** The result of the shared student in the test's gradebook column, in either semester, or undefined. */
  async function gradebookResult(testId) {
    const username = student.username.toLowerCase();
    for (const semester of ["ws", "ss"]) {
      const sheet = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=${semester}`)).json;
      const result = sheet.students.find((row) => row.username === username)?.results[`test-${testId}`];
      if (result !== undefined) return result;
    }
    return undefined;
  }

  test("rescheduling a sitting with attempts is an admin's, and its live view hears the window and the deleted attempt", async () => {
    const { sitting } = await writtenTest("Admin: reschedule over the API");
    assert.equal((await fetchAs(teacher, `/exam/api/sittings/${sitting.id}/end`, { method: "POST" })).status, 200);
    const body = { opensAt: new Date(Date.now() + 24 * 3600000).toISOString(), closesAt: new Date(Date.now() + 25 * 3600000).toISOString(), attempts: 1 };
    assert.equal((await fetchAs(teacher, `/exam/api/sittings/${sitting.id}/reschedule`, { method: "POST", body })).status, 403);
    assert.equal((await fetchAs(admin, `/exam/api/sittings/${sitting.id}/reschedule`, { method: "POST", body: { ...body, attempts: 2 } })).status, 409);
    // The admin's page listens to the sitting's stream as the live view does.
    await admin.page.goto(`${applicationUrl}/exam/tests`, { waitUntil: "domcontentloaded" });
    await admin.page.evaluate((address) => {
      window.heard = [];
      window.opened = new Promise((resolve) => {
        const source = new EventSource(address);
        source.addEventListener("snapshot", resolve);
        source.addEventListener("change", (event) => window.heard.push(JSON.parse(event.data).type));
      });
    }, `/exam/api/sittings/${sitting.id}/events`);
    await admin.page.evaluate(() => window.opened);
    const moved = await fetchAs(admin, `/exam/api/sittings/${sitting.id}/reschedule`, { method: "POST", body });
    assert.equal(moved.status, 200, JSON.stringify(moved.json));
    assert.deepEqual([moved.json.state, moved.json.attempts], ["scheduled", 0]);
    await admin.page.waitForFunction(() => window.heard.includes("window") && window.heard.includes("deleted"), { timeout: 10000 });
  });

  test("a teacher reschedules a sitting nobody wrote in the page, and it is scheduled on the next weekday", async () => {
    const test = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Reschedule: unwritten", questionIds: questions.slice(0, 2).map((q) => q.id) } })).json;
    const sitting = (
      await fetchAs(teacher, `/exam/api/tests/${test.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    await fetchAs(teacher, `/exam/api/sittings/${sitting.id}/end`, { method: "POST" });
    const page = teacher.page;
    const line = `li[data-sitting="${sitting.id}"]`;
    await page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`${line}[data-state="over"] .sl-exam-sitting-reschedule`, { timeout: 20000 });
    await page.click(`${line} .sl-exam-sitting-reschedule`);
    await page.waitForSelector(".sl-exam-reschedule .sl-exam-reschedule-kept", { timeout: 5000 });
    assert.equal(await page.$eval(".sl-exam-reschedule-kept dd", (dd) => dd.textContent), "15", "the minutes per attempt are shown, not edited");
    // At the legibility viewport, loaded there as a phone would, nothing in
    // the form runs out of its box. The page itself is wider at 390 px
    // already, by the top bar and the test's own buttons.
    const before = page.viewport();
    await page.setViewport({ width: 390, height: 844 });
    try {
      await page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(`${line} .sl-exam-sitting-reschedule`, { timeout: 20000 });
      await page.click(`${line} .sl-exam-sitting-reschedule`);
      await page.waitForSelector(".sl-exam-reschedule", { timeout: 5000 });
      const overflow = await page.evaluate(() =>
        [...document.querySelectorAll(".sl-exam-reschedule *")].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className)
      );
      assert.deepEqual(overflow, [], "the form fits the legibility viewport");
    } finally {
      await page.setViewport(before ?? { width: 1280, height: 800 });
    }
    await page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`${line} .sl-exam-sitting-reschedule`, { timeout: 20000 });
    await page.click(`${line} .sl-exam-sitting-reschedule`);
    await page.waitForSelector(".sl-exam-reschedule-save", { timeout: 5000 });
    await page.click(".sl-exam-reschedule-save");
    await page.waitForSelector(`${line}[data-state="scheduled"]`, { timeout: 10000 });
    const moved = (await fetchAs(teacher, `/exam/api/tests/${test.id}`)).json.sittings[0];
    const day = new Date(moved.opensAt).getUTCDay();
    assert.ok(day >= 1 && day <= 5, "a weekday");
    assert.ok(Date.parse(moved.opensAt) > Date.now(), "in the future");
    assert.deepEqual([moved.durationS, moved.participants], [sitting.durationS, sitting.participants]);
  });

  test("an admin reschedules a written sitting with two clicks and the gradebook loses the result; a teacher is offered nothing", async () => {
    const { test, sitting } = await writtenTest("Admin: reschedule in the page");
    await fetchAs(teacher, `/exam/api/sittings/${sitting.id}/end`, { method: "POST" });
    assert.notEqual(await gradebookResult(test.id), undefined, "the result is in the gradebook");
    const line = `li[data-sitting="${sitting.id}"]`;
    await teacher.page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(`${line}[data-state="over"]`, { timeout: 20000 });
    assert.equal(await teacher.page.$$eval(".sl-exam-sitting-reschedule", (buttons) => buttons.length), 0, "no Reschedule for a teacher");
    const page = admin.page;
    await page.goto(`${applicationUrl}/exam/tests/${test.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`${line} .sl-exam-sitting-reschedule.sl-exam-admin`, { timeout: 20000 });
    await page.click(`${line} .sl-exam-sitting-reschedule`);
    await page.waitForSelector(".sl-exam-reschedule-save", { timeout: 5000 });
    await page.click(".sl-exam-reschedule-save");
    assert.equal(await page.$eval(".sl-exam-reschedule-save", (b) => b.textContent), "Click again: delete 1 attempt and reschedule");
    assert.equal((await fetchAs(admin, `/exam/api/tests/${test.id}`)).json.sittings[0].attempts, 1, "one click changes nothing");
    await page.click(".sl-exam-reschedule-save");
    await page.waitForSelector(`${line}[data-state="scheduled"]`, { timeout: 10000 });
    assert.equal(await gradebookResult(test.id), undefined, "the result is gone");
  });

});

// The module's actions (`exam-ui-conventions`): buttons in one style, standing
// at the structure they act on, with their messages beside them.
describe("the module's actions", () => {
  let teacher;
  let student;
  let course;
  let gbClass;
  let questions;

  const catalogs = {
    en: JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "i18n", "en.json"), "utf8")),
    de: JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "i18n", "de.json"), "utf8")),
  };
  const text = (lang, key) => key.split(".").reduce((node, segment) => node[segment], catalogs[lang]);

  /** The action texts of design.md, Context, that were links before. */
  const actionKeys = [
    "exam.pool.importQuestions",
    "exam.pool.newQuestion",
    "exam.pool.edit",
    "exam.categories.backToPool",
    "exam.tests.liveViewLink",
    "exam.tests.classScreenLink",
    "exam.tests.addFromPool",
    "exam.tests.tryAsStudent",
    "exam.tests.boardSolution",
    "exam.tests.newTest",
    "exam.live.classScreenLink",
    "exam.classes.openGradebook",
    "exam.gradebook.configSheet",
    "exam.gradebook.gradingScale",
    "exam.gradebook.enterResults",
    "exam.import.downloadFormat",
  ];

  /** The texts of plain links - not drawn as module buttons - inside `.sl-exam` that name an action. */
  const actionLinks = (lang) =>
    teacher.page.evaluate(
      (texts) =>
        [...document.querySelectorAll(".sl-exam a:not(.sl-exam-action)")].map((a) => a.textContent.trim()).filter((shown) => texts.includes(shown)),
      actionKeys.map((key) => text(lang, key))
    );

  before(async () => {
    teacher = await sharedSession("teacher");
    student = await sharedSession("student");
    await setPreferences(teacher, {});
    await setPreferences(student, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
  });

  after(async () => {
    await setPreferences(teacher, {}).catch(() => {});
  });

  test("no plain link names an action, in English or in German", async () => {
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Buttons only", questionIds: questions.map((q) => q.id) } })).json;
    const sitting = (
      await fetchAs(teacher, `/exam/api/tests/${created.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() + 24 * 3600000).toISOString(), closesAt: new Date(Date.now() + 25 * 3600000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    const pages = [
      [`/exam/pool?course=${course.id}`, ".sl-exam-pool-questions tbody tr"],
      [`/exam/pool/questions/${questions[0].id}`, ".sl-exam-editor-back"],
      ["/exam/pool/import", ".sl-exam-import-format"],
      [`/exam/tests?course=${course.id}`, ".sl-exam-tests-new"],
      [`/exam/tests/${created.id}`, ".sl-exam-test-actions"],
      [`/exam/sittings/${sitting.id}/live`, ".sl-exam-live-screen-link"],
      [`/exam/courses/${course.id}`, ".sl-exam-course-gradebook"],
      [`/exam/courses/${course.id}/gradebook?semester=ws`, ".sl-exam-gradebook-actions"],
      [`/exam/courses/${course.id}/students/gb-other-student`, ".sl-exam-enter-results"],
    ];
    try {
      for (const lang of ["en", "de"]) {
        await setPreferences(teacher, lang === "en" ? {} : { lang: "de" });
        for (const [reference, drawn] of pages) {
          await teacher.page.goto(`${applicationUrl}${reference}`, { waitUntil: "domcontentloaded" });
          await teacher.page.waitForSelector(drawn, { timeout: 20000 });
          if (reference.startsWith("/exam/pool?")) {
            await teacher.page.click(".sl-exam-pool-questions tbody tr");
            await teacher.page.waitForSelector(".sl-exam-pool-edit", { timeout: 10000 });
          }
          assert.deepEqual(await actionLinks(lang), [], `${reference} (${lang}) draws its actions as buttons`);
        }
      }
      await setPreferences(teacher, {});
      await teacher.page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
      assert.equal(await teacher.page.$$eval(".sl-exam-pool-questions tbody a", (links) => links.length), 0, "a question's name in the list is no link");
    } finally {
      await setPreferences(teacher, {});
      await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "DELETE" });
    }
  });

  test("every module button has the same font size and height, wherever it stands", async () => {
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Button sizes", questionIds: questions.map((q) => q.id) } })).json;
    const sitting = (
      await fetchAs(teacher, `/exam/api/tests/${created.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() + 24 * 3600000).toISOString(), closesAt: new Date(Date.now() + 25 * 3600000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    const pages = [
      ["/exam/", ".sl-exam-actions"],
      [`/exam/classes/${gbClass.id}`, ".sl-exam-actions"],
      [`/exam/pool?course=${course.id}`, ".sl-exam-pool-questions tbody tr"],
      [`/exam/pool/questions/${questions[0].id}`, ".sl-exam-editor-back"],
      ["/exam/pool/import", ".sl-exam-import-format"],
      [`/exam/tests?course=${course.id}`, ".sl-exam-tests-new"],
      [`/exam/tests/${created.id}`, ".sl-exam-test-actions"],
      [`/exam/sittings/${sitting.id}/live`, ".sl-exam-live-screen-link"],
      [`/exam/courses/${course.id}`, ".sl-exam-course-gradebook"],
      [`/exam/courses/${course.id}/gradebook?semester=ws`, ".sl-exam-gradebook-actions"],
      [`/exam/courses/${course.id}/students/gb-other-student`, ".sl-exam-enter-results"],
    ];
    const measured = [];
    try {
      for (const [reference, drawn] of pages) {
        await teacher.page.goto(`${applicationUrl}${reference}`, { waitUntil: "domcontentloaded" });
        await teacher.page.waitForSelector(drawn, { timeout: 20000 });
        if (reference.startsWith("/exam/pool?")) {
          await teacher.page.click(".sl-exam-pool-questions tbody tr");
          await teacher.page.waitForSelector(".sl-exam-pool-edit", { timeout: 10000 });
        }
        // The tree's ⋯ buttons are compact on purpose; the Delete in their menu is a menu entry, not a button.
        const buttons = await teacher.page.$$eval(".sl-exam :is(.sl-exam-action, .sl-exam-primary):not(.sl-exam-tree-tool)", (elements) =>
          elements
            .filter((element) => element.offsetParent !== null)
            .map((element) => ({
              text: (element.getAttribute("aria-label") ?? element.textContent).trim().slice(0, 30),
              fontSize: getComputedStyle(element).fontSize,
              height: Math.round(element.getBoundingClientRect().height),
            }))
        );
        measured.push(...buttons.map((button) => ({ ...button, page: reference })));
      }
      const tally = (key) => measured.reduce((counts, button) => ({ ...counts, [button[key]]: (counts[button[key]] ?? 0) + 1 }), {});
      const odd = (key) => {
        const counts = tally(key);
        const usual = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        return measured.filter((button) => String(button[key]) !== usual).map((button) => `${button.page} "${button.text}" ${button[key]}`);
      };
      console.log("button sizes", JSON.stringify({ fontSize: tally("fontSize"), height: tally("height") }));
      assert.deepEqual({ fontSize: odd("fontSize"), height: odd("height") }, { fontSize: [], height: [] }, "every button has the usual font size and height");
    } finally {
      await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "DELETE" });
    }
  });

  test("a test's head carries its actions, Delete this test beside Rename above the questions, and a refused sitting change is told at that sitting", async () => {
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Head", questionIds: questions.map((q) => q.id) } })).json;
    const sitting = (
      await fetchAs(teacher, `/exam/api/tests/${created.id}/sittings`, {
        method: "POST",
        body: { opensAt: new Date(Date.now() + 24 * 3600000).toISOString(), closesAt: new Date(Date.now() + 25 * 3600000).toISOString(), durationMinutes: 15 },
      })
    ).json;
    const page = teacher.page;
    try {
      await page.goto(`${applicationUrl}/exam/tests/${created.id}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".sl-exam-test-delete", { timeout: 20000 });
      const order = await page.evaluate(() => {
        const remove = document.querySelector(".sl-exam-test-delete");
        const questions = document.querySelector(".sl-exam-test-questions");
        return {
          beforeQuestions: Boolean(remove.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING),
          besideRename: remove.closest(".sl-exam-test-rename") !== null,
          head: [...document.querySelectorAll(".sl-exam-test-actions .sl-exam-action")].map((el) => el.className.match(/sl-exam-test-\w+/)[0]),
        };
      });
      assert.deepEqual(order, { beforeQuestions: true, besideRename: true, head: ["sl-exam-test-preview", "sl-exam-test-solution", "sl-exam-test-add"] });

      // A window shorter than the attempt is refused; the reason stands at the sitting.
      const li = `li[data-sitting="${sitting.id}"]`;
      await page.click(`${li} .sl-exam-sitting-edit`);
      await page.waitForSelector(".sl-exam-sitting-form input[name=durationMinutes]", { timeout: 10000 });
      await page.$eval(".sl-exam-sitting-form input[name=durationMinutes]", (input) => {
        input.value = "500";
      });
      await page.click(".sl-exam-sitting-form button[type=submit]");
      await page.waitForFunction((selector) => document.querySelector(`${selector} .sl-exam-sitting-message`)?.textContent, { timeout: 10000 }, li);
      assert.equal(await page.$eval(".sl-exam-test > .sl-exam-message", (el) => el.textContent), "", "not under the rename form");
    } finally {
      await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "DELETE" });
    }
  });

  test("the bar's Grading scale opens the scale, marked as the current page", async () => {
    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector('.sl-exam-bar-page[data-page="scale"]', { timeout: 20000 });
    await Promise.all([teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" }), teacher.page.click('.sl-exam-bar-page[data-page="scale"]')]);
    assert.equal(new URL(teacher.page.url()).pathname, "/exam/scale");
    assert.equal(await teacher.page.$eval('.sl-exam-bar-page[data-page="scale"]', (a) => a.getAttribute("aria-current")), "page");
  });

  test("the grading scale saves as it changes, without a button, and only while it is a valid scale", async () => {
    const page = teacher.page;
    const original = (await fetchAs(teacher, "/exam/api/scale")).json;
    const stored = async (grade) => (await fetchAs(teacher, "/exam/api/scale")).json.find((row) => row.grade === grade).minPercent;
    const field = (grade) => `sl-exam-scale input[aria-label="${text("en", "exam.gradebook.gradeFrom").replace("{grade}", grade)}"]`;
    /** Types `value` into grade's field and leaves it, which fires its `change`. */
    const enter = async (grade, value) => {
      await page.$eval(field(grade), (input) => {
        input.focus();
        input.select();
      });
      await page.keyboard.type(value);
      await page.keyboard.press("Tab");
    };
    const waitFor = async (condition, what) => {
      const until = Date.now() + 10000;
      while (!(await condition())) {
        if (Date.now() > until) assert.fail(`timed out: ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    };
    try {
      await page.goto(`${applicationUrl}/exam/scale`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(field(2), { timeout: 20000 });
      assert.equal(await page.$$eval("sl-exam-scale button", (buttons) => buttons.length), 0, "the scale has no Save button");
      assert.ok((await page.$eval("sl-exam-scale", (el) => el.textContent)).includes(text("en", "exam.classes.savedAsChanged")), "it says that it saves as it changes");

      await enter(2, "74.5");
      await waitFor(async () => (await stored(2)) === 74.5, "a valid threshold is stored on leaving the field");
      const saved = text("en", "exam.gradebook.scaleSaved");
      await waitFor(() => page.$eval(".sl-exam-scale-status", (p, expected) => p.textContent === expected, saved), "the scale says it was saved");

      await enter(2, "95");
      await waitFor(() => page.$eval(".sl-exam-scale-status", (p) => p.classList.contains("sl-embed-error") && p.textContent.length > 0), "the scale says why it is not saved");
      assert.equal(
        await page.$eval(".sl-exam-scale-status", (p) => p.textContent),
        text("en", "exam.errors.gradebook.thresholdOrder").replace("{grade}", "2").replace("{better}", "1")
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(await stored(2), 74.5, "an invalid scale is not stored");
    } finally {
      const thresholds = Object.fromEntries(original.filter((row) => row.grade < 5).map((row) => [row.grade, row.minPercent]));
      assert.equal((await fetchAs(teacher, "/exam/api/scale", { method: "PUT", body: { thresholds } })).status, 200);
    }
  });

  test("the student's page in a course says that its fields are saved as they change", async () => {
    const overview = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json;
    await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}/students/${overview.students[0].username}`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-saved-hint", { timeout: 20000 });
    assert.equal(await teacher.page.$eval(".sl-exam-saved-hint", (p) => p.textContent), text("en", "exam.classes.savedAsChanged"));
  });

  test("with a course in the bar, every pool row's box follows the row's choice", async () => {
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/pool?course=${course.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-pool-questions tbody tr .sl-exam-pool-box", { timeout: 20000 });
    const state = () => page.$$eval(".sl-exam-pool-questions tbody tr", (rows) => rows.map((row) => [row.getAttribute("aria-selected"), row.querySelector(".sl-exam-pool-box").checked]));
    assert.ok((await state()).every(([selected, checked]) => selected === "false" && checked === false));
    await page.click(".sl-exam-pool-questions tbody tr:first-child td:nth-child(2)");
    assert.deepEqual((await state())[0], ["true", true], "a click on the row ticks its box");
    await page.click(".sl-exam-pool-questions tbody tr:first-child .sl-exam-pool-box");
    assert.deepEqual((await state())[0], ["false", false], "a click on the box unchooses the row");
    await page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-pool-questions tbody tr", { timeout: 20000 });
    assert.equal(await page.$$eval(".sl-exam-pool-box", (boxes) => boxes.length), 0, "without a course, no boxes");
  });

  test("New question is offered with all categories shown, and the editor then asks for a category", async () => {
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/pool`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-pool-new", { timeout: 20000 });
    assert.equal(await page.$eval(".sl-exam-pool-new", (a) => a.hidden || a.offsetParent === null), false, "New question is shown without a chosen category");
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(".sl-exam-pool-new")]);
    await page.waitForSelector(".sl-exam-editor select[name=categoryId]", { timeout: 20000 });
    assert.deepEqual(
      await page.$eval(".sl-exam-editor select[name=categoryId]", (select) => [select.value, select.required, select.validity.valid]),
      ["", true, false],
      "no category is chosen, and the form is not sent without one"
    );
  });

  test("a checked import offers Import above its preview", async () => {
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/pool/import`, { waitUntil: "domcontentloaded" });
    const input = await page.waitForSelector(".sl-exam-import input[type=file]", { timeout: 20000 });
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "sl-import-")), "order.md");
    writeFileSync(
      file,
      [
        "---",
        "format: safelearn-questions/1",
        "---",
        "",
        "# Import-Checks / Reihenfolge",
        "en: Import checks / Order",
        "",
        "## Oben",
        "en: Above",
        "type: multichoiceset",
        "",
        "### de",
        "",
        "Wo steht der Knopf? (1 richtige Antwort)",
        "",
        "- [x] `oben`",
        "- [ ] `unten`",
        "",
        "### en",
        "",
        "Where is the button? (1 correct answer)",
        "",
        "- [x] `above`",
        "- [ ] `below`",
        "",
      ].join("\n")
    );
    await input.uploadFile(file);
    await page.waitForSelector(".sl-exam-import-go, .sl-exam-import-problem-list", { timeout: 20000 });
    const problems = await page.$$eval(".sl-exam-import-problem-list li", (items) => items.map((li) => li.textContent));
    assert.deepEqual(problems, [], "the file is accepted");
    assert.ok(
      await page.$eval(".sl-exam-import-go", (button) => Boolean(button.compareDocumentPosition(document.querySelector(".sl-exam-import-preview table")) & Node.DOCUMENT_POSITION_FOLLOWING)),
      "Import stands above the preview table"
    );
  });

  test("a comment's text shows in the sheet when its mark is tapped", async () => {
    const grade = (body) => fetchAs(teacher, `/exam/api/courses/${course.id}/grades/gb-other-student/ws`, { method: "PUT", body });
    assert.equal((await grade({ comment: "came late twice", commentVisible: false })).status, 200);
    try {
      await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=ws`, { waitUntil: "domcontentloaded" });
      const mark = 'tr[data-student="gb-other-student"] .sl-exam-comment-toggle';
      await teacher.page.waitForSelector(mark, { timeout: 20000 });
      assert.equal(await teacher.page.$('tr[data-comment-of="gb-other-student"]'), null);
      await teacher.page.tap(mark);
      assert.equal(await teacher.page.$eval('tr[data-comment-of="gb-other-student"]', (tr) => tr.offsetParent !== null && tr.textContent), "came late twice");
      await teacher.page.tap(mark);
      assert.equal(await teacher.page.$('tr[data-comment-of="gb-other-student"]'), null, "and another tap hides it");
    } finally {
      await grade({ comment: null });
    }
  });

  function database(fn) {
    const { db } = openDatabase(run.databasePath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  test("a request the server answers with an empty 401 - an ended session - loads the page anew, into the login", async () => {
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=ws`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
    const path = `/exam/api/courses/${course.id}/assessments`;
    let refused = 0;
    // The harness leaves the path unanswered (`whileUnanswered`); this answers it as a server whose session ended.
    const endSession = (request) => {
      if (new URL(request.url()).pathname === path && request.method() === "POST") {
        refused++;
        request.respond({ status: 401, body: "" }).catch(() => {});
      }
    };
    page.on("request", endSession);
    try {
      await whileUnanswered(teacher, path, async () => {
        await page.click('button.sl-exam-add[aria-label="Add a column to Homework"]');
        await page.waitForSelector("dialog[open] input[name=name]");
        await page.type("dialog[open] input[name=name]", "After the session");
        await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }), page.click("dialog[open] button[type=submit]")]);
      });
      assert.equal(refused, 1, "the request was answered with 401");
      assert.equal(new URL(page.url()).pathname, `/exam/courses/${course.id}/gradebook`, "the page is loaded anew (with a session, the server serves it again)");
    } finally {
      page.off("request", endSession);
    }
    const left = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json.columns.find((c) => c.name === "After the session");
    assert.equal(left, undefined, "nothing was stored");
  });

  test("the calendar of the new column's date stands out over the dialog, which does not scroll", async () => {
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=ws`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
    await page.click('button.sl-exam-add[aria-label="Add a column to Homework"]');
    await page.waitForSelector("dialog[open] sl-date-input .sl-date-input-toggle");
    await page.click("dialog[open] sl-date-input .sl-date-input-toggle");
    await page.waitForSelector("dialog[open] .sl-date-input-popup:not([hidden]) [role=grid]", { timeout: 5000 });
    const seen = await page.$eval("dialog[open]", (dialog) => {
      const popup = dialog.querySelector(".sl-date-input-popup").getBoundingClientRect();
      const hit = document.elementFromPoint(popup.left + popup.width / 2, popup.bottom - 4);
      return {
        scrolls: dialog.scrollHeight > dialog.clientHeight && getComputedStyle(dialog).overflowY !== "visible",
        inWindow: popup.top >= 0 && popup.bottom <= window.innerHeight,
        reachable: dialog.querySelector(".sl-date-input-popup").contains(hit),
      };
    });
    assert.deepEqual(seen, { scrolls: false, inWindow: true, reachable: true }, "the whole calendar is shown and clickable, without scrolling the dialog");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });

  // ------------------------------------------- missing actions (phase 4)

  /** A test of the pool's questions with a sitting open since `openedAgo` minutes, closing in `closesIn`. */
  async function openSitting(name, { openedAgo = 1, closesIn = 50, minutes = 15 } = {}) {
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name, questionIds: questions.map((q) => q.id) } })).json;
    const sitting = await fetchAs(teacher, `/exam/api/tests/${created.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() - openedAgo * 60000).toISOString(), closesAt: new Date(Date.now() + closesIn * 60000).toISOString(), durationMinutes: minutes },
    });
    assert.equal(sitting.status, 200, JSON.stringify(sitting.json));
    return { test: created, sitting: sitting.json };
  }

  /** The live view of `sitting` on the teacher's page, streaming. */
  async function openLive(sitting) {
    await teacher.page.goto(`${applicationUrl}/exam/sittings/${sitting.id}/live`, { waitUntil: "domcontentloaded" });
    await teacher.page.waitForFunction(() => document.querySelector("sl-exam-live")?.dataset.mode === "stream", { timeout: 20000 });
  }

  /** A countdown's "m:ss" or "h:mm:ss" in seconds. */
  const seconds = (text) => text.split(":").map(Number).reduce((sum, part) => sum * 60 + part, 0);

  test("a course created for the check is renamed and deleted at its head, and the bar follows", async () => {
    const created = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}/courses`, { method: "POST", body: { subject: "ZZx" } })).json;
    const page = teacher.page;
    await page.goto(`${applicationUrl}/exam/courses/${created.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-course-actions .sl-exam-record-rename", { timeout: 20000 });
    await page.click(".sl-exam-course-actions .sl-exam-record-rename");
    await page.$eval(".sl-exam-course-actions input", (input) => {
      input.value = "";
    });
    await page.type(".sl-exam-course-actions input", "ZZ");
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.keyboard.press("Enter")]);
    await page.waitForFunction(() => document.querySelector("#markdown-content h1")?.textContent.startsWith("ZZ –"), { timeout: 20000 });
    assert.equal(await page.$eval('.sl-exam-bar select[data-position="course"]', (select) => select.selectedOptions[0].textContent), "ZZ", "the bar shows the new name");

    await page.waitForSelector(".sl-exam-course-actions .sl-exam-record-delete", { timeout: 20000 });
    await page.click(".sl-exam-course-actions .sl-exam-record-delete");
    assert.match(await page.$eval(".sl-exam-course-actions .sl-exam-record-delete", (b) => b.textContent), /^Click again to delete ZZ/);
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(".sl-exam-course-actions .sl-exam-record-delete")]);
    assert.equal(new URL(page.url()).pathname, `/exam/classes/${gbClass.id}`, "the class page opens");
    assert.equal((await fetchAs(teacher, `/exam/api/courses/${created.id}`)).status, 404, "the course is gone");
  });

  test("deleting a course with a result is refused, with the reason at the button", async () => {
    const created = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}/courses`, { method: "POST", body: { subject: "ZR" } })).json;
    const column = (await fetchAs(teacher, `/exam/api/courses/${created.id}/assessments`, { method: "POST", body: { kind: "test", name: "Kept", date: "2026-10-20", maxPoints: 10 } })).json;
    assert.equal((await fetchAs(teacher, `/exam/api/assessments/${column.id}/results/gb-other-student`, { method: "PUT", body: { points: 4 } })).status, 200);
    const page = teacher.page;
    try {
      await page.goto(`${applicationUrl}/exam/courses/${created.id}`, { waitUntil: "domcontentloaded" });
      const remove = ".sl-exam-course-actions .sl-exam-record-delete";
      await page.waitForSelector(remove, { timeout: 20000 });
      await page.click(remove);
      await page.click(remove);
      await page.waitForFunction(() => document.querySelector(".sl-exam-course-actions .sl-exam-message")?.textContent, { timeout: 10000 });
      assert.match(await page.$eval(".sl-exam-course-actions .sl-exam-message", (el) => el.textContent), /gradebook columns 1, results 1/);
      assert.equal((await fetchAs(teacher, `/exam/api/courses/${created.id}`)).status, 200, "nothing changed");
    } finally {
      await fetchAs(teacher, `/exam/api/assessments/${column.id}`, { method: "DELETE" });
      await fetchAs(teacher, `/exam/api/courses/${created.id}`, { method: "DELETE" });
    }
  });

  test("End now in the live view submits the attempt of a student who is writing", async () => {
    const { test, sitting } = await openSitting("Ended early");
    const started = await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" });
    assert.equal(started.status, 200, JSON.stringify(started.json));
    const row = `sl-exam-live tr[data-username="${student.username.toLowerCase()}"]`;
    await openLive(sitting);
    await teacher.page.waitForSelector(`${row}[data-status="writing"]`, { timeout: 20000 });
    await teacher.page.waitForSelector(".sl-exam-live-end", { visible: true, timeout: 10000 });
    await teacher.page.click(".sl-exam-live-end");
    assert.match(await teacher.page.$eval(".sl-exam-live-end", (b) => b.textContent), /^Click again to end/);
    await teacher.page.click(".sl-exam-live-end");
    await teacher.page.waitForSelector(`${row}[data-status="submitted"]`, { timeout: 15000 });
    assert.ok(database((db) => db.prepare("SELECT submitted_at FROM attempt WHERE id = ?").get(started.json.attempt).submitted_at), "submitted on the server");
  });

  test("Extend in the live view gives a student cut short by the window the longer time", async () => {
    const { test, sitting } = await openSitting("Extended", { openedAgo: 10, closesIn: 3, minutes: 10 });
    assert.equal((await fetchAs(student, `/exam/api/tests/${test.id}/attempt`, { method: "POST" })).status, 200);
    const left = async () => {
      await student.page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
      await student.page.waitForSelector(".sl-exam-countdown", { timeout: 20000 });
      await student.page.waitForFunction(() => /\d:\d\d/.test(document.querySelector(".sl-exam-countdown").textContent), { timeout: 10000 });
      return seconds(await student.page.$eval(".sl-exam-countdown", (el) => el.textContent));
    };
    try {
      const before = await left();
      assert.ok(before <= 3 * 60, `cut short by the window: ${before} s`);
      await openLive(sitting);
      await teacher.page.waitForSelector(".sl-exam-live-extend", { visible: true, timeout: 10000 });
      await teacher.page.$eval(".sl-exam-live-extend-minutes", (input) => {
        input.value = "10";
      });
      await teacher.page.click(".sl-exam-live-extend");
      const until = Date.now() + 10000;
      while ((await fetchAs(teacher, `/exam/api/tests/${test.id}`)).json.sittings[0].closesAt === sitting.closesAt) {
        assert.ok(Date.now() < until, "the extension is stored");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.equal(await teacher.page.$eval(".sl-exam-live-window-message", (el) => el.textContent), "", "no refusal");
      const after = await left();
      assert.ok(after > before + 5 * 60, `the attempt page shows the longer time: ${before} s, then ${after} s`);
    } finally {
      const attempt = database((db) => db.prepare("SELECT id FROM attempt WHERE test_id = ?").get(test.id).id);
      await fetchAs(student, `/exam/api/attempts/${attempt}/submit`, { method: "POST" });
    }
  });

  test("the student page leads to the next and previous student, keeping the semester, and back to the sheet", async () => {
    const page = teacher.page;
    const overview = (await fetchAs(teacher, `/exam/api/courses/${course.id}/gradebook?semester=ws`)).json;
    const [first, second] = overview.students.map((row) => row.username);
    await page.goto(`${applicationUrl}/exam/courses/${course.id}/students/${first}?semester=ws`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sl-exam-student-back", { timeout: 20000 });
    assert.equal(await page.$(".sl-exam-student-previous"), null, "the first has no previous");
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(".sl-exam-student-next")]);
    assert.equal(`${new URL(page.url()).pathname}${new URL(page.url()).search}`, `/exam/courses/${course.id}/students/${second}?semester=ws`);
    await page.waitForSelector(".sl-exam-student-previous", { timeout: 20000 });
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(".sl-exam-student-previous")]);
    assert.equal(new URL(page.url()).pathname, `/exam/courses/${course.id}/students/${first}`);
    await page.waitForSelector(".sl-exam-student-back", { timeout: 20000 });
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(".sl-exam-student-back")]);
    assert.equal(`${new URL(page.url()).pathname}${new URL(page.url()).search}`, `/exam/courses/${course.id}/gradebook?semester=ws`);
  });

  test("an empty roster's gradebook leads to the class's roster", async () => {
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const klass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`, { method: "POST", body: { name: "9xempty", students: [] } })).json;
    const empty = (await fetchAs(teacher, `/exam/api/classes/${klass.id}/courses`, { method: "POST", body: { subject: "LEER" } })).json;
    const page = teacher.page;
    try {
      await page.goto(`${applicationUrl}/exam/courses/${empty.id}/gradebook`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".sl-exam-to-roster", { timeout: 20000 });
      await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(".sl-exam-to-roster")]);
      assert.equal(new URL(page.url()).pathname, `/exam/classes/${klass.id}`);
    } finally {
      assert.equal((await fetchAs(teacher, `/exam/api/courses/${empty.id}`, { method: "DELETE" })).status, 200);
      assert.equal((await fetchAs(teacher, `/exam/api/classes/${klass.id}`, { method: "DELETE" })).status, 200, "a class without courses goes");
    }
  });

});

// The interface in the reader's language and format (`ui-language`,
// `locale-formats`). The demo accounts are shared, so every check here writes
// the preferences it depends on and the block puts both back to the baseline
// (English, de-AT) when it ends, whatever happened.
describe("the interface in the reader's language and format", () => {
  let student;
  let teacher;
  let course;
  let column;
  let questions;

  const catalogs = {
    en: JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "i18n", "en.json"), "utf8")),
    de: JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "i18n", "de.json"), "utf8")),
  };
  /** A text as the catalog of `lang` writes it, parameters left as they are. */
  const text = (lang, key) => key.split(".").reduce((node, segment) => node[segment], catalogs[lang]);

  const gradebookPage = () => `${applicationUrl}/exam/courses/${course.id}/gradebook?semester=ws`;

  /** The gradebook in the teacher's page, once the sheet is drawn. */
  async function openGradebook() {
    await teacher.page.goto(gradebookPage(), { waitUntil: "domcontentloaded" });
    await teacher.page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
  }

  /** The column's date field in the sheet: its value and what its text field shows. */
  const columnDate = () =>
    teacher.page.$eval(`.sl-exam-column-head[data-column="${column.id}"] sl-date-input`, (field) => ({
      value: field.value,
      shown: field.querySelector(".sl-date-input-text").value,
    }));

  /** Focuses the text field at `selector` with its whole text selected, so typing replaces it. */
  async function replaceText(selector) {
    await teacher.page.$eval(selector, (input) => {
      input.focus();
      input.select();
    });
  }

  /** Waits until `condition()` holds, polling for up to ten seconds. */
  async function waitFor(condition, what) {
    const until = Date.now() + 10000;
    while (!(await condition())) {
      if (Date.now() > until) assert.fail(`timed out: ${what}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const storedDate = () => {
    const { db } = openDatabase(run.databasePath);
    try {
      return db.prepare("SELECT held_on FROM assessment WHERE id = ?").get(column.id).held_on;
    } finally {
      db.close();
    }
  };

  before(async () => {
    student = await sharedSession("student");
    teacher = await sharedSession("teacher");
    for (const session of [student, teacher]) await reauthenticate(session).catch(() => {});
    await setPreferences(student, {});
    await setPreferences(teacher, {});
    const year = (await fetchAs(teacher, "/exam/api/years")).json.current;
    const gbClass = (await fetchAs(teacher, `/exam/api/years/${year.id}/classes`)).json.find((c) => c.name === "9xgb");
    course = (await fetchAs(teacher, `/exam/api/classes/${gbClass.id}`)).json.courses.find((c) => c.subject === "GB");
    assert.equal(course.language, "de", "the GB course is German, so a student's English is not the course's");
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/assessments`, {
      method: "POST",
      body: { kind: "test", name: "Language check", date: "2026-10-20", maxPoints: 10 },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    column = created.json;
    questions = (await fetchAs(teacher, "/exam/api/pool/questions")).json;
  });

  after(async () => {
    await setPreferences(teacher, {}).catch(() => {});
    await setPreferences(student, {}).catch(() => {});
    await fetchAs(teacher, `/exam/api/assessments/${column.id}`, { method: "DELETE" }).catch(() => {});
  });

  test("a teacher with German sees German in the menu, the sidebar, the bar and the gradebook", async () => {
    await setPreferences(teacher, { lang: "de" });
    await openGradebook();
    const shown = await teacher.page.evaluate(() => ({
      lang: document.documentElement.lang,
      site: document.querySelector(".sidebar-title-dirlist b")?.textContent.trim(),
      search: document.querySelector(".sidebar-title-search b")?.textContent.trim(),
      choices: [...document.querySelectorAll(".sl-menu-choice-label")].map((label) => label.textContent.trim()),
      pressed: [...document.querySelectorAll(".sl-menu-choice [aria-pressed='true']")].map((button) => button.textContent.trim()),
      tests: document.querySelector(".sl-exam-bar-page[data-page='tests']")?.textContent.trim(),
      categories: [...document.querySelectorAll(".sl-exam-sheet .sl-exam-category")].map((cell) => cell.textContent.trim()),
    }));
    assert.equal(shown.lang, "de", "the page declares German as its language");
    assert.equal(shown.site, text("de", "app.sidebar.site"));
    assert.equal(shown.search, text("de", "app.sidebar.search"));
    assert.deepEqual(shown.choices, [text("de", "app.menu.language"), text("de", "app.menu.format")]);
    assert.deepEqual(shown.pressed, ["Deutsch", "20.10.2026"], "the menu marks the language and the format in effect");
    assert.equal(shown.tests, text("de", "exam.bar.tests"));
    assert.ok(
      shown.categories.some((cell) => cell.startsWith(text("de", "exam.categories.onlineTests"))),
      `the sheet's categories are German: ${shown.categories.join(" | ")}`
    );
  });

  test("English with de-AT gives English labels and 20.10.2026, en-GB gives 20/10/2026", async () => {
    await setPreferences(teacher, { lang: "en", loc: "de-AT" });
    await openGradebook();
    assert.equal(await teacher.page.evaluate(() => document.documentElement.lang), "en");
    assert.equal(await teacher.page.$eval(".sl-exam-bar-page[data-page='tests']", (a) => a.textContent.trim()), "Online tests");
    assert.deepEqual(await columnDate(), { value: "2026-10-20", shown: "20.10.2026" });

    await setPreferences(teacher, { loc: "en-GB" });
    await openGradebook();
    assert.deepEqual(await columnDate(), { value: "2026-10-20", shown: "20/10/2026" });
    assert.deepEqual(
      await teacher.page.$$eval(".sl-menu-choice [aria-pressed='true']", (buttons) => buttons.map((button) => button.textContent.trim())),
      ["English", "20/10/2026"]
    );
  });

  test("a date is entered by typing, by the keyboard in the calendar, and an unreadable one is refused at the field", async () => {
    await setPreferences(teacher, { lang: "en", loc: "de-AT" });
    await openGradebook();
    const field = `.sl-exam-column-head[data-column="${column.id}"] sl-date-input`;
    const typed = `${field} .sl-date-input-text`;

    await replaceText(typed);
    await teacher.page.keyboard.type("21.10.2026");
    await teacher.page.keyboard.press("Tab");
    await waitFor(() => storedDate() === "2026-10-21", "the typed date is saved");
    // A new date redraws the sheet; the field is found anew once it shows it.
    await waitFor(async () => (await columnDate().catch(() => null))?.shown === "21.10.2026", "the sheet shows the saved date");

    await teacher.page.focus(`${field} .sl-date-input-toggle`);
    await teacher.page.keyboard.press("Enter");
    await teacher.page.waitForSelector(`${field} .sl-date-input-popup:not([hidden]) [role=grid]`, { timeout: 5000 });
    assert.equal(
      await teacher.page.evaluate(() => document.activeElement?.dataset.day),
      "2026-10-21",
      "the calendar opens on the field's date, with the focus on it"
    );
    await teacher.page.keyboard.press("ArrowRight");
    await teacher.page.keyboard.press("ArrowDown");
    assert.equal(await teacher.page.evaluate(() => document.activeElement?.dataset.day), "2026-10-29", "a day right, a week down");
    await teacher.page.keyboard.press("Enter");
    await waitFor(() => storedDate() === "2026-10-29", "Enter takes the focused day and it is saved");
    await waitFor(async () => (await columnDate().catch(() => null))?.shown === "29.10.2026", "the sheet shows the picked date");

    await replaceText(typed);
    await teacher.page.keyboard.type("32.10.2026");
    await teacher.page.keyboard.press("Tab");
    const refused = await teacher.page.$eval(field, (element) => ({
      invalid: element.classList.contains("is-invalid"),
      message: element.querySelector(".sl-date-input-message").textContent,
      ariaInvalid: element.querySelector(".sl-date-input-text").getAttribute("aria-invalid"),
    }));
    assert.equal(refused.invalid, true);
    assert.equal(refused.ariaInvalid, "true");
    assert.match(refused.message, /20\.10\.2026/, "the reason beside the field shows the format");
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(storedDate(), "2026-10-29", "nothing is saved");

    // Back to the column's own date, for anything after this.
    await fetchAs(teacher, `/exam/api/assessments/${column.id}`, { method: "PUT", body: { date: "2026-10-20" } });
  });

  test("a student with English writes a German course's test: German content, English controls", async () => {
    await setPreferences(student, { lang: "en" });
    const created = await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, {
      method: "POST",
      body: { name: "Language: student", questionIds: questions.slice(0, 2).map((q) => q.id) },
    });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const sitting = await fetchAs(teacher, `/exam/api/tests/${created.json.id}/sittings`, {
      method: "POST",
      body: { opensAt: new Date(Date.now() - 60000).toISOString(), closesAt: new Date(Date.now() + 50 * 60000).toISOString(), durationMinutes: 15 },
    });
    assert.equal(sitting.status, 200, JSON.stringify(sitting.json));
    // A running attempt left by an earlier check would be resumed in place of
    // the list, so it is submitted first.
    for (const open of (await fetchAs(student, "/exam/api/my/tests")).json.tests) {
      if (open.attempt) await fetchAs(student, `/exam/api/attempts/${open.attempt.attemptId}/submit`, { method: "POST" });
    }
    const page = student.page;
    await page.goto(`${applicationUrl}/exam/my`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`.sl-exam-attempt-open[data-test="${created.json.id}"] button`, { timeout: 20000 });
    await page.click(`.sl-exam-attempt-open[data-test="${created.json.id}"] button`);
    await page.waitForSelector(".sl-exam-attempt-question", { timeout: 20000 });
    const shown = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      content: [...document.querySelectorAll(".sl-exam-attempt-content")].map((element) => element.getAttribute("lang")),
      submit: document.querySelector(".sl-exam-attempt-submit")?.textContent.trim(),
    }));
    assert.equal(shown.lang, "en", "the page is the student's English");
    assert.ok(shown.content.length > 0 && shown.content.every((lang) => lang === "de"), `the questions are the course's German: ${shown.content}`);
    assert.equal(shown.submit, text("en", "exam.attempt.submit"), "the controls are English");
    const attempt = (await fetchAs(student, `/exam/api/tests/${created.json.id}/attempt`, { method: "POST" })).json.attempt;
    await fetchAs(student, `/exam/api/attempts/${attempt}/submit`, { method: "POST" });
  });

  test("the bar and the gradebook's heading name the gradebook and the whole year alike, in English and in German", async () => {
    for (const lang of ["en", "de"]) {
      await setPreferences(teacher, { lang });
      await teacher.page.goto(`${applicationUrl}/exam/courses/${course.id}/gradebook?semester=ss`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(".sl-exam-sheet", { timeout: 20000 });
      const shown = await teacher.page.evaluate(() => {
        const position = document.querySelector('.sl-exam-bar-position[data-position="gradebook"]');
        return {
          bar: position.querySelector("a, span").textContent.trim(),
          chosen: position.querySelector("select").selectedOptions[0].textContent.trim(),
          heading: document.querySelector("#markdown-content h1").textContent.trim(),
        };
      });
      assert.equal(shown.bar, text(lang, "exam.pages.gradebook"), `${lang}: the bar names the gradebook as its page does`);
      assert.equal(shown.chosen, text(lang, "exam.bar.wholeYear"), `${lang}: the bar chooses the whole year`);
      assert.ok(shown.heading.startsWith(`${shown.bar} – `) && shown.heading.endsWith(` – ${shown.chosen}`), `${lang}: the heading uses the bar's names: ${shown.heading}`);
    }
  });

  test("an English test head names a German course's language as German", async () => {
    await setPreferences(teacher, { lang: "en" });
    const created = (await fetchAs(teacher, `/exam/api/courses/${course.id}/tests`, { method: "POST", body: { name: "Language: head", questionIds: questions.slice(0, 1).map((q) => q.id) } })).json;
    try {
      await teacher.page.goto(`${applicationUrl}/exam/tests/${created.id}`, { waitUntil: "domcontentloaded" });
      await teacher.page.waitForSelector(".sl-exam-test-head", { timeout: 20000 });
      const head = await teacher.page.$eval(".sl-exam-test-head", (p) => p.textContent);
      assert.ok(head.includes(` · ${text("en", "exam.classes.languageGerman")} · `), `the head says German: ${head}`);
      assert.ok(!head.includes("Deutsch"), "and not Deutsch");
    } finally {
      await fetchAs(teacher, `/exam/api/tests/${created.id}`, { method: "DELETE" });
    }
  });

  test("in German at the legibility viewport, the module bar and the gradebook's headings fit", async () => {
    await setPreferences(teacher, { lang: "de" });
    const before = teacher.page.viewport();
    await teacher.page.setViewport({ width: 390, height: 844 });
    try {
      await openGradebook();
      const overflow = await teacher.page.evaluate(() => {
        const over = (element) => element.scrollWidth > element.clientWidth + 1;
        return {
          page: document.documentElement.scrollWidth > window.innerWidth + 1,
          bar: [...document.querySelectorAll(".sl-exam-bar, .sl-exam-bar-position, .sl-exam-bar-page")].filter(over).map((el) => el.textContent.trim().slice(0, 40)),
          heads: [...document.querySelectorAll(".sl-exam-sheet thead th")].filter(over).map((el) => el.textContent.trim().slice(0, 40)),
        };
      });
      assert.deepEqual(overflow, { page: false, bar: [], heads: [] }, "nothing of the German bar or sheet heading runs out of its box");
    } finally {
      await teacher.page.setViewport(before ?? { width: 1280, height: 800 });
    }
  });
});
