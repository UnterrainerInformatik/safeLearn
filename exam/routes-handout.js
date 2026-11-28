/**
 * The routes of the offline tests' handouts (`exam-handout`, exam-offline-
 * sittings design D5, D6): the participant's handout during the window, the
 * teacher's preview and solution page, their printed documents from the
 * test's page and from a sitting's page (print-offline-handout), and the
 * corpus list the teacher's picker is built from.
 *
 * The participant's page is authorized from the database at every request -
 * open, participant, present, group, resolving path - before the file is
 * read, and every refusal lands where a path with nothing behind it lands, so
 * it names neither the file nor the reason. The teacher's pages are behind
 * `teacherPage`, which a teacher in student view does not pass, and a test of a
 * class the teacher is not entered in is answered as one without a handout
 * (`class-teachers`).
 */

import { ConflictError, getCourse, NotFoundError, visibleRecord } from "./classes.js";
import { classScope, identityOf, requireTeacher, teacherPage } from "./gate.js";
import { corpusFiles, handoutResolves, hasSolution, servableHandout } from "./handout.js";
import { printBlockers, variablesFor } from "./tests.js";
import { embedPlaceholder, wrapAsDocument, wrapInPage } from "../obsidian.js";
import { i18nOf } from "../i18n/server.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

/** The handout path of group `group` of the offline test `id`, resolving; otherwise not found. */
function teacherHandout(db, id, group) {
  return handoutOfTest(db, idParam(id), group);
}

/** The test row with the id `testId` and the resolving path of its handout `group`; otherwise not found. */
function handoutOfTest(db, testId, group) {
  const test = db.prepare("SELECT * FROM test WHERE id = ?").get(testId);
  const corpusPath = !test || test.kind !== "offline" ? null : group === "A" ? test.handout_a : group === "B" ? test.handout_b : null;
  if (!handoutResolves(corpusPath)) throw new NotFoundError("exam.errors.handouts.none");
  return { test, path: corpusPath };
}

