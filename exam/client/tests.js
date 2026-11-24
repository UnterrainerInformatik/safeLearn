/**
 * The online tests' elements for teachers (`online-test`):
 *
 * - `tests`: the tests of the course the bar chose, or of every course of its
 *   school year, grouped by class and course
 * - `test-detail`: one test - its sittings, scheduling, changing and deleting
 *   them before they open, rescheduling one that is over, its snapshot in the course's language with the
 *   correct answers marked, renaming, and while nobody has written it,
 *   removing questions and deleting it
 *
 * An offline test (`offline-test`, `exam-handout`) is listed beside them by
 * its kind, and its page shows its duration, its gradebook category, its
 * handouts - a path that no longer resolves in red - chosen in the picker,
 * their preview and solution page, the values of their variables - a name
 * without one in red - and its sittings, which are planned and
 * started from their attendance page.
 *
 * A test on paper (`offline-test-questions`) is an offline test composed
 * from pool questions instead of handouts: its page shows each group's
 * questions with their order, weight and answer lines, the print buttons of
 * each group's sheet and solution, and the correction table, in which each
 * question of each present student gets a grade from 1 to 5. Every
 * question of an online test carries a weight too (pool-quickie design D1).
 *
 * A snapshot's texts are stored markup, sanitized when the pool was imported,
 * as in the pool's preview.
 *
 * The API refuses every session not acting as a teacher; these elements only
 * draw what it answers.
 */

import { parseTime } from "../../i18n/format.js";
import { button, confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, examMe, format, gridArrowKeys, h, linkButton, markRows, readOnlyFor, saveOnChange, t } from "./frame.js";
import { displayClass, personName } from "./classes.js";
import { openCreatorOf } from "./bar.js";
import { defaultLength, defaultOffset, defaultPeriods, defaultStart, matchStart, matchWindow, nextWeekday, periodTimes, startWindowFor, viennaInstant, viennaLocal, windowFor } from "./periods.js";
import { pickHandout } from "./handout-picker.js";
import { testTiming } from "./test-timing.js";
import { timingTone } from "./row-tone.js";
import { openEvaluation } from "./evaluation.js";

const stateLabels = {
  scheduled: () => t("exam.tests.stateScheduled"),
  open: () => t("exam.tests.stateOpen"),
  over: () => t("exam.tests.stateOver"),
};

/** A timestamp as a teacher in Vienna reads it, in the reader's format. */
export function displayTime(iso) {
  return format.dateTime(iso);
}

/**
 * "lessons 3–4", or "lesson 3" ("3.–4. EH", "3. EH"), with the clock times as
 * its tooltip. Every period the module shows is drawn here, so none lacks its
 * times (`school-periods`, design.md, D6).
 */
export function periodLabel(periods, from, to = from) {
  return h(
    "span",
    { class: "sl-exam-periods", title: periodTimes(periods, from, to) },
    from === to ? t("exam.periods.lesson", { n: from }) : t("exam.periods.lessons", { from, to })
  );
}

/**
 * The print buttons of one resolving handout (print-offline-handout design
 * D4): Print and, where it has a solution, Print solution, each opening the
 * printed document in a new tab. `base` is the page the routes hang off
 * (`/exam/tests/1` or `/exam/sittings/4`), `missing` the handout's variables
 * without a value: while there is one, both are disabled and the names are
 * shown beside them in red. The server refuses such a print too.
 */
export function handoutPrintControls(base, handout, missing) {
  const blocked = missing.length > 0;
  const control = (solution) => {
    const label = solution ? t("exam.offline.printSolution") : t("exam.offline.printHandout");
    const className = solution ? "sl-exam-handout-print-solution" : "sl-exam-handout-print";
    return blocked
      ? button({ label, class: className, disabled: true, title: `${t("exam.offline.printBlocked")} ${missing.join(", ")}` })
      : linkButton({ label, href: `${base}/handouts/${handout.group}/${solution ? "solution/" : ""}print`, newWindow: true, class: className });
  };
  return h(
    "span",
    { class: "sl-exam-handout-prints", "data-group": handout.group },
    control(false),
    handout.hasSolution ? [" ", control(true)] : null,
    blocked
      ? h(
          "span",
          { class: "sl-exam-message sl-exam-handout-print-blocked" },
          ` ${t("exam.offline.printBlocked")} `,
          missing.flatMap((name, index) => [index ? ", " : null, h("code", { class: "sl-exam-variable-name is-missing", "data-variable": name }, name)])
        )
      : null
  );
}

/**
 * The print buttons of one group's sheet of a test on paper
 * (`offline-test-questions`): the sheet and its solution, each in a new tab.
 * `base` is the test's or the sitting's page path, whose date the print
 * carries.
 */
export function sheetPrintControls(base, group) {
  const control = (solution) =>
    linkButton({
      label: solution ? t("exam.paper.printSolution") : t("exam.paper.printSheet"),
      href: `${base}/sheets/${group}/${solution ? "solution/" : ""}print`,
      newWindow: true,
      class: solution ? "sl-exam-sheet-print-solution" : "sl-exam-sheet-print",
    });
  return h("span", { class: "sl-exam-sheet-prints", "data-group": group }, control(false), " ", control(true));
}

/** The variables of `handout` that `variables` - a test's, `{ name, value }` - hold no value for. */
function printMissing(handout, variables) {
  const without = new Set((variables ?? []).filter((variable) => variable.value === null).map((variable) => variable.name));
  return (handout.variables ?? []).filter((name) => without.has(name));
}

/**
 * A sitting's window as an element: the day and its periods when it lies on
 * period boundaries, otherwise its clock times, the end without its date when
 * it closes on the day it opens.
 */
export function displayWindow({ opensAt, closesAt }, periods = []) {
  const match = matchWindow(periods, opensAt, closesAt);
  if (match) return h("span", { class: "sl-exam-window" }, `${format.weekdayDay(opensAt)} · `, periodLabel(periods, match.from, match.to));
  const sameDay = viennaLocal(opensAt).date === viennaLocal(closesAt).date;
  return h("span", { class: "sl-exam-window" }, `${displayTime(opensAt)} – ${sameDay ? format.time(closesAt) : displayTime(closesAt)}`);
}

/**
 * The start window of an online sitting as an element (sitting-start-window
 * design D6): its day, the period it opens in when there is one, and the word
 * for the start with its clock times - `Di. 20.10. · 4. EH · Start
 * 11:00–11:10`. One that closes on another date shows both in full.
 */
export function displayStartWindow({ opensAt, closesAt }, periods = []) {
  if (viennaLocal(opensAt).date !== viennaLocal(closesAt).date) {
    return h("span", { class: "sl-exam-window sl-exam-start-window" }, t("exam.periods.start", { from: displayTime(opensAt), to: displayTime(closesAt) }));
  }
  const match = matchStart(periods, opensAt, closesAt);
  return h(
    "span",
    { class: "sl-exam-window sl-exam-start-window" },
    `${format.weekdayDay(opensAt)} · `,
    match ? [periodLabel(periods, match.n), " · "] : null,
    t("exam.periods.start", { from: format.time(opensAt), to: format.time(closesAt) })
  );
}

/** A sitting's window as its kind shows it: an online sitting's start window, an offline one's shared window. */
export function displaySittingWindow(sitting, periods, offline) {
  return offline ? displayWindow(sitting, periods) : displayStartWindow(sitting, periods);
}

/**
 * The buttons of a sitting: its live view, in every state, and while it has
 * not ended the view for the class, which opens in a window of its own for the
 * projector.
 */
function sittingLinks(sitting, offline = false) {
  return [
    " ",
    linkButton({ label: offline ? t("exam.offline.attendanceLink") : t("exam.tests.liveViewLink"), href: `/exam/sittings/${sitting.id}/live`, class: "sl-exam-live-link" }),
    sitting.state === "over"
      ? null
      : [" ", linkButton({ label: t("exam.tests.classScreenLink"), href: `/exam/sittings/${sitting.id}/screen`, newWindow: true, class: "sl-exam-screen-link" })],
  ];
}

const timingLabels = {
  open: () => t("exam.tests.timingOpen"),
  done: () => t("exam.tests.timingDone"),
  soon: () => t("exam.tests.timingSoon"),
  later: () => t("exam.tests.timingLater"),
};

/** The legend of the list's row colours. */
function timingLegend() {
  return h(
    "p",
    { class: "sl-exam-quiet sl-exam-legend" },
    ["open", "soon", "later", "done"].map((timing) =>
      h("span", { class: "sl-exam-legend-item", "data-timing": timing, "data-tone": timingTone[timing] }, timingLabels[timing]())
    )
  );
}

/** A list of tests, one group per course. */
class TestList extends ExamElement {
  async load() {
    const { course, class: klass, year } = this.params;
    const query = course ? `?course=${course}` : klass ? `?class=${klass}` : year ? `?year=${year}` : "";
    const [list, me] = await Promise.all([examApi(`/tests${query}`), examMe()]);
    this.periods = me.periods ?? [];
    return list;
  }

