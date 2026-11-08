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
 * and sends a heartbeat that tells the server, independently of the
 * browser's visibility and focus properties, whether the page was shown, and
 * whether those properties were replaced. A teacher sees both; neither ever
 * changes the grade.
 *
 * An attempt is written in full screen (exam-fullscreen-tick-rate design
 * D1/D2): the only way to start one is the button that requests full screen,
 * a resumed attempt shows its questions behind "Continue in full screen", and
 * a page that left full screen shows a bar with the way back, which never
 * covers the questions. A browser that refuses full screen still writes; the
 * server flags it. The heartbeat also carries the timer ticks and whether the
 * page was out of full screen.
 *
 * The controls - buttons, countdown, messages - are in the reader's own
 * language; questions and answers stay in the course's language and are
 * marked with it (`ui-language`, design.md, D7).
 *
 * An offline sitting open for the reader (`offline-test`) is listed among
 * them with its time left and, when the test has a handout, the link to the
 * reader's handout - nothing to start, nothing written here. It goes when its
 * window closes, as the stream says.
 *
 * - `handout-watch`: on a handout's page, replaces the handout with a notice
 *   the moment its sitting leaves the reader's open tests (exam-offline-
 *   sittings design D6) - a courtesy, the server refuses the next request
 *   anyway
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

/** How often the writing page sends its heartbeat (exam-hidden-page-signals design D2). */
const beatMs = 5000;

/**
 * The extra beat at a change of full screen is only sent this long after the
 * previous one (exam-fullscreen-tick-rate D2): above the server's 1 s minimum
 * gap, with room for the network, so the server never drops a beat whose
 * frames the page has already counted. A closer change is merged into the
 * next span.
 */
const changeBeatGapMs = 1500;

/** The timer the tick rate is counted with (exam-fullscreen-tick-rate D3): four ticks a second at full rate. */
const tickMs = 250;

/** Whether this browser offers element full screen at all (not on an iPhone). */
function fullscreenOffered() {
  return typeof document.documentElement.requestFullscreen === "function" && document.fullscreenEnabled !== false;
}

/**
 * Puts the page into full screen, from the click that asked for it; true
 * when the page is in full screen afterwards, false when the browser has no
 * element full screen or refused it.
 */
async function enterFullscreen() {
  if (document.fullscreenElement) return true;
  if (!fullscreenOffered()) return false;
  try {
    await document.documentElement.requestFullscreen();
    return document.fullscreenElement !== null;
  } catch {
    return false;
  }
}

const nativeCode = /\{\s*\[native code\]\s*\}\s*$/;

/**
 * The check whether `document.visibilityState`, `document.hidden` and
 * `document.hasFocus` are still the browser's own (exam-hidden-page-signals
 * design D1). The untouched references come from a hidden, same-origin
 * `about:blank` frame that stays for the whole attempt: its `Document`
 * prototype's getter and function, and its `Function.prototype.toString`,
 * which a patch made in this page alone does not reach. A property is
 * replaced when `document` has an own property of its name, when this page's
 * prototype holds something that is not native code, or when the untouched
 * reference answers differently. The names found are kept until the attempt
 * ends; the server merges them anyway.
 */
function pageIntegrity() {
  const holder = document.createElement("iframe");
  holder.hidden = true;
  holder.tabIndex = -1;
  holder.setAttribute("aria-hidden", "true");
  holder.className = "sl-exam-attempt-reference";
  document.body.append(holder);
  const realm = holder.contentWindow;
  const found = new Set();
  if (!realm) return { check() {}, hidden: () => document.visibilityState === "hidden", tampered: () => [], remove: () => holder.remove() };
  const describe = realm.Object.getOwnPropertyDescriptor;
  const toString = realm.Function.prototype.toString;
  const untouched = realm.Document.prototype;
  const reference = {
    visibilityState: describe(untouched, "visibilityState")?.get,
    hidden: describe(untouched, "hidden")?.get,
    hasFocus: describe(untouched, "hasFocus")?.value,
  };
  const native = (fn) => {
    try {
      return typeof fn === "function" && nativeCode.test(toString.call(fn));
    } catch {
      return false;
    }
  };
  const ownOf = (name) => {
    const own = describe(Document.prototype, name);
    return name === "hasFocus" ? own?.value : own?.get;
  };
  const read = {
    visibilityState: () => [reference.visibilityState.call(document), document.visibilityState],
    hidden: () => [reference.hidden.call(document), document.hidden],
    hasFocus: () => [reference.hasFocus.call(document), document.hasFocus()],
  };
  return {
    check() {
      for (const name of Object.keys(reference)) {
        if (found.has(name) || typeof reference[name] !== "function") continue;
        let replaced = describe(document, name) !== undefined || !native(ownOf(name));
        if (!replaced) {
          try {
            const [truth, claim] = read[name]();
            replaced = truth !== claim;
          } catch {
            // A reference that cannot be asked proves nothing.
          }
        }
        if (replaced) found.add(name);
      }
    },
    hidden() {
      try {
        return reference.visibilityState.call(document) === "hidden";
      } catch {
        return false;
      }
    },
    tampered: () => [...found],
    remove: () => holder.remove(),
  };
}

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