export function registerHandoutRoutes(router, { db, handle, startPage, renderHandout }) {
  // The id of a record of `kind` from the path, refused as missing outside the request's scope.
  const seen = async (req, kind, value) => visibleRecord(db, await classScope(db, req), kind, idParam(value));

  /**
   * Renders a handout, a file that could not be read answered as not found:
   * it was removed between the check and the read.
   */
  const rendered = async (corpusPath, req, options) => {
    try {
      return await renderHandout(corpusPath, req, options);
    } catch (error) {
      if (error?.code === "ENOENT") throw new NotFoundError("exam.errors.handouts.none");
      throw error;
    }
  };

  // The participant's handout, while their sitting is open and they are
  // marked present: the file of their group, rendered for them as a student
  // with the public variant shown and the private variant and the optional blocks hidden. Its element replaces the content with a
  // notice when the sitting leaves their open tests (design D6).
  router.get(
    "/my/sittings/:id/handout",
    (req, res, next) => (identityOf(req) ? next() : next("router")),
    handle(async (req, res) => {
      const sittingId = idParam(req.params.id);
      const handout = servableHandout(db, identityOf(req), sittingId);
      if (!handout) throw new NotFoundError("exam.errors.handouts.none");
      const html = await rendered(handout.path, req, { variantPrivate: false, optional: false, vars: variablesFor(db, handout.testId, sittingId) });
      const { t } = await i18nOf(req);
      const body = `
        ${embedPlaceholder("handout-watch", { sitting: String(sittingId) }, "")}
        <div class="sl-exam-handout" data-sitting="${sittingId}">${html}</div>`;
      res.send(await wrapInPage(body, startPage(), req, { title: t("exam.handouts.pageTitle", { name: handout.name }) }));
    })
  );

  // The teacher's preview: exactly what a participant of that group is shown.
  router.get(
    "/tests/:id/handouts/:group/preview",
    teacherPage,
    handle(async (req, res) => {
      const { test, path: corpusPath } = teacherHandout(db, String(await seen(req, "test", req.params.id)), req.params.group);
      const html = await rendered(corpusPath, req, { variantPrivate: false, optional: false, vars: variablesFor(db, test.id) });
      const { t } = await i18nOf(req);
      const body = `<div class="sl-exam-handout">${html}</div>`;
      res.send(await wrapInPage(body, startPage(), req, { title: t("exam.handouts.previewTitle", { name: test.name, group: req.params.group }) }));
    })
  );

  // The solution page: the handout as a page of running text with its private
  // variant and optional blocks shown and its public variant hidden, no student's
  // name and no result in it. A handout is prose, not slides, so it is no deck.
  router.get(
    "/tests/:id/handouts/:group/solution",
    teacherPage,
    handle(async (req, res) => {
      const { test, path: corpusPath } = teacherHandout(db, String(await seen(req, "test", req.params.id)), req.params.group);
      const html = await rendered(corpusPath, req, { variantPrivate: true, optional: true, vars: variablesFor(db, test.id) });
      const { t } = await i18nOf(req);
      const body = `<div class="sl-exam-handout sl-exam-handout-solution-page">${html}</div>`;
      res.send(await wrapInPage(body, startPage(), req, { title: t("exam.handouts.solutionTitle", { name: test.name, group: req.params.group }) }));
    })
  );

  /**
   * A printed handout or solution (print-offline-handout design D1, D2): what
   * the preview or the solution page shows, its variables filled, wrapped as
   * the print view with no top bar and no navigation. `sitting` is the sitting
   * whose date `DATE` is, or undefined for the test's page, which takes the
   * preview's. Refused, naming them, while one of the handout's variables has
   * no value; the solution's print of a handout without a solution is not found.
   */
  const printed = async (req, res, { test, corpusPath, group, sitting, solution }) => {
    if (solution && !hasSolution(corpusPath)) throw new NotFoundError("exam.errors.handouts.none");
    const names = printBlockers(db, test, group, sitting);
    if (names.length > 0) throw new ConflictError("exam.errors.handouts.printVariablesMissing", { names: names.join(", ") });
    const html = await rendered(corpusPath, req, { variantPrivate: solution, optional: solution, vars: variablesFor(db, test.id, sitting?.id ?? null) });
    const { t } = await i18nOf(req);
    const title = solution ? t("exam.handouts.solutionTitle", { name: test.name, group }) : t("exam.handouts.previewTitle", { name: test.name, group });
    const body = `<div class="sl-exam-handout${solution ? " sl-exam-handout-solution-page" : ""}">${html}</div>`;
    res.send(await wrapAsDocument(body, req, { title }));
  };

  /** The sitting `id` of an offline test, its test and the resolving path of the handout `group`; otherwise not found. */
  const sittingHandout = (id, group) => {
    const sitting = db.prepare("SELECT * FROM sitting WHERE id = ?").get(idParam(id));
    if (!sitting) throw new NotFoundError("exam.errors.tests.noSitting");
    return { sitting, ...handoutOfTest(db, sitting.test_id, group) };
  };

  for (const solution of [false, true]) {
    const suffix = solution ? "solution/print" : "print";
    // From the test's page: DATE as in the preview.
    router.get(
      `/tests/:id/handouts/:group/${suffix}`,
      teacherPage,
      handle(async (req, res) => {
        const { test, path: corpusPath } = teacherHandout(db, String(await seen(req, "test", req.params.id)), req.params.group);
        await printed(req, res, { test, corpusPath, group: req.params.group, sitting: undefined, solution });
      })
    );
    // From a sitting's page: DATE of that sitting, so a make-up prints its own day.
    router.get(
      `/sittings/:id/handouts/:group/${suffix}`,
      teacherPage,
      handle(async (req, res) => {
        const { sitting, test, path: corpusPath } = sittingHandout(String(await seen(req, "sitting", req.params.id)), req.params.group);
        await printed(req, res, { test, corpusPath, group: req.params.group, sitting, solution });
      })
    );
  }

  // Every Markdown file of the corpus for the picker, each flagged when the
  // course's class can read it already (design D5).
  router.get(
    "/api/courses/:id/handout-files",
    requireTeacher,
    handle(async (req, res) => {
      const course = getCourse(db, await seen(req, "course", req.params.id));
      res.json({ files: corpusFiles(course.className) });
    })
  );
}
