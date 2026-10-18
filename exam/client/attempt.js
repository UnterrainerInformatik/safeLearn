/**
 * Writing an online test (`online-test`), the student's element:
 *
 * - `test`: the tests open for the reader right now - the one `test:` names,
 *   or all of them when the block names none - each to start or continue; the
 *   writing page of the attempt; and after submission the points and the
 *   grade, nothing more
 *
 * Every change of an answer is saved at once. The countdown runs from the
 * time the server says is left, refreshed by every save, so the reader's
 * clock never matters; at zero the page asks the server, which has submitted
 * the attempt. The page reports leaving it and coming back (the focus log),
 * which a teacher sees and which never changes the grade.
 *
 * The controls - buttons, countdown, messages - are in the reader's own
 * language; questions and answers stay in the course's language and are
 * marked with it (`ui-language`, design.md, D7).
 *
 * With `preview: 1` a teacher tries the test as a student would see it, on
 * the test's own preview page: shuffled, in the course's language, with the
 * first sitting's countdown - but nothing is saved, the focus is not
 * reported, and submitting is switched off.
 *
 * Answers are identified by the tokens the server gave this attempt; the page
 * never learns which answer is correct. A question's text and answers are
 * stored markup, sanitized when the pool was imported.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, h, t } from "./frame.js";
import { displayClass } from "./classes.js";

/** "12:05" or "1:02:05" for a number of milliseconds left. */
function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Stored, sanitized markup as a node. */
function storedMarkup(html, className) {
  const container = h("div", { class: className });
  container.innerHTML = html;
  return container;
}

/** Why the server refused, in a sentence for the student. */
function refusal(error) {
  return error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.frame.saveFailed");
}

/** How long a stream the browser gave up on waits before it is tried again. */
const streamRetryMs = 30000;

class WriteTest extends ExamElement {
  disconnectedCallback() {
    this.stop?.();
    this.closeStream();
  }

  /**
   * While the list of open tests is shown, the server's stream of it
   * (`/api/my/events`) redraws it the moment a test opens, closes or is
   * written elsewhere, and tells the top bar's Exams button - which it keeps
   * doing while a test is written, without redrawing the writing page.
   */
  watch() {
    if (this.source) return;
    const source = new EventSource("/exam/api/my/events");
    this.source = source;
    source.addEventListener("tests", (event) => {
      const { tests } = JSON.parse(event.data);
      window.dispatchEvent(new CustomEvent("sl-exam-open-tests", { detail: { count: tests.length } }));
      if (!this.listing) return;
      const shown = this.params.test === undefined ? tests : tests.filter((test) => String(test.testId) === this.params.test);
      const key = JSON.stringify(shown.map((test) => [test.testId, test.closesAt]));
      if (key !== this.shownKey) this.show(this.openTests(shown));
    });
    source.addEventListener("renew", () => {
      this.closeStream();
      this.watch();
    });
    source.addEventListener("refused", () => this.closeStream());
    source.addEventListener("error", () => {
      if (this.source !== source || source.readyState !== EventSource.CLOSED) return;
      this.closeStream();
      this.retry = setTimeout(() => this.isConnected && this.watch(), streamRetryMs);
    });
  }

  closeStream() {
    clearTimeout(this.retry);
    this.source?.close();
    this.source = null;
  }

  async load() {
    const test = this.params.test;
    // A block names its test by the id the test's page shows; anything else names none.
    if (test !== undefined && !/^[1-9]\d{0,9}$/.test(test)) throw new ExamApiError(404);
    const me = await examApi("/me");
    if (this.params.preview === "1" && me.teacher && test) return { writing: await examApi(`/tests/${test}/preview`) };
    if (me.teacher) return { teacher: true };
    const { tests } = await examApi(`/my/tests${test ? `?test=${test}` : ""}`);
    // A running attempt is resumed at once, as a reload of its page expects.
    const running = tests.find((candidate) => candidate.attempt !== null);
    if (running) return { writing: await examApi(`/tests/${running.testId}/attempt`, { method: "POST" }) };
    return { tests };
  }

  render(data) {
    if (data.teacher) {
      return h(
        "div",
        { class: "sl-exam sl-exam-attempt" },
        h("p", { class: "sl-exam-quiet" }, t("exam.attempt.teacherHint"), " ", h("a", { href: "/exam/tests" }, t("exam.attempt.onlineTests")))
      );
    }
    if (data.writing) return this.writingPage(data.writing);
    return this.openTests(data.tests);
  }

