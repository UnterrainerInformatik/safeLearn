/**
 * The routes of the question import (`question-import`): the import page, the
 * format description to hand to a Claude, and the API that checks a file,
 * imports it, lists and takes back imports, and marks a question as reviewed.
 * Every one of them is a teacher's: the API refuses any other session with 403
 * before it reads a byte of the request's body, and the page and the
 * description are not there for it (`gate.js`).
 */

import express from "express";

import { checkQuestionFile, fileLimitBytes, formatDescription, importQuestionFile, listImports, takeBackImport } from "./question-import.js";
import { markReviewed } from "./pool-edit.js";
import { NotFoundError, readableMessage } from "./classes.js";
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
 * The file as raw text, whatever type it is declared as, and on these routes
 * only, so the instance's own JSON limit stays as it is (exam-question-import
 * design D5). A larger file is refused the way the check refuses it.
 */
function rawText(req, res, next) {
  express.text({ type: () => true, limit: fileLimitBytes })(req, res, (error) => {
    if (error?.type === "entity.too.large") {
      i18nOf(req)
        .then(({ t }) => {
          const tooLarge = t("exam.errors.import.fileTooLarge");
          res.status(413).json({ error: tooLarge, problems: [{ line: 1, question: null, message: tooLarge }] });
        })
        .catch(next);
      return;
    }
    next(error);
  });
}

/** The file's name from `?name=`, as the teacher's computer called it. */
function fileNameOf(req) {
  return typeof req.query.name === "string" ? req.query.name : "";
}

function bodyText(req) {
  return typeof req.body === "string" ? req.body : "";
}

export function registerPoolImportRoutes(router, { db, handle, startPage }) {
  const api = (method, path, ...middleware) => (fn) =>
    router[method](
      `/api${path}`,
      requireTeacher,
      ...middleware,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  api("post", "/pool/imports/check", rawText)(async (req) => {
    const { problems, plan } = checkQuestionFile(db, bodyText(req), fileNameOf(req));
    // Each problem in the reader's language (`ui-language`).
    const { t } = await i18nOf(req);
    return { problems: problems.map((problem) => ({ ...problem, message: readableMessage(problem, t) })), plan };
  });
  api("post", "/pool/imports", rawText)((req) => importQuestionFile(db, bodyText(req), { fileName: fileNameOf(req), username: identityOf(req) }));
  api("get", "/pool/imports")(() => listImports(db));
  api("delete", "/pool/imports/:id")((req) => takeBackImport(db, idParam(req.params.id)));
  api("post", "/pool/questions/:id/reviewed")((req) => markReviewed(db, idParam(req.params.id)));

  // The format description with the pool's categories as they are now, as a
  // file to save and hand to a Claude.
  router.get(
    "/pool/import/format",
    teacherPage,
    handle(async (req, res) => {
      res.set({
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="safelearn-question-format.md"',
        "Cache-Control": "private, no-store",
      });
      res.send(formatDescription(db));
    })
  );

  router.get(
    "/pool/import",
    teacherPage,
    handle(async (req, res) => {
      const context = contextFromQuery(req.query);
      const params = context.courseId === null ? {} : { course: String(context.courseId) };
      res.send(await teacherShell({ db, startPage, req, title: (t) => t("exam.pages.importQuestions"), context, kind: "pool-import", params, current: "pool" }));
    })
  );
}
