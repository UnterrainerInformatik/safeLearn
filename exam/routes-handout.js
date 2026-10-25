/**
 * The routes of the offline tests' handouts (`exam-handout`, exam-offline-
 * sittings design D5, D6): the participant's handout during the window, the
 * teacher's preview and solution deck, and the corpus list the teacher's
 * picker is built from.
 *
 * The participant's page is authorized from the database at every request -
 * open, participant, present, group, resolving path - before the file is
 * read, and every refusal lands where a path with nothing behind it lands, so
 * it names neither the file nor the reason. The teacher's pages are behind
 * `teacherPage`, which a teacher in student view does not pass.
 */

import { getCourse, NotFoundError } from "./classes.js";
import { identityOf, requireTeacher, teacherPage } from "./gate.js";
import { corpusFiles, handoutResolves, servableHandout } from "./handout.js";
import { embedPlaceholder, splitForReveal, wrapInPage, wrapInReveal } from "../obsidian.js";
import { i18nOf } from "../i18n/server.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

/** The handout path of group `group` of the offline test `id`, resolving; otherwise not found. */
function teacherHandout(db, id, group) {
  const test = db.prepare("SELECT id, name, kind, handout_a, handout_b FROM test WHERE id = ?").get(idParam(id));
  const corpusPath = !test || test.kind !== "offline" ? null : group === "A" ? test.handout_a : group === "B" ? test.handout_b : null;
  if (!handoutResolves(corpusPath)) throw new NotFoundError("exam.errors.handouts.none");
  return { test, path: corpusPath };
}

export function registerHandoutRoutes(router, { db, handle, startPage, renderHandout }) {
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
  // with the exam variant shown. Its element replaces the content with a
  // notice when the sitting leaves their open tests (design D6).
  router.get(
    "/my/sittings/:id/handout",
    (req, res, next) => (identityOf(req) ? next() : next("router")),
    handle(async (req, res) => {
      const sittingId = idParam(req.params.id);
      const handout = servableHandout(db, identityOf(req), sittingId);
      if (!handout) throw new NotFoundError("exam.errors.handouts.none");
      const html = await rendered(handout.path, req, { answer: false });
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
      const { test, path: corpusPath } = teacherHandout(db, req.params.id, req.params.group);
      const html = await rendered(corpusPath, req, { answer: false });
      const { t } = await i18nOf(req);
      const body = `<div class="sl-exam-handout">${html}</div>`;
      res.send(await wrapInPage(body, startPage(), req, { title: t("exam.handouts.previewTitle", { name: test.name, group: req.params.group }) }));
    })
  );

  // The solution deck: the handout as a presentation with its answers shown,
  // no student's name and no result in it.
  router.get(
    "/tests/:id/handouts/:group/solution",
    teacherPage,
    handle(async (req, res) => {
      const { test, path: corpusPath } = teacherHandout(db, req.params.id, req.params.group);
      const html = await rendered(corpusPath, req, { answer: true });
      const { t } = await i18nOf(req);
      res.send(await wrapInReveal(splitForReveal(html), req, { title: t("exam.handouts.solutionTitle", { name: test.name, group: req.params.group }) }));
    })
  );

  // Every Markdown file of the corpus for the picker, each flagged when the
  // course's class can read it already (design D5).
  router.get(
    "/api/courses/:id/handout-files",
    requireTeacher,
    handle(async (req, res) => {
      const course = getCourse(db, idParam(req.params.id));
      res.json({ files: corpusFiles(course.className) });
    })
  );
}