  openTests(tests) {
    this.listing = true;
    this.shownKey = JSON.stringify(tests.map((test) => [test.testId, test.closesAt]));
    this.watch();
    if (tests.length === 0) {
      return h("div", { class: "sl-exam sl-exam-attempt" }, h("p", { class: "sl-exam-quiet" }, t("exam.attempt.noneOpen")));
    }
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    return h(
      "div",
      { class: "sl-exam sl-exam-attempt" },
      tests.map((test) =>
        h(
          "section",
          { class: "sl-exam-attempt-open", "data-test": String(test.testId) },
          h("h3", {}, test.name),
          h(
            "p",
            { class: "sl-exam-quiet" },
            t("exam.attempt.openDetails", { subject: test.subject, className: displayClass(test.className), count: Math.round(test.durationS / 60) })
          ),
          h("button", { type: "button", class: "sl-exam-primary", onClick: () => this.start(test.testId) }, t("exam.attempt.start"))
        )
      ),
      this.message
    );
  }

  async start(testId) {
    try {
      this.show(this.writingPage(await examApi(`/tests/${testId}/attempt`, { method: "POST" })));
    } catch (error) {
      this.message.textContent = refusal(error);
    }
  }

  // ------------------------------------------------------------ writing

  writingPage(writing) {
    this.listing = false;
    if (writing.submitted) return this.resultPage(writing);
    this.stop?.();
    this.preview = writing.preview === true;
    this.attempt = writing.attempt;
    this.status = h("p", { class: "sl-exam-message", role: "status" });
    this.countdown = h("span", { class: "sl-exam-countdown", "aria-live": "off" });
    const questions = writing.questions.map((question) => this.questionField(question, writing.questions.length, writing.language));
    const submit = h("button", { type: "button", class: "sl-exam-primary sl-exam-attempt-submit" }, t("exam.attempt.submit"));
    submit.addEventListener("click", () => {
      if (this.preview) {
        this.status.textContent = t("exam.attempt.previewNotSubmitted");
        return;
      }
      if (submit.dataset.armed !== "1") {
        submit.dataset.armed = "1";
        submit.textContent = t("exam.attempt.confirmSubmit");
        return;
      }
      this.submit();
    });
    if (writing.remainingMs !== null) this.track(writing.remainingMs);
    if (!this.preview) this.watchFocus();
    else
      this.stop = () => {
        clearInterval(this.timer);
        this.timer = null;
        this.stop = null;
      };
    const notice = this.preview
      ? h(
          "p",
          { class: "sl-exam-attempt-preview", role: "note" },
          t("exam.attempt.previewNotice")
        )
      : null;
    return h(
      "div",
      { class: "sl-exam sl-exam-attempt sl-exam-writing", "data-language": writing.language, "data-preview": this.preview ? "1" : null },
      notice,
      h(
        "div",
        { class: "sl-exam-attempt-head" },
        h("strong", {}, writing.name),
        " · ",
        writing.remainingMs === null ? t("exam.attempt.noTimeLimit") : [t("exam.attempt.timeLeft"), " ", this.countdown]
      ),
      questions,
      h("p", {}, submit),
      this.status
    );
  }

  /** One question: its number in the reader's language, its text and answers in the course's (`language`). */
  questionField(question, count, language) {
    const multiple = question.type === "multichoiceset";
    const state = h("span", { class: "sl-exam-attempt-state", role: "status" });
    const inputs = question.answers.map((answer) =>
      h("input", {
        type: multiple ? "checkbox" : "radio",
        name: `q-${this.attempt}-${question.n}`,
        value: answer.token,
        checked: question.chosen.includes(answer.token),
      })
    );
    const field = h(
      "fieldset",
      { class: "sl-exam-attempt-question", "data-n": String(question.n) },
      h("legend", {}, t("exam.attempt.questionOf", { n: question.n, count }), " ", state),
      h(
        "div",
        { class: "sl-exam-attempt-content", lang: language },
        storedMarkup(question.text, "sl-exam-pool-text"),
        h(
          "ul",
          { class: "sl-exam-attempt-answers" },
          question.answers.map((answer, index) => h("li", {}, h("label", {}, inputs[index], storedMarkup(answer.text, "sl-exam-pool-answer"))))
        )
      )
    );
    const save = this.saver(question.n, state);
    field.addEventListener("change", () => save(inputs.filter((input) => input.checked).map((input) => input.value)));
    return field;
  }

