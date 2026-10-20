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
 * A snapshot's texts are stored markup, sanitized when the pool was imported,
 * as in the pool's preview.
 *
 * The API refuses every session not acting as a teacher; these elements only
 * draw what it answers.
 */

import { parseTime } from "../../i18n/format.js";
import { button, confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, examMe, format, h, linkButton, markRows, readOnlyFor, t } from "./frame.js";
import { displayClass, displayPerson } from "./classes.js";
import { openCreatorOf } from "./bar.js";
import { defaultPeriods, matchWindow, nextWeekday, periodTimes, viennaInstant, viennaLocal, windowFor } from "./periods.js";

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
 * The buttons of a sitting: its live view, in every state, and while it has
 * not ended the view for the class, which opens in a window of its own for the
 * projector.
 */
function sittingLinks(sitting) {
  return [
    " ",
    linkButton({ label: t("exam.tests.liveViewLink"), href: `/exam/sittings/${sitting.id}/live`, class: "sl-exam-live-link" }),
    sitting.state === "over"
      ? null
      : [" ", linkButton({ label: t("exam.tests.classScreenLink"), href: `/exam/sittings/${sitting.id}/screen`, newWindow: true, class: "sl-exam-screen-link" })],
  ];
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
      list.groups.map((group) => this.group(group, list.scope === "course"))
    );
  }

  group(group, single) {
    const title = `${displayClass(group.className)} ${group.subject}`;
    // A new test is assembled in the pool, with this course chosen in the bar.
    const newTest = linkButton({ label: t("exam.tests.newTest"), href: `/exam/pool?course=${group.courseId}`, kind: "primary", class: "sl-exam-tests-new" });
    return h(
      "section",
      { class: "sl-exam-tests-course", "data-course": String(group.courseId) },
      single ? null : h("h2", {}, h("a", { href: `/exam/tests?course=${group.courseId}` }, title)),
      h("p", { class: "sl-exam-actions" }, newTest),
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
                group.tests.map((test) =>
                  h(
                    "tr",
                    { "data-test": String(test.id) },
                    h("td", {}, h("a", { href: `/exam/tests/${test.id}` }, test.name)),
                    h("td", {}, String(test.questions)),
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
                                displayWindow(sitting, this.periods),
                                ` · ${stateLabels[sitting.state]()}`,
                                sittingLinks(sitting)
                              )
                            )
                          )
                    ),
                    h("td", {}, String(test.submitted))
                  )
                )
              )
            )
          )
    );
  }
}

