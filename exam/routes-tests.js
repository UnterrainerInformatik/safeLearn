/**
 * The routes of the online tests (`online-test`) as teachers use them: the
 * list of a course's or a school year's tests, a test with its snapshot, its
 * sittings, and releasing an attempt to another browser.
 * Every one of them is a teacher's: the API refuses any other session with
 * 403, and the pages are not there for it (`gate.js`).
 */

import { createSitting, createTest, deleteSitting, deleteTest, getTest, listTests, updateSitting, updateTest } from "./tests.js";
import { correctShares, previewView, releaseAttempt } from "./attempts.js";
import { embedPlaceholder, wrapInPage, wrapInReveal } from "../obsidian.js";
import { NotFoundError } from "./classes.js";
import { requireTeacher, teacherPage } from "./gate.js";
import { contextFromQuery, teacherShell } from "./bar.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("There is no such record.");
  return id;
}

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * The board solution's slides (`board-solution`, design D11): a title slide,
 * then one per question in the test's own order and the course's language,
 * the correct answers marked and the share of submitted attempts that got the
 * question right - a number, never a name. Without a submitted attempt the
 * share is left out. The texts are the snapshot's, sanitized when imported.
 */
function solutionSlides(test, shares) {
  const en = test.course.language === "en";
  const text = en ? "textEn" : "textDe";
  const title = `
    <section class="sl-board-title">
      <h1>${escapeText(test.name)}</h1>
      <p>${escapeText(test.course.className.toUpperCase())} ${escapeText(test.course.subject)} · ${escapeText(test.course.yearName)}</p>
      <p>${en ? "Solution" : "Lösung"}${
        shares.submitted > 0 ? ` · ${shares.submitted} ${en ? (shares.submitted === 1 ? "attempt" : "attempts") : shares.submitted === 1 ? "Abgabe" : "Abgaben"}` : ""
      }</p>
    </section>`;
  const slides = test.questions.map((question, index) => {
    const correct = shares.correct.get(question.id) ?? 0;
    const share =
      shares.submitted > 0
        ? `<p class="sl-board-share">${en ? "Answered correctly" : "Richtig beantwortet"}: ${Math.round((100 * correct) / shares.submitted)} %</p>`
        : "";
    const answers = question.answers
      .map(
        (answer) =>
          `<li class="${answer.correct ? "sl-board-correct" : "sl-board-wrong"}"><span class="sl-board-mark" aria-label="${
            answer.correct ? (en ? "correct" : "richtig") : en ? "wrong" : "falsch"
          }">${answer.correct ? "✓" : "✗"}</span><div>${answer[text]}</div></li>`
      )
      .join("");
    return `
    <section class="sl-board-question" data-question="${index + 1}">
      <h3>${en ? "Question" : "Frage"} ${index + 1}</h3>
      <div class="sl-board-text">${question[text]}</div>
      <ul class="sl-board-answers">${answers}</ul>
      ${share}
    </section>`;
  });
  return title + slides.join("");
}

export function registerTestRoutes(router, { db, handle, startPage }) {
  const api = (method, path, fn) =>
    router[method](
      `/api${path}`,
      requireTeacher,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  api("get", "/tests", (req) => listTests(db, contextFromQuery(req.query)));
  api("post", "/courses/:id/tests", (req) => createTest(db, idParam(req.params.id), req.body ?? {}));
  api("get", "/tests/:id", (req) => getTest(db, idParam(req.params.id)));
  api("put", "/tests/:id", (req) => updateTest(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/tests/:id", (req) => deleteTest(db, idParam(req.params.id)));
  api("post", "/tests/:id/sittings", (req) => createSitting(db, idParam(req.params.id), req.body ?? {}));
  api("put", "/sittings/:id", (req) => updateSitting(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/sittings/:id", (req) => deleteSitting(db, idParam(req.params.id)));
  api("post", "/attempts/:id/release", (req) => releaseAttempt(db, idParam(req.params.id)));
  api("get", "/tests/:id/preview", (req) => previewView(db, idParam(req.params.id)));

  // The list the bar's "Online tests" button opens: the chosen course's tests,
  // or the school year's when no course is chosen.
  router.get(
    "/tests",
    teacherPage,
    handle(async (req, res) => {
      const context = contextFromQuery(req.query);
      const params = {};
      if (context.courseId !== null) params.course = String(context.courseId);
      else if (context.classId !== null) params.class = String(context.classId);
      else if (context.yearId !== null) params.year = String(context.yearId);
      res.send(await teacherShell({ db, startPage, req, title: "Online tests", context, kind: "tests", params, current: "tests" }));
    })
  );

  router.get(
    "/tests/:id",
    teacherPage,
    handle(async (req, res) => {
      const test = getTest(db, idParam(req.params.id));
      res.send(
        await teacherShell({
          db,
          startPage,
          req,
          title: test.name,
          context: { courseId: test.course.id },
          kind: "test-detail",
          params: { test: String(test.id) },
          current: "tests",
        })
      );
    })
  );

  // The solution on the board, as a deck in the presentation view. Teachers
  // only; anyone else lands where a path with nothing behind it lands.
  router.get(
    "/tests/:id/solution",
    teacherPage,
    handle(async (req, res) => {
      const test = getTest(db, idParam(req.params.id));
      const slides = solutionSlides(test, correctShares(db, test.id));
      res.send(await wrapInReveal(slides, req, { title: `${test.name} – Solution` }));
    })
  );

  // A teacher trying a test as a student would see it, in a window of its
  // own and without the bar. The element saves and submits nothing.
  router.get(
    "/tests/:id/preview",
    teacherPage,
    handle(async (req, res) => {
      const test = getTest(db, idParam(req.params.id));
      const title = `Try: ${test.name}`;
      const body = `
        <h1>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</h1>
        ${embedPlaceholder("test", { test: String(test.id), preview: "1" })}`;
      res.send(await wrapInPage(body, startPage(), req, { title, wide: true }));
    })
  );
}