  /**
   * Saves a question's answers as they change: one request at a time, and
   * only the latest choice waits behind it, so a slow answer never overwrites
   * a newer one.
   */
  saver(n, state) {
    let inFlight = false;
    let queued = null;
    const send = async (tokens) => {
      if (this.preview) {
        state.textContent = t("exam.attempt.notSavedPreview");
        state.dataset.state = "preview";
        return;
      }
      inFlight = true;
      state.textContent = t("exam.attempt.saving");
      state.dataset.state = "saving";
      try {
        const saved = await examApi(`/attempts/${this.attempt}/questions/${n}`, { method: "PUT", body: { tokens } });
        this.track(saved.remainingMs);
        if (queued === null) {
          state.textContent = t("exam.attempt.saved");
          state.dataset.state = "saved";
        }
      } catch (error) {
        state.textContent = refusal(error);
        state.dataset.state = "refused";
        if (error instanceof ExamApiError && error.status === 409) this.finish();
      } finally {
        inFlight = false;
        if (queued !== null) {
          const next = queued;
          queued = null;
          send(next);
        }
      }
    };
    return (tokens) => {
      if (inFlight) queued = tokens;
      else send(tokens);
    };
  }

  /** Runs the countdown towards `remainingMs` from now, as the server last said. */
  track(remainingMs) {
    this.endsAt = performance.now() + remainingMs;
    if (this.timer) return;
    const tick = () => {
      const left = this.endsAt - performance.now();
      this.countdown.textContent = clock(left);
      if (left <= 0) this.finish();
    };
    tick();
    this.timer = setInterval(tick, 500);
  }

  /** Reports leaving the page and coming back; a beacon when the page goes away. */
  watchFocus() {
    let away = document.visibilityState === "hidden";
    const report = (state) => {
      if ((state === "away") === away) return;
      away = state === "away";
      examApi(`/attempts/${this.attempt}/focus`, { method: "POST", body: { state } }).catch(() => {});
    };
    const onVisibility = () => report(document.visibilityState === "hidden" ? "away" : "back");
    const onBlur = () => report("away");
    const onFocus = () => report("back");
    const onHide = () => {
      if (away) return;
      away = true;
      navigator.sendBeacon(`/exam/api/attempts/${this.attempt}/focus`, new Blob([JSON.stringify({ state: "away" })], { type: "application/json" }));
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onHide);
    this.stop = () => {
      clearInterval(this.timer);
      this.timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", onHide);
      this.stop = null;
    };
  }

  async submit() {
    try {
      this.stop?.();
      this.show(this.resultPage(await examApi(`/attempts/${this.attempt}/submit`, { method: "POST" })));
    } catch (error) {
      this.status.textContent = refusal(error);
      if (error instanceof ExamApiError && error.status === 409) this.finish();
    }
  }

  /**
   * The time is up, or the server refused a write: the answers are locked,
   * and the server - which submits at the deadline - is asked for the result.
   */
  async finish() {
    if (this.finishing) return;
    this.finishing = true;
    for (const input of this.querySelectorAll(".sl-exam-writing input, .sl-exam-writing button")) input.disabled = true;
    if (this.preview) {
      clearInterval(this.timer);
      this.status.textContent = t("exam.attempt.timeIsUpPreview");
      return;
    }
    try {
      const answer = await examApi(`/attempts/${this.attempt}`);
      if (answer.submitted) {
        this.stop?.();
        this.show(this.resultPage(answer));
        return;
      }
      // The server's clock is a little behind: it says how long is left.
      this.finishing = false;
      for (const input of this.querySelectorAll(".sl-exam-writing input, .sl-exam-writing button")) input.disabled = false;
      this.endsAt = performance.now() + answer.remainingMs;
    } catch (error) {
      this.status.textContent = refusal(error);
    }
  }

  resultPage(result) {
    return h(
      "div",
      { class: "sl-exam sl-exam-attempt sl-exam-attempt-result" },
      h("p", {}, h("strong", {}, t("exam.attempt.submitted"), " ")),
      h("p", {}, t("exam.attempt.result", { score: result.score, count: result.questionCount, grade: result.grade }))
    );
  }
}

defineExamElement("test", WriteTest);
