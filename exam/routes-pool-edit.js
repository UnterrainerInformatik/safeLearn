/**
 * The routes of the question editor (`question-editor`): the editor's pages,
 * the category page, and the API that changes the pool. Every one of them is
 * a teacher's: the API refuses any other session with 403 before it reads a
 * byte of the request's body, and the pages are not there for it (`gate.js`).
 */

import express from "express";

import {
  createCategory,
  createQuestion,
  deleteCategory,
  deleteQuestion,
  readUpload,
  retireQuestion,
  reviveQuestion,
  saveQuestion,
  stageUpload,
  updateCategory,
  uploadLimitBytes,
} from "./pool-edit.js";
import { getQuestion } from "./pool.js";
import { NotFoundError } from "./classes.js";
import { identityOf, requireTeacher, teacherPage } from "./gate.js";
import { contextFromQuery, teacherShell } from "./bar.js";
import { i18nOf } from "../i18n/server.js";

/** A record id from the path or query; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

/**
 * The upload's body as raw bytes, whatever type it is declared as - the type
 * is judged from the content - and on this route only, so the instance's own
 * JSON limit stays as it is (exam-question-editor design D4). Anything larger
 * than the limit is refused with the limit named.
 */
function rawImage(req, res, next) {
  express.raw({ type: () => true, limit: uploadLimitBytes })(req, res, (error) => {
    if (error?.type === "entity.too.large") {
      i18nOf(req)
        .then(({ t }) => res.status(413).json({ error: t("exam.errors.pool.imageTooLarge") }))
        .catch(next);
      return;
    }
    next(error);
  });
}

export function registerPoolEditRoutes(router, { db, handle, startPage }) {
  const api = (method, path, fn) =>
    router[method](
      `/api${path}`,
      requireTeacher,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  api("post", "/pool/questions", (req) => createQuestion(db, req.body ?? {}));
  api("put", "/pool/questions/:id", (req) => saveQuestion(db, idParam(req.params.id), req.body ?? {}));
  api("post", "/pool/questions/:id/retire", (req) => retireQuestion(db, idParam(req.params.id)));
  api("post", "/pool/questions/:id/revive", (req) => reviveQuestion(db, idParam(req.params.id)));
  api("delete", "/pool/questions/:id", (req) => deleteQuestion(db, idParam(req.params.id)));
  api("post", "/pool/categories", (req) => createCategory(db, req.body ?? {}));
  api("put", "/pool/categories/:id", (req) => updateCategory(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/pool/categories/:id", (req) => deleteCategory(db, idParam(req.params.id)));

  router.post(
    "/api/pool/uploads",
    requireTeacher,
    rawImage,
    handle(async (req, res) => {
      res.json(stageUpload(db, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), identityOf(req)));
    })
  );

  // A staged upload, for the editor to show before the save. Teachers only,
  // and like the pool's images never cached on the way.
  router.get(
    "/api/pool/uploads/:token",
    requireTeacher,
    handle(async (req, res) => {
      const upload = readUpload(db, req.params.token);
      if (!upload) throw new NotFoundError("exam.errors.noSuchUpload");
      res.set({ "Content-Type": upload.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
      res.send(Buffer.from(upload.data));
    })
  );

  /** The editor's page, for a question or - with `id` null - a new one. */
  const editorPage = async (req, res, { id, title }) => {
    const context = contextFromQuery(req.query);
    const params = id === null ? {} : { question: String(id) };
    if (id === null && typeof req.query.category === "string" && /^[1-9]\d{0,9}$/.test(req.query.category)) {
      params.category = req.query.category;
    }
    if (context.courseId !== null) params.course = String(context.courseId);
    res.send(await teacherShell({ db, startPage, req, title, context, kind: "question-editor", params, current: "pool" }));
  };

  router.get(
    "/pool/questions/new",
    teacherPage,
    handle(async (req, res) => editorPage(req, res, { id: null, title: (t) => t("exam.pages.newQuestion") }))
  );

  router.get(
    "/pool/questions/:id",
    teacherPage,
    handle(async (req, res) => {
      const question = getQuestion(db, idParam(req.params.id));
      await editorPage(req, res, { id: question.id, title: (t) => t("exam.pages.editQuestion", { name: question.nameDe }) });
    })
  );

  router.get(
    "/pool/categories",
    teacherPage,
    handle(async (req, res) => {
      const context = contextFromQuery(req.query);
      const params = context.courseId === null ? {} : { course: String(context.courseId) };
      res.send(await teacherShell({ db, startPage, req, title: (t) => t("exam.pages.categories"), context, kind: "pool-categories", params, current: "pool" }));
    })
  );
}