  render(list) {
    if (list.groups.length === 0) {
      return h(
        "div",
        { class: "sl-exam" },
        h(
          "p",
          {},
          list.class
            ? t("exam.tests.classWithoutCourse", { name: displayClass(list.class.name) })
            : list.year
              ? t("exam.tests.yearWithoutCourse", { year: list.year.name })
              : t("exam.tests.noYear")
        ),
        list.year ? null : h("p", {}, button({ label: t("exam.classes.createYear"), kind: "primary", class: "sl-exam-year-create", action: () => openCreatorOf("year") }))
      );
    }
    return h(
      "div",
      { class: "sl-exam sl-exam-tests" },
      list.groups.some((group) => group.tests.length > 0) ? timingLegend() : null,
      list.groups.map((group) => this.group(group, list.scope === "course"))
    );
  }

  group(group, single) {
    const title = `${displayClass(group.className)} ${group.subject}`;
    // A new test is assembled in the pool, with this course chosen in the bar.
    const newTest = linkButton({ label: t("exam.tests.newTest"), href: `/exam/pool?course=${group.courseId}`, kind: "primary", class: "sl-exam-tests-new" });
    const offlineForm = h("div", { class: "sl-exam-offline-new-form" });
    // Only while the course uses manual or short tests (gradebook-presentations-projects design D4).
    const newOffline =
      group.offlineKinds.length === 0
        ? null
        : button({ label: t("exam.offline.newTest"), class: "sl-exam-tests-new-offline", action: () => offlineForm.replaceChildren(offlineTestForm(group.courseId, group.offlineKinds, () => offlineForm.replaceChildren())) });
    return h(
      "section",
      { class: "sl-exam-tests-course", "data-course": String(group.courseId) },
      single ? null : h("h2", {}, h("a", { href: `/exam/tests?course=${group.courseId}` }, title)),
      h("p", { class: "sl-exam-actions" }, newTest, newOffline ? [" ", newOffline] : null),
      offlineForm,
      group.tests.length === 0
        ? h("p", { class: "sl-exam-quiet" }, t("exam.tests.noTestYet"))
        : markRows(
            h(
              "table",
              { class: "sl-exam-table" },
              h("thead", {}, h("tr", {}, h("th", {}, t("exam.tests.columnTest")), h("th", {}, t("exam.tests.columnQuestions")), h("th", {}, t("exam.tests.columnSittings")), h("th", {}, t("exam.tests.columnSubmitted")))),
              h(
                "tbody",
                {},
                group.tests.map((test) => {
                  const timing = testTiming(test);
                  return h(
                    "tr",
                    { "data-test": String(test.id), "data-kind": test.kind, "data-timing": timing, "data-tone": timingTone[timing], title: timingLabels[timing]() },
                    h(
                      "td",
                      {},
                      h("a", { href: `/exam/tests/${test.id}` }, test.name),
                      test.kind === "offline" ? [" ", kindMarker(), handoutPaths(test.handouts)] : null
                    ),
                    test.kind === "offline" && !test.paper
                      ? h("td", { class: "sl-exam-quiet" }, "–")
                      : test.questions === 0
                        ? h("td", { class: "sl-embed-error", title: t("exam.tests.noQuestions") }, "0")
                        : h("td", {}, String(test.questions)),
                    h(
                      "td",
                      {},
                      test.sittings.length === 0
                        ? h("span", { class: "sl-exam-quiet" }, t("exam.tests.noneYet"))
                        : h(
                            "ul",
                            { class: "sl-exam-tests-sittings" },
                            test.sittings.map((sitting) =>
                              h(
                                "li",
                                { "data-state": sitting.state },
                                sitting.makeup ? `${t("exam.tests.makeupPrefix")} ` : null,
                                displaySittingWindow(sitting, this.periods, test.kind === "offline"),
                                ` · ${offlineState(test.kind, sitting)}`,
                                sittingLinks(sitting, test.kind === "offline")
                              )
                            )
                          )
                    ),
                    h("td", {}, test.kind === "offline" ? "–" : String(test.submitted))
                  );
                })
              )
            )
          )
    );
  }
}

defineExamElement("tests", TestList);

/** The marker of an offline test in a list. */
function kindMarker() {
  return h("span", { class: "sl-exam-kind-offline", title: t("exam.offline.kindNote") }, t("exam.offline.kind"));
}

/** A sitting's state as a list shows it; an offline one not yet started is "not started". */
function offlineState(kind, sitting) {
  return kind === "offline" && !sitting.startedAt ? t("exam.offline.notStarted") : stateLabels[sitting.state]();
}

/** A test's handout paths, each in red when no file is there any more. */
function handoutPaths(handouts = []) {
  if (handouts.length === 0) return null;
  return h(
    "span",
    { class: "sl-exam-handout-paths" },
    handouts.map((handout) => [
      " ",
      h(
        "code",
        {
          class: handout.resolves ? "sl-exam-handout-path" : "sl-exam-handout-path is-broken",
          "data-group": handout.group,
          title: handout.resolves ? null : t("exam.offline.handoutBroken"),
        },
        `${handout.group}: ${handout.path}`
      ),
    ])
  );
}

/**
 * The form that creates an offline test for a course: its name, its duration
 * and whether it counts as a test or a short test, of the `kinds` the course
 * uses. Its page opens after.
 */
function offlineTestForm(courseId, kinds, close) {
  const name = h("input", { type: "text", name: "name", maxlength: "80", required: true });
  const minutes = h("input", { type: "number", name: "durationMinutes", min: "1", max: "600", required: true, value: "50", class: "sl-exam-number" });
  const labels = { test: t("exam.offline.countsAsTest"), shorttest: t("exam.offline.countsAsShortTest") };
  const kind = h("select", { name: "gradebookKind" }, kinds.map((value) => h("option", { value }, labels[value])));
  const message = h("p", { class: "sl-exam-message", role: "status" });
  return h(
    "form",
    {
      class: "sl-exam-offline-new",
      onSubmit: async (event) => {
        event.preventDefault();
        try {
          const test = await examApi(`/courses/${courseId}/offline-tests`, {
            method: "POST",
            body: { name: name.value, durationMinutes: Number(minutes.value), gradebookKind: kind.value },
          });
          window.location.assign(`/exam/tests/${test.id}`);
        } catch (error) {
          message.textContent = refusal(error);
        }
      },
    },
    h("h3", {}, t("exam.offline.newTest")),
    h("label", {}, `${t("exam.tests.nameLabel")} `, name),
    " ",
    h("label", {}, `${t("exam.offline.durationLabel")} `, minutes),
    " ",
    h("label", {}, `${t("exam.offline.gradebookKindLabel")} `, kind),
    h("p", {}, h("button", { type: "submit", class: "sl-exam-primary" }, t("exam.offline.create")), " ", h("button", { type: "button", class: "sl-exam-action", onClick: close }, t("exam.tests.cancel"))),
    message
  );
}

/** Stored, sanitized markup as a node. */
function storedMarkup(html, className) {
  const container = h("div", { class: className });
  container.innerHTML = html;
  return container;
}

/** Why a request was refused, in a sentence for the teacher. */
function refusal(error) {
  return error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.frame.saveFailed");
}

/** One test for its teacher. */
class TestDetail extends ExamElement {
  async load() {
    const [test, me] = await Promise.all([examApi(`/tests/${this.params.test}`), examMe()]);
    this.periods = me.periods ?? [];
    this.admin = me.admin === true;
    const klass = await examApi(`/classes/${test.course.classId}`);
    this.roster = klass.roster.filter((entry) => !entry.leftAt);
    return test;
  }

  /**
   * The names of `usernames`, comma-separated, a Matura candidate of the
   * test's course marked (`exam-participant-role`); a username off the roster
   * as it is.
   */
  participantNames(usernames) {
    const subject = this.test.course.subject.toLowerCase();
    const entries = new Map(this.roster.map((entry) => [entry.username, entry]));
    return usernames.flatMap((username, index) => {
      const entry = entries.get(username);
      return [index ? ", " : null, entry ? personName(entry, entry.examParticipantIn?.includes(subject) === true) : username];
    });
  }

  /** A sitting's participants for its summary, the retakes among them marked (makeup-for-everyone-not-written D5). */
  sittingParticipants(sitting) {
    const names = sitting.makeup || sitting.participants.length < this.roster.length ? this.participantNames(sitting.participants) : t("exam.tests.wholeClassLower");
    const retakes = sitting.retakes ?? [];
    return retakes.length === 0 ? names : [names, h("span", { class: "sl-exam-quiet sl-exam-sitting-retake-list" }, ` · ${t("exam.tests.retakeMarker")}: `, this.participantNames(retakes))];
  }

