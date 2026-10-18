/**
 * The routes of the question pool (`question-pool`): the browser's page and
 * its API, which are a teacher's alone - a student, or a teacher in student
 * view, gets 403 from the API and nothing from the page (`gate.js`) - and the
 * image route, which also answers a student inside an open attempt containing
 * the image.
 */

import { categoryTree, getQuestion, listQuestions, readImage, studentMaySeeImage } from "./pool.js";
import { NotFoundError } from "./classes.js";
import { actsAsTeacher, identityOf, requireTeacher, teacherPage } from "./gate.js";
import { contextFromQuery, teacherShell } from "./bar.js";

/** A record id from the path or query; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

export function registerPoolRoutes(router, { db, handle, startPage }) {
  const api = (method, path, fn) =>
    router[method](
      `/api${path}`,
      requireTeacher,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  api("get", "/pool/categories", () => categoryTree(db));
  api("get", "/pool/questions", (req) =>
    listQuestions(db, {
      categoryId: req.query.category ? idParam(String(req.query.category)) : null,
      query: typeof req.query.q === "string" ? req.query.q : "",
      includeRetired: req.query.retired === "1",
      onlyUnreviewed: req.query.unreviewed === "1",
    })
  );
  api("get", "/pool/questions/:id", (req) => getQuestion(db, idParam(req.params.id)));

  // An image of a question. A session that may not see it is refused the same
  // way whether the image exists or not, so the route tells a student nothing
  // about the pool. Never cached by anything between the server and the
  // browser, and never stored by the browser either.
  router.get(
    "/api/images/:id",
    handle(async (req, res) => {
      const username = identityOf(req);
      const id = /^[1-9]\d{0,9}$/.test(req.params.id) ? Number(req.params.id) : null;
      const image = id === null ? null : readImage(db, id);
      const teacher = username !== null && (await actsAsTeacher(req));
      if (!teacher && !(image && username !== null && studentMaySeeImage(db, username, image.id))) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (!image) throw new NotFoundError("exam.errors.noSuchImage");
      res.set({ "Content-Type": image.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
      res.send(Buffer.from(image.data));
    })
  );

  router.get(
    "/pool",
    teacherPage,
    handle(async (req, res) => {
      // The bar's choice comes along in the query; with a course chosen, the
      // browser assembles tests for it.
      const context = contextFromQuery(req.query);
      const params = context.courseId === null ? {} : { course: String(context.courseId) };
      // The category the browser opens with, e.g. when the editor returns.
      if (typeof req.query.category === "string" && /^[1-9]\d{0,9}$/.test(req.query.category)) params.category = req.query.category;
      // Only the questions not reviewed yet, e.g. right after an import.
      if (req.query.unreviewed === "1") params.unreviewed = "1";
      res.send(await teacherShell({ db, startPage, req, title: (t) => t("exam.pages.pool"), context, kind: "pool", params, current: "pool" }));
    })
  );
}
