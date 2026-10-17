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
 * With `preview: 1` a teacher tries the test as a student would see it, on
 * the test's own preview page: shuffled, in the course's language, with the
 * first sitting's countdown - but nothing is saved, the focus is not
 * reported, and submitting is switched off.
 *
 * Answers are identified by the tokens the server gave this attempt; the page
 * never learns which answer is correct. A question's text and answers are
 * stored markup, sanitized when the pool was imported.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, h } from "./frame.js";
import { displayClass } from "./classes.js";

/** "12:05" or "1:02:05" for a number of milliseconds left. */
function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function minutes(seconds) {
  const n = Math.round(seconds / 60);
  return n === 1 ? "1 minute" : `${n} minutes`;
}

/** Stored, sanitized markup as a node. */
function storedMarkup(html, className) {
  const container = h("div", { class: className });
  container.innerHTML = html;
  return container;
}

/** Why the server refused, in a sentence for the student. */
function refusal(error) {
  return error instanceof ExamApiError && error.status < 500 ? error.message : "That could not be saved. Please try again.";
}

class WriteTest extends ExamElement {
  disconnectedCallback() {
    this.stop?.();
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
        h("p", { class: "sl-exam-quiet" }, "Students write their open online tests here. ", h("a", { href: "/exam/tests" }, "Online tests"))
      );
    }
    if (data.writing) return this.writingPage(data.writing);
    return this.openTests(data.tests);
  }

  openTests(tests) {
    if (tests.length === 0) {
      return h("div", { class: "sl-exam sl-exam-attempt" }, h("p", { class: "sl-exam-quiet" }, "No online test is open for you right now."));
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
          h("p", { class: "sl-exam-quiet" }, `${test.subject} – ${displayClass(test.className)} · ${minutes(test.durationS)} once you start`),
          h("button", { type: "button", class: "sl-exam-primary", onClick: () => this.start(test.testId) }, "Start the test")
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
    if (writing.submitted) return this.resultPage(writing);
    this.stop?.();
    this.preview = writing.preview === true;
    this.attempt = writing.attempt;
    this.status = h("p", { class: "sl-exam-message", role: "status" });
    this.countdown = h("span", { class: "sl-exam-countdown", "aria-live": "off" });
    const de = writing.language === "de";
    const questions = writing.questions.map((question) => this.questionField(question, writing.questions.length, de));
    const submit = h("button", { type: "button", class: "sl-exam-primary sl-exam-attempt-submit" }, de ? "Abgeben" : "Submit");
    submit.addEventListener("click", () => {
      if (this.preview) {
        this.status.textContent = de ? "Probeansicht: Es wird nichts abgegeben." : "Preview: nothing is submitted.";
        return;
      }
      if (submit.dataset.armed !== "1") {
        submit.dataset.armed = "1";
        submit.textContent = de ? "Wirklich abgeben? Danach ist nichts mehr änderbar." : "Really submit? Nothing can be changed afterwards.";
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
          de
            ? "Probeansicht für Lehrkräfte: Antworten werden nicht gespeichert, und Abgeben ist abgeschaltet. Ein Neuladen mischt neu."
            : "Teacher preview: answers are not saved, and submitting is switched off. A reload shuffles anew."
        )
      : null;
    return h(
      "div",
      { class: "sl-exam sl-exam-attempt sl-exam-writing", lang: writing.language, "data-preview": this.preview ? "1" : null },
      notice,
      h(
        "div",
        { class: "sl-exam-attempt-head" },
        h("strong", {}, writing.name),
        " · ",
        writing.remainingMs === null ? (de ? "noch kein Termin, keine Zeitgrenze" : "no sitting yet, no time limit") : [de ? "noch " : "time left ", this.countdown]
      ),
      questions,
      h("p", {}, submit),
      this.status
    );
  }

  questionField(question, count, de) {
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
      h("legend", {}, de ? `Frage ${question.n} von ${count}` : `Question ${question.n} of ${count}`, " ", state),
      storedMarkup(question.text, "sl-exam-pool-text"),
      h(
        "ul",
        { class: "sl-exam-attempt-answers" },
        question.answers.map((answer, index) => h("li", {}, h("label", {}, inputs[index], storedMarkup(answer.text, "sl-exam-pool-answer"))))
      )
    );
    const save = this.saver(question.n, state, de);
    field.addEventListener("change", () => save(inputs.filter((input) => input.checked).map((input) => input.value)));
    return field;
  }

  /**
   * Saves a question's answers as they change: one request at a time, and
   * only the latest choice waits behind it, so a slow answer never overwrites
   * a newer one.
   */
  saver(n, state, de) {
    let inFlight = false;
    let queued = null;
    const send = async (tokens) => {
      if (this.preview) {
        state.textContent = de ? "nicht gespeichert (Probe)" : "not saved (preview)";
        state.dataset.state = "preview";
        return;
      }
      inFlight = true;
      state.textContent = de ? "wird gespeichert…" : "saving…";
      state.dataset.state = "saving";
      try {
        const saved = await examApi(`/attempts/${this.attempt}/questions/${n}`, { method: "PUT", body: { tokens } });
        this.track(saved.remainingMs);
        if (queued === null) {
          state.textContent = de ? "gespeichert" : "saved";
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
      this.status.textContent = "Time is up. In a real attempt the server would submit now.";
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
      h("p", {}, h("strong", {}, "Submitted. ")),
      h("p", {}, `${result.score} of ${result.questionCount} ${result.questionCount === 1 ? "question" : "questions"} correct – grade ${result.grade}.`)
    );
  }
}

defineExamElement("test", WriteTest);