/** What makes a list of open tests another list: its tests, their windows, and an offline sitting's handout. */
function openKey(tests) {
  return JSON.stringify(tests.map((test) => [test.testId, test.closesAt, test.sittingId ?? null, test.handout ?? null]));
}

/** How long a stream the browser gave up on waits before it is tried again. */
const streamRetryMs = 30000;

class WriteTest extends ExamElement {
  disconnectedCallback() {
    this.stop?.();
    clearInterval(this.offlineTicker);
    this.closeStream();
    this.announce(false);
  }

  /**
   * Tells the page whether a real attempt is being written, so the student's
   * Exams page can hide its results meanwhile (`sl-exam-writing`). A preview
   * never counts as writing.
   */
  announce(writing) {
    window.dispatchEvent(new CustomEvent("sl-exam-writing", { detail: { writing } }));
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
      if (openKey(shown) !== this.shownKey) this.show(this.openTests(shown));
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
    this.announce(false);
    this.shownKey = openKey(tests);
    this.watch();
    clearInterval(this.offlineTicker);
    if (tests.length === 0) {
      return h("div", { class: "sl-exam sl-exam-attempt" }, h("p", { class: "sl-exam-quiet" }, t("exam.attempt.noneOpen")));
    }
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    const offline = tests.filter((test) => test.kind === "offline");
    if (offline.length > 0) {
      const received = performance.now();
      const tick = () => {
        for (const test of offline) {
          const left = this.querySelector(`.sl-exam-offline-left[data-sitting="${test.sittingId}"]`);
          if (left) left.textContent = clock(test.remainingMs - (performance.now() - received));
        }
      };
      this.offlineTicker = setInterval(tick, 1000);
      queueMicrotask(tick);
    }
    return h(
      "div",
      { class: "sl-exam sl-exam-attempt" },
      tests.map((test) =>
        test.kind === "offline" ? this.offlineEntry(test) : h(
          "section",
          { class: "sl-exam-attempt-open", "data-test": String(test.testId) },
          h("h3", {}, test.name),
          h(
            "p",
            { class: "sl-exam-quiet" },
            t("exam.attempt.openDetails", { subject: test.subject, className: displayClass(test.className), count: Math.round(test.durationS / 60) })
          ),
          h("p", { class: "sl-exam-attempt-fullscreen-notice", role: "note" }, t("exam.attempt.fullscreenNotice")),
          h("button", { type: "button", class: "sl-exam-primary sl-exam-attempt-start", onClick: () => this.start(test.testId) }, t("exam.attempt.startFullscreen"))
        )
      ),
      this.message
    );
  }

  /**
   * An open offline sitting: its name and course, the time left by the
   * server's clock, and the reader's handout if the test has one.
   */
  offlineEntry(test) {
    return h(
      "section",
      { class: "sl-exam-attempt-open sl-exam-attempt-offline", "data-test": String(test.testId), "data-sitting": String(test.sittingId) },
      h("h3", {}, test.name),
      h(
        "p",
        { class: "sl-exam-quiet" },
        t("exam.attempt.offlineDetails", { subject: test.subject, className: displayClass(test.className) }),
        " ",
        t("exam.attempt.timeLeft"),
        " ",
        h("span", { class: "sl-exam-countdown sl-exam-offline-left", "data-sitting": String(test.sittingId) }, clock(test.remainingMs))
      ),
      test.handout
        ? h("a", { class: "sl-exam-primary sl-exam-handout-link", href: `/exam/my/sittings/${test.sittingId}/handout` }, t("exam.attempt.openHandout"))
        : h("p", { class: "sl-exam-quiet" }, t("exam.attempt.offlineNoHandout"))
    );
  }

  /**
   * The only way into an attempt (exam-fullscreen-tick-rate D1): full screen
   * first, from this click, then the start - which says whether full screen
   * was granted, and goes ahead either way.
   */
  async start(testId) {
    const fullscreen = await enterFullscreen();
    try {
      this.show(this.writingPage(await examApi(`/tests/${testId}/attempt`, { method: "POST", body: { fullscreen } }), { gate: false, refused: !fullscreen }));
    } catch (error) {
      this.message.textContent = refusal(error);
    }
  }

