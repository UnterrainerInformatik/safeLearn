/**
 * The routes a student writes an online test through (`online-test`): the
 * tests open for them, starting or resuming an attempt, saving an answer,
 * submitting, and the focus log.
 *
 * Every write is the asker's own: the routes take no username, and an attempt
 * of somebody else is answered like one that does not exist. A session acting
 * as a teacher is refused; a teacher in student view passes the gate but is on
 * no roster, so no test is ever open for them.
 *
 * An attempt is bound to the browser that started it by the `httpOnly` cookie
 * `sl-attempt-<id>` (design D6), not to the express session, which lives in
 * memory and does not survive a restart.
 */

import { checkDevice, nextOpenTestsChange, openTestsOf, ownAttempt, recordFocus, resultView, saveAnswer, startAttempt, submitAttempt, writingView } from "./attempts.js";
import { NotFoundError } from "./classes.js";
import { identityOf, requireStudent, sessionNow } from "./gate.js";
import { listenTests } from "./live.js";
import { openEventStream } from "../event-stream.js";
import { embedPlaceholder, wrapInPage } from "../obsidian.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("There is no such record.");
  return id;
}

const cookieName = (attemptId) => `sl-attempt-${attemptId}`;

/** The value of the cookie `name` the request carries, or null. */
function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Hands the browser the secret its attempt is bound to, kept a day past the deadline. */
function bindBrowser(req, res, attemptId, secret, deadline) {
  res.cookie(cookieName(attemptId), secret, {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure,
    path: "/exam/",
    maxAge: Math.max(0, Date.parse(deadline) - Date.now()) + 24 * 60 * 60 * 1000,
  });
}

/** Answers 403 to a request that carries no identity; lets every other one through. */
function requireIdentity(req, res, next) {
  if (identityOf(req)) next();
  else res.status(403).json({ error: "Forbidden" });
}

const heartbeatMs = 25000;

export function registerAttemptRoutes(router, { db, handle, startPage }) {
  /**
   * The asker's attempt from the path, finalized if due, and - while it is
   * open - checked against the browser's cookie. A browser the attempt binds
   * to anew gets its cookie here.
   */
  const attemptOf = (req, res) => {
    const row = ownAttempt(db, idParam(req.params.id), identityOf(req));
    const { bound } = checkDevice(db, row, readCookie(req, cookieName(row.id)));
    if (bound) bindBrowser(req, res, row.id, bound, row.deadline);
    return row;
  };

  // The tests open for the asker right now - all of them, or the one `?test=`
  // names. A teacher is on no roster and finds none.
  router.get(
    "/api/my/tests",
    requireIdentity,
    handle(async (req, res) => {
      const testId = req.query.test === undefined ? null : idParam(String(req.query.test));
      res.json({ tests: openTestsOf(db, identityOf(req), { testId }) });
    })
  );

  // The same list as a stream, so a student's page shows a test the moment it
  // opens: sent at once, then again whenever it changes - a sitting written
  // by a teacher, an attempt of the asker's, or a window opening or closing,
  // for which a timer waits. Like the live view's stream it re-checks the
  // session before each event and with each heartbeat; it never carries
  // anything the list itself does not.
  router.get(
    "/api/my/events",
    requireIdentity,
    handle(async (req, res) => {
      const username = identityOf(req);
      let stop = () => {};
      let heartbeat = null;
      let timer = null;
      const stream = openEventStream(req, res, {
        headers: { "X-Accel-Buffering": "no" },
        onClose: () => {
          stop();
          clearInterval(heartbeat);
          clearTimeout(timer);
        },
      });
      // What a change is: another set of tests, or one started or ended -
      // never the time left of a running attempt, which every save moves.
      let sent = null;
      const push = () => {
        const tests = openTestsOf(db, username);
        const key = JSON.stringify(tests.map((test) => [test.testId, test.closesAt, test.attempt?.attemptId ?? null]));
        if (key !== sent) {
          sent = key;
          stream.send("tests", { tests });
        }
        clearTimeout(timer);
        const next = nextOpenTestsChange(db, username);
        // Capped, so a timer never overflows; past the cap it simply runs again.
        if (next !== null) timer = setTimeout(() => checked(push), Math.min(Math.max(0, Date.parse(next) - Date.now()) + 250, 2 ** 31 - 1));
      };
      let queue = Promise.resolve();
      const checked = (deliver) => {
        queue = queue.then(async () => {
          if (stream.closed) return;
          const now = await sessionNow(req);
          if (now !== "ok") {
            stream.send(now, {});
            stream.close();
            return;
          }
          try {
            deliver();
          } catch (error) {
            console.error(`[exam] the open-tests stream of ${username} failed:`, error);
            stream.close();
          }
        });
      };
      checked(push);
      stop = listenTests(username, () => checked(push));
      heartbeat = setInterval(() => checked(() => stream.comment("heartbeat")), heartbeatMs);
    })
  );

  // Opening a test starts the attempt, or resumes the one there is.
  router.post(
    "/api/tests/:id/attempt",
    requireStudent,
    handle(async (req, res) => {
      const started = startAttempt(db, identityOf(req), idParam(req.params.id));
      if (started.created) {
        const row = ownAttempt(db, started.attemptId, identityOf(req));
        bindBrowser(req, res, row.id, started.secret, row.deadline);
        res.json(writingView(db, row));
        return;
      }
      req.params.id = String(started.attemptId);
      const row = attemptOf(req, res);
      res.json(row.submitted_at === null ? writingView(db, row) : resultView(db, row));
    })
  );

  router.get(
    "/api/attempts/:id",
    requireStudent,
    handle(async (req, res) => {
      const row = attemptOf(req, res);
      res.json(row.submitted_at === null ? writingView(db, row) : resultView(db, row));
    })
  );

  router.put(
    "/api/attempts/:id/questions/:n",
    requireStudent,
    handle(async (req, res) => {
      const row = attemptOf(req, res);
      res.json(saveAnswer(db, row, idParam(req.params.n), req.body?.tokens));
    })
  );

  router.post(
    "/api/attempts/:id/submit",
    requireStudent,
    handle(async (req, res) => {
      res.json(submitAttempt(db, attemptOf(req, res)));
    })
  );

  // Also the target of `navigator.sendBeacon` when the page is left.
  router.post(
    "/api/attempts/:id/focus",
    requireStudent,
    handle(async (req, res) => {
      res.json(recordFocus(db, attemptOf(req, res), req.body?.state));
    })
  );

  // The student's page of the module: the tests open for them right now above
  // their results, one page behind the top bar's Exams button; no bar. The
  // same elements a page's bare `safelearn-test` and `safelearn-results`
  // blocks show.
  router.get(
    "/my",
    (req, res, next) => (identityOf(req) ? next() : next("router")),
    handle(async (req, res) => {
      const title = "Exams";
      const body = `
        <h1>${title}</h1>
        <h2>Open online tests</h2>
        ${embedPlaceholder("test", {})}
        <h2>My results</h2>
        ${embedPlaceholder("results", { page: "1" })}`;
      res.send(await wrapInPage(body, startPage(), req, { title, wide: true }));
    })
  );

  // The two pages it replaced, for links and bookmarks that still name them.
  router.get("/my/tests", (req, res, next) => (identityOf(req) ? res.redirect("/exam/my") : next("router")));
}
