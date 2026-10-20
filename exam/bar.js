/**
 * The module's bar (`exam-navigation`): school year, class, course and
 * gradebook, from left to right, on every teacher page of the module, and
 * after them the buttons to the question pool and the online tests.
 *
 * Built here, in the page shell, from the database - synchronously, like
 * every other module read - so it is part of the page as it is first shown and
 * costs no request of its own (design.md, D7). It is only ever built inside a
 * `teacherPage` route, so a student, or a teacher in student view, never
 * receives it. `client/bar.js` turns a choice into navigation and opens the
 * creation dialogs.
 */

import { currentYear, getClass, getCourse, getYear, listClasses, listCourses, listYears } from "./classes.js";
import { semesterToday } from "./gradebook.js";
import { semesters } from "./grading.js";
import { embedPlaceholder, wrapInPage } from "../obsidian.js";
import { i18nOf } from "../i18n/server.js";

function semesterLabels(t) {
  return { ws: t("exam.bar.winterSemester"), ss: t("exam.bar.wholeYear") };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * What the bar shows for a page that names `context` - any of `yearId`,
 * `classId`, `courseId` and `semester`. A position names what is given or
 * follows from the positions to its right (a course's class and year); the
 * current school year is chosen when nothing else is. Positions to the right
 * of what the page names stay empty.
 */
export function barState(db, { yearId = null, classId = null, courseId = null, semester = null } = {}) {
  const course = courseId === null ? null : getCourse(db, courseId);
  const klass = course ? getClass(db, course.classId) : classId === null ? null : getClass(db, classId);
  const years = listYears(db);
  const year = klass ? klass.year : yearId !== null ? getYear(db, yearId) : (currentYear(db) ?? years.at(-1) ?? null);
  return {
    years,
    year,
    classes: year ? listClasses(db, year.id) : [],
    klass,
    courses: klass ? listCourses(db, klass.id) : [],
    course,
    semester: course && semester !== null && semesters.includes(semester) ? semester : null,
  };
}

function option(value, label, selected, keep = {}) {
  const kept = Object.entries(keep)
    .filter(([, id]) => id !== null && id !== undefined)
    .map(([key, id]) => ` data-keep-${key}="${escapeHtml(id)}"`)
    .join("");
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}${kept}>${escapeHtml(label)}</option>`;
}

const sameName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

/**
 * What a choice of class `classId` keeps of the positions to its right: the
 * course of the same subject as the one chosen now, if the class has one.
 */
function keptInClass(db, classId, course) {
  if (!course) return {};
  const match = listCourses(db, classId).find((candidate) => sameName(candidate.subject, course.subject));
  return { course: match?.id ?? null };
}

/**
 * What a choice of year `yearId` keeps: the class of the same name as the one
 * chosen now and, in it, the course of the same subject.
 */
function keptInYear(db, yearId, klass, course) {
  if (!klass) return {};
  const match = listClasses(db, yearId).find((candidate) => sameName(candidate.name, klass.name));
  return match ? { class: match.id, ...keptInClass(db, match.id, course) } : {};
}

/**
 * One position: its name, a link to its overview while it has a value, the
 * choice, and - for the first three - a button to create a new one, offered
 * only once every position to its left has a value. A year's or a class's
 * choice names, as `data-keep-class` and `data-keep-course`, what of the
 * positions to its right it keeps: the class of the same name, the course of
 * the same subject.
 */
function position({ name, label, href, choices, chosen, enabled, create }) {
  const title = href ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : `<span>${escapeHtml(label)}</span>`;
  const select = `<select data-position="${name}" aria-label="${escapeHtml(label)}"${enabled ? "" : " disabled"}>
      ${option("", "–", chosen === null)}
      ${choices.map((choice) => option(choice.value, choice.label, choice.value === chosen, choice.keep)).join("")}
    </select>`;
  const button =
    create === undefined
      ? ""
      : `<button type="button" class="sl-exam-action sl-exam-bar-create" data-create="${name}" title="${escapeHtml(create.title)}" aria-label="${escapeHtml(create.title)}"${create.offered ? "" : " disabled"}>+</button>`;
  return `<span class="sl-exam-bar-position" data-position="${name}">${title} ${select} ${button}</span>`;
}

/**
 * The query that keeps what the bar has chosen when one of its buttons leads
 * to another page: the rightmost position with a value names the others.
 */
function contextQuery({ year, klass, course }) {
  if (course) return `?course=${course.id}`;
  if (klass) return `?class=${klass.id}`;
  if (year) return `?year=${year.id}`;
  return "";
}

/** A button after the bar's positions, marked while its page is the one shown. */
function pageButton({ name, label, href, current }) {
  return `<a class="sl-exam-action sl-exam-bar-page" data-page="${name}" href="${escapeHtml(href)}"${current === name ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
}

/**
 * The bar's markup for `context`, as `barState` resolves it. `current` names
 * the page shown when it is one of the bar's buttons (`pool`, `tests`,
 * `scale`); the
 * bar's choices then stay on that page. `t` speaks the reader's language.
 */
export function renderBar(db, context, current, t) {
  const { years, year, classes, klass, courses, course, semester } = barState(db, context);
  const shownSemester = semester ?? (course ? semesterToday(course.year) : null);
  const query = contextQuery({ year, klass, course });
  return `<nav class="sl-exam-bar" aria-label="${escapeHtml(t("app.topbar.examModule"))}"
      data-year="${year?.id ?? ""}" data-class="${klass?.id ?? ""}" data-course="${course?.id ?? ""}" data-semester="${semester ?? ""}" data-current="${current ?? ""}">
    ${position({
      name: "year",
      label: t("exam.bar.year"),
      href: year ? `/exam/?year=${year.id}` : null,
      choices: years.map((candidate) => ({
        value: String(candidate.id),
        label: candidate.current ? t("exam.bar.currentYear", { name: candidate.name }) : candidate.name,
        keep: keptInYear(db, candidate.id, klass, course),
      })),
      chosen: year ? String(year.id) : null,
      enabled: years.length > 0,
      create: { title: t("exam.bar.newYear"), offered: true },
    })}
    ${position({
      name: "class",
      label: t("exam.bar.class"),
      href: klass ? `/exam/classes/${klass.id}` : null,
      choices: classes.map((candidate) => ({ value: String(candidate.id), label: candidate.name.toUpperCase(), keep: keptInClass(db, candidate.id, course) })),
      chosen: klass ? String(klass.id) : null,
      enabled: year !== null,
      create: { title: t("exam.bar.newClass"), offered: year !== null },
    })}
    ${position({
      name: "course",
      label: t("exam.bar.course"),
      href: course ? `/exam/courses/${course.id}` : null,
      choices: courses.map((candidate) => ({ value: String(candidate.id), label: candidate.subject })),
      chosen: course ? String(course.id) : null,
      enabled: klass !== null,
      create: { title: t("exam.bar.newCourse"), offered: klass !== null },
    })}
    ${position({
      name: "gradebook",
      label: t("exam.bar.grades"),
      href: course ? `/exam/courses/${course.id}/gradebook?semester=${shownSemester}` : null,
      choices: course ? semesters.map((value) => ({ value, label: semesterLabels(t)[value] })) : [],
      chosen: semester,
      enabled: course !== null,
    })}
    <span class="sl-exam-bar-pages">
      ${pageButton({ name: "pool", label: t("exam.bar.pool"), href: `/exam/pool${query}`, current })}
      ${pageButton({ name: "tests", label: t("exam.bar.tests"), href: `/exam/tests${query}`, current })}
      ${pageButton({ name: "scale", label: t("exam.bar.scale"), href: `/exam/scale${query}`, current })}
    </span>
  </nav>`;
}

/**
 * A teacher page of the module: the bar for `context`, the heading and one
 * element, in the instance's frame at the whole width. Only for routes behind
 * `teacherPage`. `current` marks the bar's button of this page, if it has one.
 * `title` is the heading, or a function of the reader's `t` returning it.
 */
export async function teacherShell({ db, startPage, req, title, context, kind, params, current = null }) {
  const { t } = await i18nOf(req);
  const heading = typeof title === "function" ? title(t) : title;
  const body = `
    ${renderBar(db, context, current, t)}
    <h1>${escapeHtml(heading)}</h1>
    ${embedPlaceholder(kind, params, t("app.embed.loading"))}`;
  return wrapInPage(body, startPage(), req, { title: heading, wide: true });
}

/**
 * The bar's context named by a page's query - `course`, `class` or `year`, an
 * id each - for the pages the bar's buttons open. An id that is not one names
 * nothing; a record there is none of is refused by `barState`.
 */
export function contextFromQuery(query) {
  const id = (value) => (typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null);
  return { yearId: id(query.year), classId: id(query.class), courseId: id(query.course) };
}