  /**
   * What a make-up's form shows instead of a choice of participants
   * (makeup-for-everyone-not-written design D5): the students who have
   * written, each with a box that marks them to write the test again, ticked
   * for the current retakes of `sitting`. Answers the element - null when
   * nobody has written - and a reader of the ticked usernames.
   */
  retakeChoice(test, sitting) {
    const ticked = new Set(sitting?.retakes ?? []);
    const written = test.written ?? [];
    const element =
      written.length === 0
        ? null
        : h(
            "div",
            { class: "sl-exam-sitting-retakes" },
            h("p", {}, t("exam.tests.writtenHeading")),
            h(
              "ul",
              { class: "sl-exam-sitting-people" },
              written.map((username) =>
                h("li", {}, h("label", {}, h("input", { type: "checkbox", name: "retake", value: username, checked: ticked.has(username) }), " ", this.participantNames([username])))
              )
            )
          );
    return { element, retakes: () => (element ? [...element.querySelectorAll("input[name=retake]:checked")].map((input) => input.value) : []) };
  }

  /**
   * The test page's "Discard test" (makeup-for-everyone-not-written design
   * D4): whenever the server would discard the test now - an online test
   * once it has opened and no make-up is open, an offline one once started
   * and not running -, its second click naming the results that go.
   */
  discardSection(test) {
    if (!test.discard?.allowed) return null;
    this.discardLine = h("span", { class: "sl-exam-message", role: "status" });
    return h(
      "p",
      { class: "sl-exam-test-discard-row" },
      confirmButton({
        class: "sl-exam-test-discard",
        label: t("exam.live.discard"),
        armed: () => t("exam.live.discardArmed", { count: test.discard.results }),
        action: () => this.discardTest(test),
      }),
      " ",
      this.discardLine
    );
  }

  render(test) {
    this.test = test;
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    this.sittingLines = new Map();
    if (test.kind === "offline") return this.renderOffline(test);
    const course = test.course;
    const en = course.language === "en";
    return readOnlyFor({ name: course.yearName, closed: course.yearClosed }, h(
      "div",
      { class: "sl-exam sl-exam-test" },
      h(
        "p",
        { class: "sl-exam-quiet sl-exam-test-head" },
        h("a", { href: `/exam/tests?course=${course.id}` }, `${displayClass(course.className)} ${course.subject}`),
        ` (${course.yearName}) · ${en ? t("exam.classes.languageEnglish") : t("exam.classes.languageGerman")} · ${t("exam.tests.questionCount", { count: test.questions.length })} · `,
        h("span", { class: "sl-exam-test-total-weight" }, t("exam.paper.totalWeight", { weight: test.totalWeight?.A ?? test.questions.length })),
        " · ",
        test.started ? t("exam.tests.writtenBy", { started: test.attempts.started, submitted: test.attempts.submitted }) : t("exam.tests.notWrittenYet")
      ),
      h(
        "p",
        { class: "sl-exam-actions sl-exam-test-actions" },
        linkButton({ label: t("exam.tests.tryAsStudent"), href: `/exam/tests/${test.id}/preview`, newWindow: true, title: t("exam.tests.tryAsStudentNote"), class: "sl-exam-test-preview" }),
        linkButton({ label: t("exam.tests.boardSolution"), href: `/exam/tests/${test.id}/solution`, newWindow: true, title: t("exam.tests.boardSolutionNote"), class: "sl-exam-test-solution" }),
        test.started ? null : linkButton({ label: t("exam.tests.addFromPool"), href: `/exam/pool?course=${course.id}`, class: "sl-exam-test-add" }),
        this.evaluationAction(test)
      ),
      h("p", { class: "sl-exam-quiet" }, `${t("exam.tests.tryAsStudentNote")} ${t("exam.tests.boardSolutionNote")}`),
      this.renameForm(test),
      this.message,
      this.sittingsSection(test),
      h("h2", {}, t("exam.tests.questionsHeading")),
      test.started
        ? h(
            "p",
            { class: "sl-exam-quiet" },
            this.admin
              ? t("exam.tests.writtenAdminNote")
              : t("exam.tests.writtenNote")
          )
        : null,
      test.questions.length === 0 ? h("p", { class: "sl-exam-test-empty", role: "status" }, t("exam.tests.noQuestions")) : null,
      h(
        "ol",
        { class: "sl-exam-test-questions" },
        test.questions.map((question) =>
          h(
            "li",
            { "data-question": String(question.id), lang: course.language },
            h("h3", {}, en ? question.nameEn : question.nameDe),
            this.weightControl(test, question, test.started),
            storedMarkup(en ? question.textEn : question.textDe, "sl-exam-pool-text"),
            h(
              "ol",
              { class: "sl-exam-pool-answers" },
              question.answers.map((answer) =>
                h(
                  "li",
                  { class: answer.correct ? "is-correct" : "" },
                  h("span", { class: "sl-exam-pool-mark", "aria-label": answer.correct ? t("exam.tests.correct") : t("exam.tests.wrong") }, answer.correct ? "✓" : "✗"),
                  storedMarkup(en ? answer.textEn : answer.textDe, "sl-exam-pool-answer")
                )
              )
            ),
            test.questions.length === 1
              ? null
              : !test.started
                ? confirmButton({
                    class: "sl-exam-test-remove",
                    label: t("exam.tests.removeQuestion"),
                    armed: t("exam.tests.removeQuestionUnwrittenArmed"),
                    action: () => this.removeQuestion(question.questionId),
                  })
                : this.admin
                  ? confirmButton({
                      class: "sl-exam-test-remove sl-exam-admin",
                      label: t("exam.tests.removeQuestion"),
                      armed: t("exam.tests.removeQuestionArmed"),
                      action: () => this.removeWrittenQuestion(question.id),
                    })
                  : null
          )
        )
      )
    ));
  }

  /**
   * The test's sittings with their windows, durations, participants and
   * states, and the form that schedules one - the first for the whole class or
   * chosen students, every later one a make-up for everybody who has not
   * written, with the first one's duration. A sitting that has not opened can be changed or
   * deleted; one that is over can be rescheduled - with attempts by an admin
   * only, since they are deleted.
   */
  sittingsSection(test) {
    const list =
      test.sittings.length === 0
        ? h("p", { class: "sl-exam-quiet" }, t("exam.tests.noSittingYet"))
        : h(
            "ul",
            { class: "sl-exam-test-sittings" },
            test.sittings.map((sitting) =>
              h(
                "li",
                { "data-sitting": String(sitting.id), "data-state": sitting.state },
                h("strong", {}, `${sitting.makeup ? t("exam.tests.makeupLabel") : t("exam.tests.sittingLabel")} `),
                displayStartWindow(sitting, this.periods),
                `, ${t("exam.tests.minutesPerAttempt", { minutes: Math.round(sitting.durationS / 60) })} · ${stateLabels[sitting.state]()} · `,
                this.sittingParticipants(sitting),
                sittingLinks(sitting),
                sitting.state === "scheduled"
                  ? [
                      " ",
                      h("button", { type: "button", class: "sl-exam-action sl-exam-sitting-edit", onClick: () => this.editSitting(test, sitting) }, t("exam.tests.change")),
                      " ",
                      confirmButton({
                        class: "sl-exam-sitting-delete",
                        label: t("exam.tests.delete"),
                        armed: t("exam.tests.deleteSittingArmed"),
                        action: () => this.deleteSitting(sitting),
                      }),
                    ]
                  : null,
                sitting.state === "over" && (sitting.attempts === 0 || this.admin)
                  ? [
                      " ",
                      h(
                        "button",
                        {
                          type: "button",
                          class: sitting.attempts === 0 ? "sl-exam-action sl-exam-sitting-reschedule" : "sl-exam-action sl-exam-sitting-reschedule sl-exam-admin",
                          onClick: () => this.editSitting(test, sitting, true),
                        },
                        t("exam.tests.reschedule")
                      ),
                    ]
                  : null,
                this.sittingLine(sitting)
              )
            )
          );
    this.sittingForm = h("div", { class: "sl-exam-sitting-form" });
    this.drawSittingForm(test, null);
    return h(
      "section",
      { class: "sl-exam-test-sittings-section" },
      h("h2", {}, t("exam.tests.sittingsHeading")),
      list,
      this.discardSection(test),
      this.sittingForm
    );
  }

  /**
   * The choice of a first sitting's participants: the whole class, or the
   * students ticked. A make-up has none (makeup-for-everyone-not-written D5).
   */
  participantChoice(sitting, makeup) {
    const chosen = new Set(sitting ? sitting.participants : []);
    const whole = h("input", { type: "checkbox", name: "whole", checked: !makeup && (sitting === null || sitting.participants.length === this.roster.length) });
    const people = h(
      "ul",
      { class: "sl-exam-sitting-people" },
      this.roster.map((entry) =>
        h("li", {}, h("label", {}, h("input", { type: "checkbox", name: "participant", value: entry.username, checked: chosen.has(entry.username) }), " ", this.participantNames([entry.username])))
      )
    );
    const showPeople = () => {
      people.hidden = whole.checked;
    };
    whole.addEventListener("change", showPeople);
    showPeople();
    return { whole, people };
  }

