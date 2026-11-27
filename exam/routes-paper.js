/**
 * The routes of the tests on paper composed from the pool
 * (`offline-test-questions`, pool-quickie design D6, D8) and of the weights of
 * every test's questions (design D1): a question's weight and answer lines,
 * the correction table and its grades, and the printed sheet and solution of
 * each group from the test's page and from a sitting's page.
 *
 * Every one of them is a teacher's: the API refuses any other session with
 * 403, and the print pages are behind `teacherPage`, which a teacher in
 * student view does not pass - nothing of a sheet reaches a student.
 */

import { NotFoundError } from "./classes.js";
import { holdsStudentImages, requireTeacher, teacherPage } from "./gate.js";
import { withPhotoVersions } from "./photos.js";
import { readScale } from "./gradebook.js";
import { correctionTable, setQuestionGrade } from "./paper-grades.js";
import { getTest, hasTwoGroups, isPaper, setQuestionSettings, sheetDate } from "./tests.js";
import { wrapAsDocument } from "../obsidian.js";
import { i18nFor, i18nOf } from "../i18n/server.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * The sheet or the solution of group `group` of the test on paper `test` (a
 * `getTest` answer) as HTML, in the course's language (design D6): the head
 * with name, class, date and - for two groups - the group, a line for the
 * student's name, and the group's questions numbered from 1 with their
 * weights. A choice question shows its answers with a box each, ticked in the
 * solution where correct; a free-text question its empty lines, or its model
 * solution in the solution. The texts are the copy's, sanitized HTML.
 */
export function sheetHtml(test, group, { date, twoGroups, solution }) {
  const language = test.course.language === "en" ? "en" : "de";
  const { t } = i18nFor(language, language === "en" ? "en-GB" : "de-AT");
  const text = language === "en" ? "textEn" : "textDe";
  const model = language === "en" ? "solutionEn" : "solutionDe";
  const questions = test.questions.filter((question) => question.group === group);
  const meta = [test.course.className.toUpperCase(), date, twoGroups ? t("exam.paper.sheet.group", { group }) : null].filter(Boolean);
  const items = questions.map((question, index) => {
    const head = `<div class="sl-paper-question-head"><span>${escapeText(t("exam.paper.sheet.question", { n: index + 1 }))}</span><span class="sl-paper-weight">${escapeText(
      t("exam.paper.sheet.weight", { weight: question.weight })
    )}</span></div>`;
    let body;
    if (question.type === "freetext") {
      body = solution
        ? `<div class="sl-paper-model"><p class="sl-paper-model-label">${escapeText(t("exam.paper.sheet.modelSolution"))}</p>${question[model] ?? ""}</div>`
        : `<div class="sl-paper-lines" aria-label="${escapeText(t("exam.paper.sheet.answerSpace"))}">${'<div class="sl-paper-line"></div>'.repeat(question.answerLines)}</div>`;
    } else {
      body = `<ul class="sl-paper-answers">${question.answers
        .map((answer) => {
          const ticked = solution && answer.correct;
          const label = ticked ? t("exam.paper.sheet.ticked") : t("exam.paper.sheet.box");
          return `<li${ticked ? ' class="sl-paper-ticked"' : ""}><span class="sl-paper-box" role="img" aria-label="${escapeText(label)}">${ticked ? "☒" : "☐"}</span><div>${answer[text]}</div></li>`;
        })
        .join("")}</ul>`;
    }
    return `<li class="sl-paper-question" data-question="${index + 1}">${head}<div class="sl-paper-text">${question[text]}</div>${body}</li>`;
  });
  return `
    <div class="sl-paper-sheet${solution ? " sl-paper-solution" : ""}" lang="${language}">
      <header class="sl-paper-header">
        <h1>${escapeText(test.name)}${solution ? ` · ${escapeText(t("exam.paper.sheet.solution"))}` : ""}</h1>
        <p class="sl-paper-meta">${meta.map(escapeText).join(" · ")}</p>
        ${solution ? "" : `<p class="sl-paper-name">${escapeText(t("exam.paper.sheet.name"))} <span class="sl-paper-name-line"></span></p>`}
      </header>
      <ol class="sl-paper-questions">${items.join("")}</ol>
    </div>`;
}

export function registerPaperRoutes(router, { db, handle }) {
  const api = (method, path, fn) =>
    router[method](
      `/api${path}`,
      requireTeacher,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  // A question's weight (every test) and answer lines (a free-text question on paper).
  api("put", "/tests/:id/questions/:testQuestion", (req) => {
    const { weight, answerLines } = req.body ?? {};
    return setQuestionSettings(db, idParam(req.params.id), idParam(req.params.testQuestion), { weight, answerLines });
  });
  // The correction table of a test on paper, and one grade of it; `grade` null removes it.
  // Each row carries its photo's version only for a session holding `student-images` (student-photos D2).
  api("get", "/tests/:id/grades", async (req) => {
    const table = correctionTable(db, idParam(req.params.id), readScale(db));
    return (await holdsStudentImages(req)) ? { ...table, rows: withPhotoVersions(db, table.rows) } : table;
  });
  api("put", "/tests/:id/grades/:testQuestion/:username", (req) =>
    setQuestionGrade(db, idParam(req.params.id), idParam(req.params.testQuestion), req.params.username, req.body?.grade ?? null, readScale(db))
  );

  /**
   * The test on paper `testId` and whether its group `group` can be printed:
   * group A always, group B while the test has two groups. Anything else is
   * not found.
   */
  const paperGroup = (testId, group) => {
    const row = db.prepare("SELECT * FROM test WHERE id = ?").get(testId);
    if (!row || !isPaper(row)) throw new NotFoundError("exam.errors.tests.noTest");
    const twoGroups = hasTwoGroups(db, row);
    if (group !== "A" && !(group === "B" && twoGroups)) throw new NotFoundError("exam.errors.paper.noGroup");
    return { row, twoGroups };
  };

  const printed = async (req, res, { testId, group, sitting, solution }) => {
    const { twoGroups } = paperGroup(testId, group);
    const test = getTest(db, testId);
    const html = sheetHtml(test, group, { date: sheetDate(db, testId, sitting), twoGroups, solution });
    const { t } = await i18nOf(req);
    const title = solution ? t("exam.paper.solutionTitle", { name: test.name, group }) : t("exam.paper.sheetTitle", { name: test.name, group });
    res.send(await wrapAsDocument(html, req, { title }));
  };

  for (const solution of [false, true]) {
    const suffix = solution ? "solution/print" : "print";
    // From the test's page: the date of its first started, otherwise first planned sitting.
    router.get(
      `/tests/:id/sheets/:group/${suffix}`,
      teacherPage,
      handle(async (req, res) => {
        await printed(req, res, { testId: idParam(req.params.id), group: req.params.group, sitting: undefined, solution });
      })
    );
    // From a sitting's page: that sitting's date, so a make-up prints its own day.
    router.get(
      `/sittings/:id/sheets/:group/${suffix}`,
      teacherPage,
      handle(async (req, res) => {
        const sitting = db.prepare("SELECT * FROM sitting WHERE id = ?").get(idParam(req.params.id));
        if (!sitting) throw new NotFoundError("exam.errors.tests.noSitting");
        await printed(req, res, { testId: sitting.test_id, group: req.params.group, sitting, solution });
      })
    );
  }
}