  // ------------------------------------------------------------ writing

  /**
   * The writing page. `gate` puts "Continue in full screen" in front of the
   * questions, as after a reload; the countdown runs above it meanwhile. The
   * teacher's try always starts behind the gate, with the student's start
   * button. `refused` says full screen was refused at the start.
   */
  writingPage(writing, { gate = !document.fullscreenElement, refused = false } = {}) {
    this.listing = false;
    if (writing.submitted) return this.resultPage(writing);
    this.stop?.();
    this.preview = writing.preview === true;
    this.attempt = writing.attempt;
    if (!this.preview) this.announce(true);
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
    // The way back to full screen, above the questions and never over them (exam-fullscreen-tick-rate D2).
    const back = h("button", { type: "button", class: "sl-exam-primary sl-exam-attempt-back", onClick: () => this.backToFullscreen() }, t("exam.attempt.backToFullscreen"));
    this.fullscreenBar = h("div", { class: "sl-exam-attempt-fullscreen-bar", hidden: true }, back);
    const body = h("div", { class: "sl-exam-attempt-body", hidden: gate }, questions, h("p", {}, submit), this.status);
    this.gated = gate;
    const gateView = gate ? this.fullscreenGate(body) : null;
    this.showFullscreenBar();
    if (writing.remainingMs !== null) this.track(writing.remainingMs);
    if (!this.preview) this.watchFocus({ refused });
    else this.watchPreview();
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
      gateView,
      this.fullscreenBar,
      body
    );
  }

  /**
   * "Continue in full screen" in front of the questions (exam-fullscreen-
   * tick-rate D1): the questions are built behind it and shown on the click,
   * in full screen if the browser grants it and anyway if it does not. The
   * teacher's try reads like the student's start.
   */
  fullscreenGate(body) {
    const label = this.preview ? t("exam.attempt.startFullscreen") : t("exam.attempt.continueFullscreen");
    const gate = h(
      "div",
      { class: "sl-exam-attempt-gate" },
      h("p", { class: "sl-exam-attempt-fullscreen-notice", role: "note" }, t("exam.attempt.fullscreenNotice")),
      h(
        "button",
        {
          type: "button",
          class: "sl-exam-primary sl-exam-attempt-continue",
          onClick: async () => {
            const granted = await enterFullscreen();
            if (!granted) this.fullscreenRefused?.();
            this.gated = false;
            gate.remove();
            body.hidden = false;
            this.showFullscreenBar();
          },
        },
        label
      )
    );
    return gate;
  }

  /** Shows the bar while the page is out of full screen, once the questions are shown, where full screen exists at all. */
  showFullscreenBar() {
    if (!this.fullscreenBar) return;
    this.fullscreenBar.hidden = Boolean(document.fullscreenElement) || this.gated || !fullscreenOffered();
  }

  async backToFullscreen() {
    if (!(await enterFullscreen())) this.fullscreenRefused?.();
    this.showFullscreenBar();
  }

  /** The teacher's try: the countdown and the full-screen bar, nothing reported. */
  watchPreview() {
    const onFullscreen = () => this.showFullscreenBar();
    document.addEventListener("fullscreenchange", onFullscreen);
    this.stop = () => {
      clearInterval(this.timer);
      this.timer = null;
      document.removeEventListener("fullscreenchange", onFullscreen);
      this.stop = null;
    };
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

  /**
   * Reports leaving the page and coming back; a beacon when the page goes
   * away. Beside it the heartbeat (exam-hidden-page-signals design D1/D2,
   * exam-fullscreen-tick-rate D2/D3): every few seconds the animation frames
   * drawn and the timer ticks run since the last beat, the page's visibility
   * as an untouched reference reads it, whether the focus log reported an
   * absence meanwhile, whether the page was out of full screen at any moment
   * of the span, whether a request for full screen was refused, and the
   * visibility and focus properties found replaced. A change of full screen
   * sends a beat at once with the state from before it, so the spans follow
   * the changes. The server judges; the student sees nothing but the bar.
   */
  watchFocus({ refused = false } = {}) {
    let away = document.visibilityState === "hidden";
    // Whether the focus log reported an absence since the last beat.
    let reportedAway = away;
    const report = (state) => {
      if ((state === "away") === away) return;
      away = state === "away";
      if (away) reportedAway = true;
      examApi(`/attempts/${this.attempt}/focus`, { method: "POST", body: { state } }).catch(() => {});
    };
    const onVisibility = () => report(document.visibilityState === "hidden" ? "away" : "back");
    const onBlur = () => report("away");
    const onFocus = () => report("back");
    const onHide = () => {
      if (away) return;
      away = true;
      reportedAway = true;
      navigator.sendBeacon(`/exam/api/attempts/${this.attempt}/focus`, new Blob([JSON.stringify({ state: "away" })], { type: "application/json" }));
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", onHide);

    const integrity = pageIntegrity();
    integrity.check();
    let frames = 0;
    let frame = 0;
    const count = () => {
      frames += 1;
      frame = requestAnimationFrame(count);
    };
    frame = requestAnimationFrame(count);
    let ticks = 0;
    const ticker = setInterval(() => {
      ticks += 1;
    }, tickMs);
    const inFullscreen = () => Boolean(document.fullscreenElement);
    // Out of full screen at any moment of the current span; a reload reaches the gate out of it.
    let out = !inFullscreen();
    // A request for full screen was refused: at the start, at the gate or from the bar.
    let noFullscreen = refused;
    this.fullscreenRefused = () => {
      noFullscreen = true;
    };
    let lastBeat = performance.now();
    let heartbeat = null;
    const beat = () => {
      clearTimeout(heartbeat);
      integrity.check();
      const body = { frames, ticks, hidden: integrity.hidden(), reportedAway: reportedAway || away, out, noFullscreen, tampered: integrity.tampered() };
      frames = 0;
      ticks = 0;
      reportedAway = away;
      out = !inFullscreen();
      lastBeat = performance.now();
      examApi(`/attempts/${this.attempt}/beat`, { method: "POST", body }).catch(() => {});
      heartbeat = setTimeout(beat, beatMs);
    };
    heartbeat = setTimeout(beat, beatMs);
    const onFullscreen = () => {
      this.showFullscreenBar();
      // The span so far ends with the state it had; a change too close to the last beat goes into the next span.
      if (performance.now() - lastBeat >= changeBeatGapMs) beat();
      else out = out || !inFullscreen();
    };
    document.addEventListener("fullscreenchange", onFullscreen);

    this.stop = () => {
      clearInterval(this.timer);
      this.timer = null;
      clearTimeout(heartbeat);
      clearInterval(ticker);
      cancelAnimationFrame(frame);
      integrity.remove();
      document.removeEventListener("fullscreenchange", onFullscreen);
      this.fullscreenRefused = null;
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
    this.announce(false);
    return h(
      "div",
      { class: "sl-exam sl-exam-attempt sl-exam-attempt-result" },
      h("p", {}, h("strong", {}, t("exam.attempt.submitted"), " ")),
      h("p", {}, t("exam.attempt.result", { score: result.score, count: result.questionCount, grade: result.grade }))
    );
  }
}

defineExamElement("test", WriteTest);

/**
 * Watches the handout page's sitting over the reader's stream of open tests,
 * and replaces the handout with a notice once the sitting is no longer
 * among them: the window closed, the sitting ended, or the reader was
 * marked absent. A change of group reloads the page, which then shows the
 * other handout or none.
 */
class HandoutWatch extends ExamElement {
  disconnectedCallback() {
    clearTimeout(this.retry);
    this.source?.close();
  }

  async load() {
    return null;
  }

  render() {
    this.watch();
    return "";
  }

  watch() {
    const sitting = Number(this.params.sitting);
    const source = new EventSource("/exam/api/my/events");
    this.source = source;
    let group = null;
    source.addEventListener("tests", (event) => {
      const { tests } = JSON.parse(event.data);
      window.dispatchEvent(new CustomEvent("sl-exam-open-tests", { detail: { count: tests.length } }));
      const open = tests.find((test) => test.kind === "offline" && test.sittingId === sitting);
      if (!open) {
        this.closed();
        return;
      }
      if (group !== null && open.handout !== group) window.location.reload();
      group = open.handout;
    });
    source.addEventListener("renew", () => {
      source.close();
      this.watch();
    });
    source.addEventListener("refused", () => source.close());
    source.addEventListener("error", () => {
      if (source.readyState !== EventSource.CLOSED) return;
      this.retry = setTimeout(() => this.isConnected && this.watch(), streamRetryMs);
    });
  }

  closed() {
    this.source?.close();
    const handout = document.querySelector(`.sl-exam-handout[data-sitting="${this.params.sitting}"]`);
    if (handout) handout.replaceChildren(h("p", { class: "sl-exam-handout-closed", role: "status" }, t("exam.attempt.handoutClosed")));
  }
}

defineExamElement("handout-watch", HandoutWatch);