  /**
   * The form for a new sitting, for changing `sitting`, or for rescheduling it
   * once it is over. Its window is one state that two editors read and write:
   * date and periods when the school's periods are configured, clock times
   * otherwise or when the teacher switches to them (`school-periods`,
   * design.md, D7). Rescheduling proposes the next weekday with the sitting's
   * periods - or its clock times - and changes nothing but the window.
   * A new make-up is seldom needed: its form waits behind a button until
   * `openMakeup`.
   */
  drawSittingForm(test, sitting, reschedule = false, openMakeup = false) {
    if (reschedule) {
      this.rescheduleForm(sitting);
      return;
    }
    const first = test.sittings.find((candidate) => !candidate.makeup) ?? null;
    const makeup = sitting ? sitting.makeup : first !== null;
    // A test without questions cannot be scheduled; the server refuses it too.
    const empty = test.questions.length === 0;
    if (!sitting && makeup && !openMakeup) {
      this.sittingForm.replaceChildren(
        h("p", {}, h("button", { type: "button", class: "sl-exam-action sl-exam-sitting-makeup", disabled: empty, onClick: () => this.drawSittingForm(test, null, false, true) }, t("exam.tests.scheduleMakeup")))
      );
      return;
    }
    const periods = this.periods;
    let windowState;
    if (sitting) {
      windowState = { opensAt: sitting.opensAt, closesAt: sitting.closesAt };
    } else if (periods.length > 0) {
      const proposed = defaultStart(periods);
      windowState = startWindowFor(periods, proposed.date, proposed.n, proposed.offset, proposed.length);
    } else {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      start.setMinutes(0, 0, 0);
      windowState = { opensAt: start.toISOString(), closesAt: new Date(start.getTime() + defaultLength * 60 * 1000).toISOString() };
    }
    const duration = h("input", {
      type: "number",
      name: "durationMinutes",
      min: "1",
      max: "600",
      required: true,
      class: "sl-exam-number",
      value: String(Math.round((sitting?.durationS ?? first?.durationS ?? 900) / 60)),
      disabled: makeup || (sitting !== null && test.sittings.some((candidate) => candidate.makeup)),
    });
    const windowEditor = this.windowEditor(windowState, () => Number(duration.value));
    duration.addEventListener("input", () => windowEditor.refresh());
    const { whole, people } = this.participantChoice(sitting, makeup);
    const retakes = makeup ? this.retakeChoice(test, sitting) : null;
    const message = h("p", { class: "sl-exam-message", role: "status" });
    const form = h(
      "form",
      {
        onSubmit: async (event) => {
          event.preventDefault();
          const body = {
            ...windowEditor.current(),
            durationMinutes: Number(duration.value),
            // A make-up's participants are never chosen, only its retakes (makeup-for-everyone-not-written D2).
            ...(makeup ? { retakes: retakes.retakes() } : { participants: whole.checked ? null : [...people.querySelectorAll("input:checked")].map((input) => input.value) }),
          };
          try {
            await examApi(sitting ? `/sittings/${sitting.id}` : `/tests/${test.id}/sittings`, { method: sitting ? "PUT" : "POST", body });
            this.reload();
          } catch (error) {
            // A refused change is told at its sitting, a refused new one at the form.
            (sitting ? this.sittingLine(sitting) : message).textContent = refusal(error);
          }
        },
      },
      h("h3", {}, sitting ? t("exam.tests.changeSitting") : makeup ? t("exam.tests.scheduleMakeup") : t("exam.tests.scheduleSitting")),
      windowEditor.element,
      h("label", {}, `${t("exam.tests.minutesPerAttemptLabel")} `, duration),
      makeup ? [h("p", { class: "sl-exam-quiet sl-exam-makeup-explanation" }, t("exam.tests.makeupExplanation")), retakes.element] : [h("label", {}, whole, ` ${t("exam.tests.wholeClass")}`), people],
      h("p", {}, h("button", { type: "submit", class: "sl-exam-primary", disabled: !sitting && empty, title: !sitting && empty ? t("exam.tests.noQuestions") : null }, sitting ? t("exam.tests.save") : t("exam.tests.schedule")), sitting || makeup ? [" ", h("button", { type: "button", class: "sl-exam-action", onClick: () => this.drawSittingForm(test, null) }, t("exam.tests.cancel"))] : null),
      message
    );
    this.sittingForm.replaceChildren(form);
  }

  /**
   * The form that reschedules `sitting`, which is over: the window proposed on
   * the next weekday, the minutes per attempt and the participants shown but
   * not changed. Deleting attempts takes a second click on save, its label
   * naming how many go.
   */
  rescheduleForm(sitting) {
    const windowEditor = this.windowEditor(this.proposedWindow(sitting, nextWeekday(viennaLocal(new Date()).date)), () => Math.round(sitting.durationS / 60));
    const save = async () => {
      try {
        await examApi(`/sittings/${sitting.id}/reschedule`, { method: "POST", body: { ...windowEditor.current(), attempts: sitting.attempts } });
        this.reload();
      } catch (error) {
        this.sittingLine(sitting).textContent = refusal(error);
      }
    };
    const submit =
      sitting.attempts === 0
        ? h("button", { type: "submit", class: "sl-exam-primary sl-exam-reschedule-save" }, t("exam.tests.save"))
        : confirmButton({
            class: "sl-exam-reschedule-save sl-exam-admin",
            label: t("exam.tests.save"),
            armed: t("exam.tests.rescheduleArmed", { count: sitting.attempts }),
            action: save,
          });
    const form = h(
      "form",
      {
        class: "sl-exam-reschedule",
        onSubmit: (event) => {
          event.preventDefault();
          // With attempts only the armed button saves; Enter in a field does not.
          if (sitting.attempts === 0) save();
        },
      },
      h("h3", {}, t("exam.tests.rescheduleSitting")),
      windowEditor.element,
      h(
        "dl",
        { class: "sl-exam-reschedule-kept" },
        h("dt", {}, t("exam.tests.minutesPerAttemptLabel")),
        h("dd", {}, String(Math.round(sitting.durationS / 60))),
        h("dt", {}, t("exam.tests.participants")),
        h("dd", {}, this.participantNames(sitting.participants))
      ),
      h("p", { class: "sl-exam-quiet" }, t("exam.tests.rescheduleNote")),
      h("p", {}, submit, " ", h("button", { type: "button", class: "sl-exam-action", onClick: () => this.drawSittingForm(this.test, null) }, t("exam.tests.cancel")))
    );
    this.sittingForm.replaceChildren(form);
  }

  /**
   * The start window `sitting` is proposed again with on `date` (design D5):
   * the same period, minutes after its start and length when it opened within
   * a period, otherwise the same clock time and length.
   */
  proposedWindow(sitting, date) {
    const periods = this.periods;
    const match = matchStart(periods, sitting.opensAt, sitting.closesAt);
    if (match) {
      try {
        return startWindowFor(periods, date, match.n, match.offset, match.length);
      } catch {
        // A start window that would cross midnight there: the clock time below.
      }
    }
    const opens = viennaInstant(date, viennaLocal(sitting.opensAt).time);
    const length = Date.parse(sitting.closesAt) - Date.parse(sitting.opensAt);
    return { opensAt: opens.toISOString(), closesAt: new Date(opens.getTime() + length).toISOString() };
  }