defineExamElement("tests", TestList);

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

  render(test) {
    this.test = test;
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    this.sittingLines = new Map();
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
        test.started ? t("exam.tests.writtenBy", { started: test.attempts.started, submitted: test.attempts.submitted }) : t("exam.tests.notWrittenYet")
      ),
      h(
        "p",
        { class: "sl-exam-actions sl-exam-test-actions" },
        linkButton({ label: t("exam.tests.tryAsStudent"), href: `/exam/tests/${test.id}/preview`, newWindow: true, title: t("exam.tests.tryAsStudentNote"), class: "sl-exam-test-preview" }),
        linkButton({ label: t("exam.tests.boardSolution"), href: `/exam/tests/${test.id}/solution`, newWindow: true, title: t("exam.tests.boardSolutionNote"), class: "sl-exam-test-solution" }),
        test.started ? null : linkButton({ label: t("exam.tests.addFromPool"), href: `/exam/pool?course=${course.id}`, class: "sl-exam-test-add" })
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
      h(
        "ol",
        { class: "sl-exam-test-questions" },
        test.questions.map((question) =>
          h(
            "li",
            { "data-question": String(question.questionId), lang: course.language },
            h("h3", {}, en ? question.nameEn : question.nameDe),
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
                      action: () => this.removeWrittenQuestion(question.questionId),
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
   * chosen students, every later one a make-up for chosen students with the
   * first one's duration. A sitting that has not opened can be changed or
   * deleted; one that is over can be rescheduled - with attempts by an admin
   * only, since they are deleted.
   */
  sittingsSection(test) {
    const names = new Map(this.roster.map((entry) => [entry.username, displayPerson(entry)]));
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
                displayWindow(sitting, this.periods),
                `, ${t("exam.tests.minutesPerAttempt", { minutes: Math.round(sitting.durationS / 60) })} · ${stateLabels[sitting.state]()} · `,
                sitting.makeup || sitting.participants.length < this.roster.length
                  ? sitting.participants.map((username) => names.get(username) ?? username).join(", ")
                  : t("exam.tests.wholeClassLower"),
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
      this.sittingForm
    );
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
    if (!sitting && makeup && !openMakeup) {
      this.sittingForm.replaceChildren(
        h("p", {}, h("button", { type: "button", class: "sl-exam-action sl-exam-sitting-makeup", onClick: () => this.drawSittingForm(test, null, false, true) }, t("exam.tests.scheduleMakeup")))
      );
      return;
    }
    const periods = this.periods;
    let windowState;
    if (sitting) {
      windowState = { opensAt: sitting.opensAt, closesAt: sitting.closesAt };
    } else if (periods.length > 0) {
      const proposed = defaultPeriods(periods);
      windowState = windowFor(periods, proposed.date, proposed.from, proposed.to);
    } else {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      start.setMinutes(0, 0, 0);
      windowState = { opensAt: start.toISOString(), closesAt: new Date(start.getTime() + 50 * 60 * 1000).toISOString() };
    }
    const windowEditor = this.windowEditor(windowState);
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
    const chosen = new Set(sitting ? sitting.participants : []);
    const whole = h("input", { type: "checkbox", name: "whole", checked: !makeup && (sitting === null || sitting.participants.length === this.roster.length) });
    const people = h(
      "ul",
      { class: "sl-exam-sitting-people" },
      this.roster.map((entry) =>
        h(
          "li",
          {},
          h(
            "label",
            {},
            h("input", { type: "checkbox", name: "participant", value: entry.username, checked: chosen.has(entry.username) }),
            " ",
            displayPerson(entry)
          )
        )
      )
    );
    const showPeople = () => {
      people.hidden = whole.checked;
    };
    whole.addEventListener("change", showPeople);
    showPeople();
    const message = h("p", { class: "sl-exam-message", role: "status" });
    const form = h(
      "form",
      {
        onSubmit: async (event) => {
          event.preventDefault();
          const body = {
            ...windowEditor.current(),
            durationMinutes: Number(duration.value),
            participants: whole.checked ? null : [...people.querySelectorAll("input:checked")].map((input) => input.value),
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
      makeup
        ? h(
            "p",
            { class: "sl-exam-quiet" },
            t("exam.tests.makeupExplanation")
          )
        : h("label", {}, whole, ` ${t("exam.tests.wholeClass")}`),
      people,
      h("p", {}, h("button", { type: "submit", class: "sl-exam-primary" }, sitting ? t("exam.tests.save") : t("exam.tests.schedule")), sitting || makeup ? [" ", h("button", { type: "button", class: "sl-exam-action", onClick: () => this.drawSittingForm(test, null) }, t("exam.tests.cancel"))] : null),
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
    const windowEditor = this.windowEditor(this.proposedWindow(sitting, nextWeekday(viennaLocal(new Date()).date)));
    const names = new Map(this.roster.map((entry) => [entry.username, displayPerson(entry)]));
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
        h("dd", {}, sitting.participants.map((username) => names.get(username) ?? username).join(", "))
      ),
      h("p", { class: "sl-exam-quiet" }, t("exam.tests.rescheduleNote")),
      h("p", {}, submit, " ", h("button", { type: "button", class: "sl-exam-action", onClick: () => this.drawSittingForm(this.test, null) }, t("exam.tests.cancel")))
    );
    this.sittingForm.replaceChildren(form);
  }

  /**
   * The window `sitting` is proposed again with on `date`: its periods, or -
   * for a sitting ended early, which closed before its periods did - from the
   * period it opened with to the first one that leaves room for an attempt.
   * Otherwise its clock time, the window as long as it was or long enough for
   * an attempt.
   */
  proposedWindow(sitting, date) {
    const periods = this.periods;
    const match = matchWindow(periods, sitting.opensAt, sitting.closesAt);
    if (match) return windowFor(periods, date, match.from, match.to);
    const time = viennaLocal(sitting.opensAt).time;
    const from = periods.find((period) => period.start === time);
    if (from) {
      const fitting = periods
        .filter((period) => period.n >= from.n)
        .map((period) => windowFor(periods, date, from.n, period.n))
        .find((window) => Date.parse(window.closesAt) - Date.parse(window.opensAt) > sitting.durationS * 1000);
      if (fitting) return fitting;
    }
    const opens = viennaInstant(date, time);
    const length = Math.max(Date.parse(sitting.closesAt) - Date.parse(sitting.opensAt), sitting.durationS * 1000 + 5 * 60000);
    return { opensAt: opens.toISOString(), closesAt: new Date(opens.getTime() + length).toISOString() };
  }

  /**
   * The window of a sitting form, starting from `initial`: the periods editor
   * with its switch to clock times when the school's periods are configured,
   * the clock editor otherwise. `current()` answers the window as it stands.
   */
  windowEditor(initial) {
    const periods = this.periods;
    let windowState = { ...initial };
    if (periods.length === 0) return { element: this.clockEditor(windowState), current: () => windowState };
    let byPeriods = matchWindow(periods, windowState.opensAt, windowState.closesAt) !== null;
    const element = h("div", { class: "sl-exam-sitting-window" });
    const draw = () => {
      const toggle = h(
        "button",
        {
          type: "button",
          class: "sl-exam-sitting-mode",
          onClick: () => {
            if (!byPeriods) {
              // A window on period boundaries is carried over; any other keeps
              // its date and gets the periods a new sitting would.
              const match = matchWindow(periods, windowState.opensAt, windowState.closesAt);
              const proposed = match ?? { ...defaultPeriods(periods), date: viennaLocal(windowState.opensAt).date };
              windowState = windowFor(periods, proposed.date, proposed.from, proposed.to);
            }
            byPeriods = !byPeriods;
            draw();
          },
        },
        byPeriods ? t("exam.tests.exactTimesInstead") : t("exam.tests.lessonsInstead")
      );
      element.replaceChildren(...(byPeriods ? this.periodsEditor(windowState, (changed) => (windowState = changed)) : this.clockEditor(windowState)), h("p", {}, toggle));
    };
    draw();
    return { element, current: () => windowState };
  }

  /**
   * The clock-time editor: the date the sitting is written on and the times
   * it opens and closes, in Vienna time and the reader's format - a sitting
   * never runs across midnight. Writes the window into `windowState` whenever
   * the three fields hold a valid date and times; a time it cannot read marks
   * its field invalid, so the form does not submit.
   */
  clockEditor(windowState) {
    const date = h("sl-date-input", { name: "date", required: true, value: viennaLocal(windowState.opensAt).date });
    const time = (name, iso) =>
      h("input", {
        type: "text",
        name,
        required: true,
        inputmode: "numeric",
        autocomplete: "off",
        size: "5",
        placeholder: t("exam.dateInput.timePattern"),
        class: "sl-exam-time",
        value: viennaLocal(iso).time,
      });
    const opens = time("opensTime", windowState.opensAt);
    const closes = time("closesTime", windowState.closesAt);
    const update = () => {
      const [from, to] = [opens, closes].map((field) => {
        const parsed = parseTime(field.value);
        field.setCustomValidity(parsed === null ? t("exam.dateInput.unreadableTime") : "");
        field.setAttribute("aria-invalid", String(parsed === null));
        return parsed;
      });
      if (/^\d{4}-\d{2}-\d{2}$/.test(date.value) && from !== null && to !== null) {
        windowState.opensAt = viennaInstant(date.value, from).toISOString();
        windowState.closesAt = viennaInstant(date.value, to).toISOString();
      }
    };
    date.addEventListener("change", update);
    for (const field of [opens, closes]) {
      field.addEventListener("input", update);
      field.addEventListener("change", update);
    }
    return [
      h("label", {}, `${t("exam.tests.date")} `, date),
      " ",
      h("label", {}, `${t("exam.tests.opens")} `, opens),
      " ",
      h("label", {}, `${t("exam.tests.closes")} `, closes),
    ];
  }

  /**
   * The periods editor: a date and a from and to period, each choice with its
   * clock times as its tooltip, the to period never before the from period,
   * and the window they make shown as it changes. Hands every new window to
   * `changed`.
   */
  periodsEditor(windowState, changed) {
    const periods = this.periods;
    const current = matchWindow(periods, windowState.opensAt, windowState.closesAt);
    const select = (name, numbers, selected) => {
      const element = h(
        "select",
        { name, required: true },
        numbers.map((period) => h("option", { value: String(period.n), title: periodTimes(periods, period.n) }, String(period.n)))
      );
      element.value = String(selected);
      return element;
    };
    const date = h("sl-date-input", { name: "date", required: true, value: current.date });
    const from = select("fromPeriod", periods, current.from);
    let to = select("toPeriod", periods.filter((period) => period.n >= current.from), current.to);
    const toLabel = h("label", {}, `${t("exam.tests.toLesson")} `, to);
    const times = h("span", { class: "sl-exam-sitting-times" });
    const update = () => {
      const fromN = Number(from.value);
      const toN = Math.max(fromN, Number(to.value));
      if (Number(to.firstChild?.value) !== fromN) {
        const replaced = select("toPeriod", periods.filter((period) => period.n >= fromN), toN);
        replaced.addEventListener("change", update);
        to.replaceWith(replaced);
        to = replaced;
      }
      times.replaceChildren(periodTimes(periods, fromN, toN));
      if (/^\d{4}-\d{2}-\d{2}$/.test(date.value)) changed(windowFor(periods, date.value, fromN, toN));
    };
    for (const input of [date, from, to]) input.addEventListener("change", update);
    times.replaceChildren(periodTimes(periods, current.from, current.to));
    return [
      h("label", {}, `${t("exam.tests.date")} `, date),
      " ",
      h("label", {}, `${t("exam.tests.fromLesson")} `, from),
      " ",
      toLabel,
      " ",
      h("span", { class: "sl-exam-quiet" }, "= ", times),
    ];
  }

  editSitting(test, sitting, reschedule = false) {
    this.drawSittingForm(test, sitting, reschedule);
    this.sittingForm.scrollIntoView({ block: "nearest" });
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
    const questionIds = this.test.questions.map((question) => question.questionId).filter((id) => id !== questionId);
    this.change({ questionIds });
  }

  /** An admin's removal from a written test; the server scores the attempts again. */
  async removeWrittenQuestion(questionId) {
    try {
      const test = await examApi(`/tests/${this.test.id}/questions/${questionId}`, { method: "DELETE" });
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

defineExamElement("test-detail", TestDetail);