  /**
   * The start window of a sitting form, starting from `initial`: the periods
   * editor with its switch to clock times when the school's periods are
   * configured, the clock editor otherwise (`school-periods`). Below them the
   * start window as it stands and the time the last attempt ends at the
   * latest, from the minutes `duration()` answers. `current()` answers the
   * start window, `refresh()` draws that line again.
   */
  windowEditor(initial, duration) {
    const periods = this.periods;
    let windowState = { ...initial };
    const summary = h("p", { class: "sl-exam-quiet sl-exam-sitting-summary" });
    const refresh = () => {
      const minutes = duration();
      const latest = Number.isInteger(minutes) && minutes > 0 ? new Date(Date.parse(windowState.closesAt) + minutes * 60000).toISOString() : null;
      summary.replaceChildren(
        displayStartWindow(windowState, periods),
        latest ? h("span", { class: "sl-exam-sitting-latest" }, ` · ${t("exam.tests.latestEnd", { time: viennaLocal(latest).date === viennaLocal(windowState.closesAt).date ? format.time(latest) : displayTime(latest) })}`) : null
      );
    };
    const changed = (next) => {
      windowState = next;
      refresh();
    };
    if (periods.length === 0) {
      const element = h("div", { class: "sl-exam-sitting-window" }, ...this.clockEditor(windowState, changed), summary);
      return { element, current: () => windowState, refresh };
    }
    let byPeriods = matchStart(periods, windowState.opensAt, windowState.closesAt) !== null;
    const element = h("div", { class: "sl-exam-sitting-window" });
    const draw = () => {
      const toggle = h(
        "button",
        {
          type: "button",
          class: "sl-exam-sitting-mode",
          onClick: () => {
            if (!byPeriods && matchStart(periods, windowState.opensAt, windowState.closesAt) === null) {
              // A start window outside every period keeps its date and length
              // and gets the period a new sitting would, 5 minutes in.
              const date = viennaLocal(windowState.opensAt).date;
              const length = Math.round((Date.parse(windowState.closesAt) - Date.parse(windowState.opensAt)) / 60000);
              const proposed = defaultStart(periods);
              try {
                windowState = startWindowFor(periods, date, proposed.n, defaultOffset, length);
              } catch {
                windowState = startWindowFor(periods, date, proposed.n, defaultOffset, defaultLength);
              }
            }
            byPeriods = !byPeriods;
            draw();
          },
        },
        byPeriods ? t("exam.tests.exactTimesInstead") : t("exam.tests.lessonsInstead")
      );
      element.replaceChildren(...(byPeriods ? this.periodsEditor(windowState, changed) : this.clockEditor(windowState, changed)), summary, h("p", {}, toggle));
      refresh();
    };
    draw();
    return { element, current: () => windowState, refresh };
  }

  /** The field of a start window's length in whole minutes, 1 to 600. */
  lengthField(minutes) {
    return h("input", { type: "number", name: "lengthMinutes", min: "1", max: "600", step: "1", required: true, class: "sl-exam-number", value: String(minutes) });
  }

  /**
   * The clock-time editor: the date the sitting is written on, the time its
   * start window opens and its length in minutes, in Vienna time and the
   * reader's format - a start window never runs across midnight. Hands the
   * start window to `changed` whenever the fields hold a valid one; a time it
   * cannot read, or a length past midnight, marks its field invalid, so the
   * form does not submit.
   */
  clockEditor(windowState, changed) {
    const date = h("sl-date-input", { name: "date", required: true, value: viennaLocal(windowState.opensAt).date });
    const opens = h("input", {
      type: "text",
      name: "opensTime",
      required: true,
      inputmode: "numeric",
      autocomplete: "off",
      size: "5",
      placeholder: t("exam.dateInput.timePattern"),
      class: "sl-exam-time",
      value: viennaLocal(windowState.opensAt).time,
    });
    const length = this.lengthField(Math.round((Date.parse(windowState.closesAt) - Date.parse(windowState.opensAt)) / 60000));
    const update = () => {
      const from = parseTime(opens.value);
      opens.setCustomValidity(from === null ? t("exam.dateInput.unreadableTime") : "");
      opens.setAttribute("aria-invalid", String(from === null));
      length.setCustomValidity("");
      const minutes = Number(length.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || from === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) return;
      const opensAt = viennaInstant(date.value, from);
      const closesAt = new Date(opensAt.getTime() + minutes * 60000);
      if (viennaLocal(closesAt).date !== date.value) {
        length.setCustomValidity(t("exam.tests.startWindowMidnight"));
        return;
      }
      changed({ opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() });
    };
    date.addEventListener("change", update);
    for (const field of [opens, length]) {
      field.addEventListener("input", update);
      field.addEventListener("change", update);
    }
    return [
      h("label", {}, `${t("exam.tests.date")} `, date),
      " ",
      h("label", {}, `${t("exam.tests.startTime")} `, opens),
      " ",
      h("label", {}, `${t("exam.tests.startWindowLength")} `, length),
    ];
  }

  /**
   * The periods editor (design D5): a date, one period - each choice with its
   * clock times as its tooltip -, the minutes after the period's start the
   * start window opens, from 0 up to the period's length, and its length.
   * Hands every new start window to `changed`.
   */
  periodsEditor(windowState, changed) {
    const periods = this.periods;
    const current = matchStart(periods, windowState.opensAt, windowState.closesAt);
    const period = h(
      "select",
      { name: "period", required: true },
      periods.map((candidate) => h("option", { value: String(candidate.n), title: periodTimes(periods, candidate.n) }, String(candidate.n)))
    );
    period.value = String(current.n);
    const date = h("sl-date-input", { name: "date", required: true, value: current.date });
    const offset = h("input", { type: "number", name: "offsetMinutes", min: "0", step: "1", required: true, class: "sl-exam-number", value: String(current.offset) });
    const length = this.lengthField(current.length);
    const times = h("span", { class: "sl-exam-quiet sl-exam-sitting-times" });
    const periodLength = (n) => {
      const chosen = periods.find((candidate) => candidate.n === n);
      const [start, end] = [chosen.start, chosen.end].map((time) => time.split(":").map(Number)).map(([hour, minute]) => hour * 60 + minute);
      return end - start;
    };
    const update = () => {
      const n = Number(period.value);
      offset.max = String(periodLength(n) - 1);
      times.replaceChildren(periodTimes(periods, n));
      length.setCustomValidity("");
      const [minutesIn, minutes] = [Number(offset.value), Number(length.value)];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || !offset.checkValidity() || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) return;
      try {
        changed(startWindowFor(periods, date.value, n, minutesIn, minutes));
      } catch {
        length.setCustomValidity(t("exam.tests.startWindowMidnight"));
      }
    };
    for (const input of [date, period]) input.addEventListener("change", update);
    for (const input of [offset, length]) {
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    }
    offset.max = String(periodLength(current.n) - 1);
    times.replaceChildren(periodTimes(periods, current.n));
    return [
      h("label", {}, `${t("exam.tests.date")} `, date),
      " ",
      h("label", {}, `${t("exam.tests.lessonLabel")} `, period, " ", times),
      " ",
      h("label", {}, `${t("exam.tests.offsetMinutes")} `, offset),
      " ",
      h("label", {}, `${t("exam.tests.startWindowLength")} `, length),
    ];
  }

  editSitting(test, sitting, reschedule = false) {
    this.drawSittingForm(test, sitting, reschedule);
    this.sittingForm.scrollIntoView({ block: "nearest" });
  }

  /**
   * Discards the test with every result the page counted; the page then
   * shows it without a sitting, editable again. A count that changed is
   * refused beside the button, and the button's next armed label names the
   * current one.
   */
  async discardTest(test) {
    try {
      await examApi(`/tests/${test.id}/discard`, { method: "POST", body: { attempts: test.discard.results } });
      this.reload();
    } catch (error) {
      this.discardLine.textContent = refusal(error);
      if (error instanceof ExamApiError && error.status === 409) {
        try {
          test.discard = (await examApi(`/tests/${test.id}`)).discard;
        } catch {
          // The refusal stays told; the next load counts again.
        }
      }
    }
  }

  async deleteSitting(sitting) {
    try {
      await examApi(`/sittings/${sitting.id}`, { method: "DELETE" });
      this.reload();
    } catch (error) {
      this.sittingLine(sitting).textContent = refusal(error);
    }
  }

  /** The message line of one sitting, where what is done to it is answered. */
  sittingLine(sitting) {
    if (!this.sittingLines.has(sitting.id)) this.sittingLines.set(sitting.id, h("p", { class: "sl-exam-message sl-exam-sitting-message", role: "status" }));
    return this.sittingLines.get(sitting.id);
  }

  renameForm(test) {
    const name = h("input", { type: "text", name: "name", value: test.name, maxlength: "80", "aria-label": t("exam.tests.nameLabel"), required: true });
    return h(
      "form",
      {
        class: "sl-exam-test-rename",
        onSubmit: (event) => {
          event.preventDefault();
          this.change({ name: name.value }, true);
        },
      },
      name,
      " ",
      h("button", { type: "submit", class: "sl-exam-action" }, t("exam.tests.rename")),
      " ",
      test.started && !this.admin ? null : this.deleteButton(test)
    );
  }

  removeQuestion(questionId) {
    // A copy whose pool question was deleted has no id left to choose it by.
    const questionIds = this.test.questions.map((question) => question.questionId).filter((id) => id !== questionId && id !== null);
    this.change({ questionIds });
  }

  /**
   * An admin's removal from a written test, by the snapshot row - its pool
   * question may be gone; the server scores the attempts again.
   */
  async removeWrittenQuestion(testQuestionId) {
    try {
      const test = await examApi(`/tests/${this.test.id}/questions/${testQuestionId}`, { method: "DELETE" });
      this.show(this.render(test));
    } catch (error) {
      this.message.textContent = refusal(error);
    }
  }

  /** Sends a change of the test and draws what the server answers. A new name is a new page title. */
  async change(body, renamed = false) {
    try {
      const test = await examApi(`/tests/${this.test.id}`, { method: "PUT", body });
      if (renamed) {
        const heading = document.querySelector("#markdown-content h1");
        if (heading) heading.textContent = test.name;
      }
      this.show(this.render(test));
    } catch (error) {
      this.message.textContent = refusal(error);
    }
  }

  /**
   * Deleting takes a second click on the same button, so one click alone never
   * deletes. A written test only an admin deletes, with its attempts.
   */
  deleteButton(test) {
    const written = test.attempts.started;
    const button = confirmButton({
      class: test.started ? "sl-exam-test-delete sl-exam-admin" : "sl-exam-test-delete",
      label: t("exam.tests.deleteTest"),
      armed: test.started ? t("exam.tests.deleteTestWrittenArmed", { count: written }) : t("exam.tests.deleteTestArmed"),
      action: async () => {
        try {
          await examApi(`/tests/${test.id}`, { method: "DELETE" });
          window.location.assign(`/exam/tests?course=${test.course.id}`);
        } catch (error) {
          this.message.textContent = refusal(error);
        }
      },
    });
    return button;
  }
}

Object.assign(TestDetail.prototype, {
  /**
   * An offline test's page: its course, duration and gradebook category, the
   * name and duration form, its handouts and its sittings. No questions.
   */
  /**
   * The button that opens the test's evaluation for its class, the same popup
   * as the sheet's column header opens; none while the test has no column in
   * the sheet (`test-evaluation`, design D5).
   */
  evaluationAction(test) {
    if (test.column === null || test.column === undefined) return null;
    return button({ label: t("exam.evaluation.open"), class: "sl-exam-test-evaluation", action: () => openEvaluation(this, test.course.id, test.column) });
  },

  /**
   * A question's weight (pool-quickie design D1): a field from 1 to 10 saved
   * as it changes, or the weight as text once `locked`. Each save redraws the
   * total weight.
   */
  weightControl(test, question, locked) {
    if (locked) return h("p", { class: "sl-exam-quiet sl-exam-question-weight", "data-weight": String(question.weight) }, t("exam.paper.weightShown", { weight: question.weight }));
    const field = h("input", {
      type: "number",
      min: "1",
      max: "10",
      step: "1",
      class: "sl-exam-number sl-exam-question-weight-field",
      name: `weight-${question.id}`,
      value: String(question.weight),
      "aria-label": t("exam.paper.weightLabel"),
    });
    saveOnChange(field, {
      check: (value) => (/^(10|[1-9])$/.test(value.trim()) ? null : t("exam.errors.tests.weight")),
      save: (value) => examApi(`/tests/${test.id}/questions/${question.id}`, { method: "PUT", body: { weight: Number(value) } }),
      onSaved: (answer) => this.drawTotals(answer),
    });
    return h("p", { class: "sl-exam-question-weight" }, h("label", {}, `${t("exam.paper.weightLabel")} `, field));
  },

  /** Writes the total weights `test` answers into the page's total fields. */
  drawTotals(test) {
    this.test.totalWeight = test.totalWeight;
    this.test.questions = test.questions;
    for (const total of this.querySelectorAll("[data-total-group]")) {
      total.textContent = t("exam.paper.totalWeight", { weight: test.totalWeight[total.dataset.totalGroup] });
    }
    const online = this.querySelector(".sl-exam-test-total-weight");
    if (online) online.textContent = t("exam.paper.totalWeight", { weight: test.totalWeight.A });
  },

  /**
   * A test on paper's questions (`offline-test-questions`): per group its
   * questions in their order - changeable until the first sitting starts -
   * with weight and, for a free-text question, its answer lines, the group's
   * total weight, the print buttons of its sheet and solution, and the way to
   * choose its questions in the browser. Group B is offered once group A
   * holds questions.
   */
  paperSection(test) {
    const groups = test.twoGroups ? ["A", "B"] : ["A"];
    const choose = (group) =>
      linkButton({
        label: t("exam.paper.chooseQuestions", { group }),
        href: `/exam/pool?course=${test.course.id}&test=${test.id}&group=${group}`,
        class: "sl-exam-paper-choose",
        "data-group": group,
      });
    const en = test.course.language === "en";
    const section = (group) => {
      const questions = test.questions.filter((question) => question.group === group);
      const ids = questions.map((question) => question.questionId);
      const move = (index, step) => {
        const order = [...ids];
        [order[index], order[index + step]] = [order[index + step], order[index]];
        this.change({ questionIds: order.filter((id) => id !== null), group });
      };
      return h(
        "section",
        { class: "sl-exam-paper-group", "data-group": group },
        h("h3", {}, test.twoGroups ? t("exam.paper.groupHeading", { group }) : t("exam.tests.questionsHeading")),
        h(
          "p",
          { class: "sl-exam-quiet sl-exam-paper-group-head" },
          t("exam.tests.questionCount", { count: questions.length }),
          " · ",
          h("span", { "data-total-group": group }, t("exam.paper.totalWeight", { weight: test.totalWeight[group] })),
          " · ",
          sheetPrintControls(`/exam/tests/${test.id}`, group)
        ),
        questions.length === 0
          ? h("p", { class: "sl-exam-test-empty", role: "status" }, t("exam.paper.noQuestions"))
          : h(
              "ol",
              { class: "sl-exam-test-questions sl-exam-paper-questions" },
              questions.map((question, index) =>
                h(
                  "li",
                  { "data-question": String(question.id), "data-type": question.type, lang: test.course.language },
                  h("h4", {}, en ? question.nameEn : question.nameDe, question.type === "freetext" ? h("span", { class: "sl-exam-quiet" }, ` · ${t("exam.paper.freetext")}`) : null),
                  h(
                    "p",
                    { class: "sl-exam-actions sl-exam-paper-settings" },
                    this.weightControl(test, question, false),
                    question.type === "freetext" ? this.linesControl(test, question) : null,
                    test.begun
                      ? null
                      : [
                          index > 0 ? button({ label: "↑", class: "sl-exam-paper-up", title: t("exam.paper.moveUp"), "aria-label": t("exam.paper.moveUp"), action: () => move(index, -1) }) : null,
                          index < questions.length - 1
                            ? button({ label: "↓", class: "sl-exam-paper-down", title: t("exam.paper.moveDown"), "aria-label": t("exam.paper.moveDown"), action: () => move(index, 1) })
                            : null,
                          question.questionId === null
                            ? null
                            : confirmButton({
                                class: "sl-exam-test-remove",
                                label: t("exam.tests.removeQuestion"),
                                armed: t("exam.tests.removeQuestionUnwrittenArmed"),
                                action: () => this.change({ questionIds: ids.filter((id) => id !== null && id !== question.questionId), group }),
                              }),
                        ]
                  ),
                  storedMarkup(en ? question.textEn : question.textDe, "sl-exam-pool-text")
                )
              )
            ),
        test.begun ? null : h("p", {}, choose(group))
      );
    };
    const addB = !test.begun && !test.twoGroups && test.questions.length > 0 ? h("p", {}, choose("B")) : null;
    return h(
      "section",
      { class: "sl-exam-test-paper" },
      h("h2", {}, t("exam.paper.questionsHeading")),
      h("p", { class: "sl-exam-quiet" }, test.begun ? t("exam.paper.fixedNote") : t("exam.paper.followsNote")),
      groups.map(section),
      addB
    );
  },

  /** A free-text question's answer lines on the sheet, from 1 to 40, saved as they change. */
  linesControl(test, question) {
    const field = h("input", {
      type: "number",
      min: "1",
      max: "40",
      step: "1",
      class: "sl-exam-number sl-exam-question-lines-field",
      name: `lines-${question.id}`,
      value: String(question.answerLines),
      "aria-label": t("exam.paper.linesLabel"),
    });
    saveOnChange(field, {
      check: (value) => (/^\d{1,2}$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 40 ? null : t("exam.errors.tests.answerLines")),
      save: (value) => examApi(`/tests/${test.id}/questions/${question.id}`, { method: "PUT", body: { answerLines: Number(value) } }),
    });
    return h("label", { class: "sl-exam-question-lines" }, ` ${t("exam.paper.linesLabel")} `, field);
  },

  /**
   * The correction table of a test on paper (pool-quickie design D8): loaded
   * on its own, one table per group with a row per present student of that
   * group and a grade field per question, saved as it changes, with the
   * sheet's arrow keys; each row shows its result once complete, and beside
   * it the result the factor A:B makes of it.
   */
  correctionSection(test) {
    const holder = h("div", { class: "sl-exam-correction-body" }, h("p", { class: "sl-exam-quiet" }, "…"));
    const section = h("section", { class: "sl-exam-test-correction", id: "correction" }, h("h2", {}, t("exam.paper.correctionHeading")), holder);
    examApi(`/tests/${test.id}/grades`)
      .then((table) => holder.replaceChildren(this.correctionTables(test, table)))
      .catch((error) => holder.replaceChildren(h("p", { class: "sl-exam-message" }, refusal(error))));
    return section;
  },

  correctionTables(test, table) {
    if (table.rows.length === 0) return h("p", { class: "sl-exam-quiet sl-exam-correction-empty" }, t("exam.paper.noRows"));
    const groups = table.twoGroups ? ["A", "B"] : ["A"];
    const raised = table.factor.a > 1 || table.factor.b > 1;
    const percentText = (value) => (value === null || value === undefined ? "" : format.percent(value, 1));
    let rowIndex = 0;
    const draw = (group) => {
      const questions = table.questions[group];
      const rows = table.rows.filter((row) => row.group === group);
      if (rows.length === 0) return null;
      const body = h(
        "tbody",
        {},
        rows.map((row) => {
          const r = rowIndex++;
          const result = h("td", { class: "sl-exam-correction-result", "data-result": row.username });
          const showResult = (answer) => {
            result.replaceChildren(
              answer.value === null ? h("span", { class: "sl-exam-quiet" }, "–") : percentText(answer.value),
              raised && answer.counted !== null && answer.counted !== answer.value ? h("span", { class: "sl-exam-quiet sl-exam-correction-counted" }, ` → ${percentText(answer.counted)}`) : null
            );
          };
          showResult(row);
          return h(
            "tr",
            { "data-username": row.username, "data-group": group },
            h("th", { scope: "row" }, personName(row)),
            questions.map((question, c) => {
              const field = h("input", {
                type: "text",
                inputmode: "numeric",
                maxlength: "1",
                size: "2",
                class: "sl-exam-cell sl-exam-grade-cell",
                "data-row": String(r),
                "data-col": String(c),
                "data-question": String(question.id),
                value: row.grades[question.id] === undefined ? "" : String(row.grades[question.id]),
                "aria-label": `${personName(row)}: ${t("exam.paper.sheetQuestion", { n: question.n })}`,
              });
              saveOnChange(field, {
                check: (value) => (value.trim() === "" || /^[1-5]$/.test(value.trim()) ? null : t("exam.errors.paper.gradeRange")),
                save: (value) =>
                  examApi(`/tests/${test.id}/grades/${question.id}/${encodeURIComponent(row.username)}`, {
                    method: "PUT",
                    body: { grade: value.trim() === "" ? null : Number(value.trim()) },
                  }),
                onSaved: (answer) => showResult(answer),
              });
              return h("td", {}, field);
            }),
            result
          );
        })
      );
      return h(
        "div",
        { class: "sl-exam-correction-group", "data-group": group },
        table.twoGroups ? h("h3", {}, t("exam.paper.groupHeading", { group })) : null,
        gridArrowKeys(
          markRows(
            h(
              "table",
              { class: "sl-exam-table sl-exam-correction-table" },
              h(
                "thead",
                {},
                h(
                  "tr",
                  {},
                  h("th", {}, t("exam.live.columnStudent")),
                  questions.map((question) => h("th", { title: question.name, "data-question": String(question.id) }, t("exam.paper.columnQuestion", { n: question.n, weight: question.weight }))),
                  h("th", {}, t("exam.paper.columnResult"))
                )
              ),
              body
            )
          )
        )
      );
    };
    return h(
      "div",
      {},
      raised ? h("p", { class: "sl-exam-quiet sl-exam-correction-factor" }, t("exam.paper.factorNote", { a: format.fixed(table.factor.a, 2), b: format.fixed(table.factor.b, 2) })) : null,
      groups.map(draw),
      h("p", { class: "sl-exam-quiet" }, t("exam.paper.correctionNote"))
    );
  },

  renderOffline(test) {
    const course = test.course;
    return readOnlyFor({ name: course.yearName, closed: course.yearClosed }, h(
      "div",
      { class: "sl-exam sl-exam-test sl-exam-test-offline" },
      h(
        "p",
        { class: "sl-exam-quiet sl-exam-test-head" },
        h("a", { href: `/exam/tests?course=${course.id}` }, `${displayClass(course.className)} ${course.subject}`),
        ` (${course.yearName}) · `,
        kindMarker(),
        ` · ${t("exam.offline.minutes", { minutes: Math.round(test.durationS / 60) })} · ${
          test.gradebookKind === "shorttest" ? t("exam.offline.countsAsShortTest") : t("exam.offline.countsAsTest")
        }`
      ),
      h("p", { class: "sl-exam-quiet" }, test.paper ? t("exam.paper.explanation") : t("exam.offline.explanation")),
      test.column === null ? null : h("p", { class: "sl-exam-actions sl-exam-test-actions" }, this.evaluationAction(test)),
      this.offlineForm(test),
      this.message,
      test.paper ? this.paperSection(test) : this.handoutsSection(test),
      test.paper ? null : this.variablesSection(test),
      this.offlineSittingsSection(test),
      test.paper ? this.correctionSection(test) : null
    ));
  },

  /** Name and duration; the duration stays once a sitting has started, as the server says. */
  offlineForm(test) {
    const name = h("input", { type: "text", name: "name", value: test.name, maxlength: "80", "aria-label": t("exam.tests.nameLabel"), required: true });
    const minutes = h("input", { type: "number", name: "durationMinutes", min: "1", max: "600", required: true, class: "sl-exam-number", value: String(Math.round(test.durationS / 60)), "aria-label": t("exam.offline.durationLabel") });
    return h(
      "form",
      {
        class: "sl-exam-test-rename",
        onSubmit: (event) => {
          event.preventDefault();
          const body = { name: name.value };
          if (Number(minutes.value) * 60 !== test.durationS) body.durationMinutes = Number(minutes.value);
          this.change(body, true);
        },
      },
      name,
      " ",
      h("label", {}, `${t("exam.offline.durationLabel")} `, minutes),
      " ",
      h("button", { type: "submit", class: "sl-exam-action" }, t("exam.tests.save")),
      " ",
      this.deleteButton(test)
    );
  },

  /**
   * The handouts: each path - in red when no file is there any more - with
   * Change, Remove, Preview and, for a file with answers, Solution, then their
   * print buttons; then a button to choose A, or B beside a set A.
   */
  handoutsSection(test) {
    // Redrawn when a variable's value changes, so a print follows the fields.
    this.printSlots = new Map();
    const choose = async (group) => {
      const path = await pickHandout(test.course.id);
      if (path !== null) this.change({ [`handout${group}`]: path });
    };
    const rows = test.handouts.map((handout) =>
      h(
        "li",
        { "data-group": handout.group, class: handout.resolves ? null : "is-broken" },
        h("strong", {}, `${t("exam.offline.handoutLabel", { group: handout.group })} `),
        h("code", { class: handout.resolves ? "sl-exam-handout-path" : "sl-exam-handout-path is-broken", title: handout.resolves ? null : t("exam.offline.handoutBroken") }, handout.path),
        handout.resolves ? null : h("span", { class: "sl-exam-message" }, ` ${t("exam.offline.handoutBroken")}`),
        " ",
        button({ label: t("exam.offline.changeHandout"), class: "sl-exam-handout-change", action: () => choose(handout.group) }),
        " ",
        button({ label: t("exam.offline.removeHandout"), class: "sl-exam-handout-remove", action: () => this.change({ [`handout${handout.group}`]: null }) }),
        handout.resolves
          ? [
              " ",
              linkButton({ label: t("exam.offline.previewHandout"), href: `/exam/tests/${test.id}/handouts/${handout.group}/preview`, newWindow: true, class: "sl-exam-handout-preview" }),
              handout.hasSolution
                ? [" ", linkButton({ label: t("exam.offline.solutionHandout"), href: `/exam/tests/${test.id}/handouts/${handout.group}/solution`, newWindow: true, class: "sl-exam-handout-solution" })]
                : null,
              " ",
              this.printSlot(test, handout),
            ]
          : null
      )
    );
    const next = test.handouts.length === 0 ? "A" : test.handouts.length === 1 ? "B" : null;
    return h(
      "section",
      { class: "sl-exam-test-handouts" },
      h("h2", {}, t("exam.offline.handoutsHeading")),
      rows.length === 0 ? h("p", { class: "sl-exam-quiet" }, t("exam.offline.noHandout")) : h("ul", { class: "sl-exam-handouts" }, rows),
      next ? h("p", {}, button({ label: t("exam.offline.addHandout", { group: next }), class: "sl-exam-handout-add", "data-group": next, action: () => choose(next) })) : null,
      h("p", { class: "sl-exam-quiet" }, t("exam.offline.handoutNote"))
    );
  },

  /** The place of a handout's print buttons, drawn from the test's variables now. */
  printSlot(test, handout) {
    const slot = h("span", {});
    this.printSlots.set(handout.group, { slot, handout });
    this.drawPrints(test);
    return slot;
  },

  /** Draws every handout's print buttons again from `test.variables`. */
  drawPrints(test) {
    for (const { slot, handout } of this.printSlots.values()) {
      slot.replaceChildren(handoutPrintControls(`/exam/tests/${test.id}`, handout, printMissing(handout, test.variables)));
    }
  },

  /**
   * The handouts' variables `%%var NAME%%` (`exam-handout`): a field per name,
   * in the order the handouts use them, saved when it changes, at any time -
   * during the window too. `CLASS` and `DATE` are filled by the module and
   * shown read-only. A name without a value is in red, and blocks the start.
   */
  variablesSection(test) {
    const variables = test.variables ?? [];
    const rows = variables.map((variable) => {
      const name = h(
        "code",
        { class: variable.missing ? "sl-exam-variable-name is-missing" : "sl-exam-variable-name", title: variable.missing ? t("exam.offline.variableMissing") : null },
        variable.name
      );
      if (variable.auto) {
        return h(
          "li",
          { "data-variable": variable.name, "data-auto": "1" },
          name,
          " ",
          h("span", { class: "sl-exam-variable-auto" }, variable.value ?? t("exam.offline.variableNoDate")),
          " ",
          h("span", { class: "sl-exam-quiet" }, variable.name === "CLASS" ? t("exam.offline.variableClassNote") : t("exam.offline.variableDateNote"))
        );
      }
      const message = h("span", { class: "sl-exam-message", role: "status" });
      const input = h("input", {
        type: "text",
        class: "sl-exam-variable-value",
        name: `variable-${variable.name}`,
        maxlength: "500",
        value: variable.value ?? "",
        "aria-label": variable.name,
      });
      input.addEventListener("change", async () => {
        message.textContent = "";
        try {
          const answer = await examApi(`/tests/${test.id}/variables`, { method: "PUT", body: { values: { [variable.name]: input.value } } });
          if (Array.isArray(answer.variables)) {
            test.variables = answer.variables;
            this.drawPrints(test);
          }
          const now = (answer.variables ?? []).find((candidate) => candidate.name === variable.name);
          const missing = !now || now.missing;
          name.classList.toggle("is-missing", missing);
          name.title = missing ? t("exam.offline.variableMissing") : "";
          if (now && now.value !== null) input.value = now.value;
        } catch (error) {
          message.textContent = ` ${refusal(error)}`;
        }
      });
      return h("li", { "data-variable": variable.name }, h("label", {}, name, " ", input), message);
    });
    return h(
      "section",
      { class: "sl-exam-test-variables" },
      h("h2", {}, t("exam.offline.variablesHeading")),
      rows.length === 0 ? h("p", { class: "sl-exam-quiet" }, t("exam.offline.noVariables")) : h("ul", { class: "sl-exam-variables" }, rows),
      h("p", { class: "sl-exam-quiet" }, t("exam.offline.variablesNote"))
    );
  },

  /**
   * The sittings of an offline test: planned, started or over, with their
   * participants and who was absent, the attendance page and the class's
   * view; a sitting not yet started can be changed or deleted. The form
   * plans the first sitting for the class or a make-up for everybody not
   * present before, the retakes ticked among those who were.
   */
  offlineSittingsSection(test) {
    const list =
      test.sittings.length === 0
        ? h("p", { class: "sl-exam-quiet" }, t("exam.tests.noSittingYet"))
        : h(
            "ul",
            { class: "sl-exam-test-sittings" },
            test.sittings.map((sitting) =>
              h(
                "li",
                { "data-sitting": String(sitting.id), "data-state": sitting.startedAt ? sitting.state : "planned" },
                h("strong", {}, `${sitting.makeup ? t("exam.tests.makeupLabel") : t("exam.tests.sittingLabel")} `),
                sitting.startedAt ? displayWindow(sitting, this.periods) : t("exam.offline.plannedFor", { time: displayTime(sitting.opensAt) }),
                ` · ${offlineState("offline", sitting)} · `,
                this.sittingParticipants(sitting),
                sitting.absent.length > 0 ? [h("br", {}), h("span", { class: "sl-exam-quiet" }, `${t("exam.offline.absentList")} `, this.participantNames(sitting.absent))] : null,
                sittingLinks(sitting, true),
                sitting.startedAt
                  ? null
                  : [" ", h("button", { type: "button", class: "sl-exam-action sl-exam-sitting-edit", onClick: () => this.drawOfflineForm(test, sitting) }, t("exam.tests.change"))],
                // Planned, or in an emergency once over; never while it runs.
                sitting.startedAt && sitting.state === "open"
                  ? null
                  : [" ", confirmButton({ class: "sl-exam-sitting-delete", label: t("exam.tests.delete"), armed: t("exam.tests.deleteSittingArmed"), action: () => this.deleteSitting(sitting) })],
                this.sittingLine(sitting)
              )
            )
          );
    this.sittingForm = h("div", { class: "sl-exam-sitting-form" });
    this.drawOfflineForm(test, null);
    return h("section", { class: "sl-exam-test-sittings-section" }, h("h2", {}, t("exam.tests.sittingsHeading")), list, this.discardSection(test), this.sittingForm);
  },

  /** The form planning a new offline sitting, a make-up, or changing `sitting` before its start. */
  drawOfflineForm(test, sitting, openMakeup = false) {
    const first = test.sittings.find((candidate) => !candidate.makeup) ?? null;
    const makeup = sitting ? sitting.makeup : first !== null;
    if (!sitting && makeup && !openMakeup) {
      this.sittingForm.replaceChildren(h("p", {}, h("button", { type: "button", class: "sl-exam-action sl-exam-sitting-makeup", onClick: () => this.drawOfflineForm(test, null, true) }, t("exam.tests.scheduleMakeup"))));
      return;
    }
    // Proposed like an online sitting's: the next lesson, or the next full hour without periods.
    const proposed = this.periods.length > 0 ? defaultPeriods(this.periods) : null;
    const start = sitting
      ? sitting.opensAt
      : proposed
        ? windowFor(this.periods, proposed.date, proposed.from, proposed.to).opensAt
        : new Date(Math.ceil(Date.now() / 3600000) * 3600000).toISOString();
    let opensAt = start;
    const date = h("sl-date-input", { name: "date", required: true, value: viennaLocal(start).date });
    const time = h("input", { type: "text", name: "opensTime", required: true, inputmode: "numeric", autocomplete: "off", size: "5", placeholder: t("exam.dateInput.timePattern"), class: "sl-exam-time", value: viennaLocal(start).time });
    const update = () => {
      const parsed = parseTime(time.value);
      time.setCustomValidity(parsed === null ? t("exam.dateInput.unreadableTime") : "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(date.value) && parsed !== null) opensAt = viennaInstant(date.value, parsed).toISOString();
    };
    date.addEventListener("change", update);
    time.addEventListener("input", update);
    time.addEventListener("change", update);
    const { whole, people } = this.participantChoice(sitting, makeup);
    const retakes = makeup ? this.retakeChoice(test, sitting) : null;
    const message = h("p", { class: "sl-exam-message", role: "status" });
    const form = h(
      "form",
      {
        onSubmit: async (event) => {
          event.preventDefault();
          const body = makeup ? { opensAt, retakes: retakes.retakes() } : { opensAt, participants: whole.checked ? null : [...people.querySelectorAll("input:checked")].map((input) => input.value) };
          try {
            await examApi(sitting ? `/sittings/${sitting.id}` : `/tests/${test.id}/sittings`, { method: sitting ? "PUT" : "POST", body });
            this.reload();
          } catch (error) {
            (sitting ? this.sittingLine(sitting) : message).textContent = refusal(error);
          }
        },
      },
      h("h3", {}, sitting ? t("exam.tests.changeSitting") : makeup ? t("exam.tests.scheduleMakeup") : t("exam.offline.planSitting")),
      h("label", {}, `${t("exam.tests.date")} `, date),
      " ",
      h("label", {}, `${t("exam.offline.plannedStart")} `, time),
      h("p", { class: "sl-exam-quiet" }, t("exam.offline.startNote")),
      makeup ? [h("p", { class: "sl-exam-quiet sl-exam-makeup-explanation" }, t("exam.offline.makeupExplanation")), retakes.element] : [h("label", {}, whole, ` ${t("exam.tests.wholeClass")}`), people],
      h(
        "p",
        {},
        h("button", { type: "submit", class: "sl-exam-primary" }, sitting ? t("exam.tests.save") : t("exam.offline.plan")),
        sitting || makeup ? [" ", h("button", { type: "button", class: "sl-exam-action", onClick: () => this.drawOfflineForm(test, null) }, t("exam.tests.cancel"))] : null
      ),
      message
    );
    this.sittingForm.replaceChildren(form);
  },
});

defineExamElement("test-detail", TestDetail);
