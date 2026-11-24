/**
 * The school's teaching periods (`school-periods`): parsing the deployment's
 * `SCHOOL_PERIODS`, turning a date, one period, an offset and a length into an
 * online sitting's start window and back (sitting-start-window design D5), and
 * - for offline sittings - a range of periods into a window and back, and a
 * start lesson, an offset and an end lesson into a planned sitting and back.
 *
 * Free of DOM code on purpose: the server imports this file at start to check
 * the variable, the unit checks import it, and the browser loads the same file
 * from `/exam/assets/`, so both sides agree on what "lies on period
 * boundaries" means (design.md, D3).
 *
 * A period is `{ n, start, end }` with `start` and `end` as "HH:MM" in Vienna
 * local time; a date is "YYYY-MM-DD", the Vienna calendar day. Every
 * conversion goes through `Intl` with `Europe/Vienna`, so the offset is the
 * one of that very date and both DST changeovers come out right.
 */

const timeZone = "Europe/Vienna";

const entryPattern = /^(\d{1,3})=((?:[01]\d|2[0-3]):[0-5]\d)-((?:[01]\d|2[0-3]):[0-5]\d)$/;

const viennaParts = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** An instant as its Vienna date, wall-clock minute and second. */
export function viennaLocal(instant) {
  const parts = Object.fromEntries(viennaParts.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, second: Number(parts.second) };
}

/** The instant at which Vienna's clocks show `time` on `date`. */
export function viennaInstant(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // The offset of Vienna at a guess, applied, then checked once more at the
  // result: the guess can lie on the other side of a changeover.
  const offsetAt = (instant) => {
    const local = viennaLocal(instant);
    const [y, mo, d] = local.date.split("-").map(Number);
    const [h, mi] = local.time.split(":").map(Number);
    return Date.UTC(y, mo - 1, d, h, mi, local.second) - instant;
  };
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant);
  return new Date(instant);
}

/** The calendar day after `date`. */
export function nextDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** The first Monday to Friday after `date`; holidays are not known here. */
export function nextWeekday(date) {
  let next = nextDate(date);
  while ([0, 6].includes(new Date(`${next}T00:00:00Z`).getUTCDay())) next = nextDate(next);
  return next;
}

/**
 * The periods `text` declares, in ascending number. Empty or unset text
 * declares none. Throws an `Error` naming the offending entry for anything
 * malformed: an entry not of the form `<number>=<HH:MM>-<HH:MM>`, a number
 * listed twice, a period that does not end after it starts, or one that
 * overlaps the period before it. A period may start the minute the previous
 * one ends.
 */
export function parsePeriods(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed === "") return [];
  const periods = [];
  const seen = new Map();
  for (const raw of trimmed.split(",")) {
    const entry = raw.trim();
    const match = entryPattern.exec(entry);
    if (!match) {
      throw new Error(`SCHOOL_PERIODS: the entry "${entry}" is not of the form <number>=<HH:MM>-<HH:MM>, e.g. 1=08:00-08:50.`);
    }
    const period = { n: Number(match[1]), start: match[2], end: match[3], entry };
    if (seen.has(period.n)) {
      throw new Error(`SCHOOL_PERIODS: period ${period.n} is listed twice ("${seen.get(period.n).entry}" and "${entry}").`);
    }
    if (period.start >= period.end) {
      throw new Error(`SCHOOL_PERIODS: period ${period.n} ("${entry}") does not end after it starts.`);
    }
    seen.set(period.n, period);
    periods.push(period);
  }
  periods.sort((a, b) => a.n - b.n);
  for (let index = 1; index < periods.length; index++) {
    const before = periods[index - 1];
    const period = periods[index];
    if (period.start < before.end) {
      throw new Error(`SCHOOL_PERIODS: period ${period.n} ("${period.entry}") overlaps period ${before.n} ("${before.entry}").`);
    }
  }
  return periods.map(({ n, start, end }) => ({ n, start, end }));
}

function periodNumbered(periods, n) {
  return periods.find((period) => period.n === n) ?? null;
}

/** "10:00–11:45": the start of period `from` to the end of period `to`. */
export function periodTimes(periods, from, to = from) {
  return `${periodNumbered(periods, from).start}–${periodNumbered(periods, to).end}`;
}

/**
 * The window from the start of period `from` to the end of period `to` on
 * `date`, as the two ISO instants a sitting is stored with.
 */
export function windowFor(periods, date, from, to) {
  const first = periodNumbered(periods, from);
  const last = periodNumbered(periods, to);
  if (!first || !last || to < from) throw new Error(`There is no window from period ${from} to period ${to}.`);
  return { opensAt: viennaInstant(date, first.start).toISOString(), closesAt: viennaInstant(date, last.end).toISOString() };
}

/**
 * `{ date, from, to }` when the window opens exactly at the start of one
 * period and closes exactly at the end of the same or a later period, both on
 * the same Vienna date, compared to the minute; null for any other window
 * (design.md, D5).
 */
export function matchWindow(periods, opensAt, closesAt) {
  if (periods.length === 0) return null;
  const opens = viennaLocal(opensAt);
  const closes = viennaLocal(closesAt);
  if (opens.date !== closes.date) return null;
  const first = periods.find((period) => period.start === opens.time);
  const last = periods.find((period) => period.end === closes.time);
  if (!first || !last || last.n < first.n) return null;
  return { date: opens.date, from: first.n, to: last.n };
}

/**
 * What the form proposes for a new sitting at `now`: today and the period
 * running now, or else the next one starting today; once no period of today
 * is left, the next day and its first period numbered 1 or higher, or its
 * first period when there is none. From and to are the same period.
 */
export function defaultPeriods(periods, now = new Date()) {
  if (periods.length === 0) return null;
  const { date, time } = viennaLocal(now);
  const today = periods.find((period) => period.start <= time && time < period.end) ?? periods.find((period) => period.start > time);
  if (today) return { date, from: today.n, to: today.n };
  const first = periods.find((period) => period.n >= 1) ?? periods[0];
  return { date: nextDate(date), from: first.n, to: first.n };
}

/** "HH:MM" as minutes after midnight. */
function minutesOf(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** Minutes after midnight as "HH:MM"; null from 24:00 on, the next day. */
function timeOf(minutes) {
  if (minutes < 0 || minutes >= 24 * 60) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * The start window of an online sitting on `date` (sitting-start-window
 * design D5): it opens `offset` minutes after the start of period `n` and
 * closes `length` minutes later, both by Vienna's clock on that date. Throws
 * for an unknown period and for a start window that would cross midnight.
 */
export function startWindowFor(periods, date, n, offset, length) {
  const period = periodNumbered(periods, n);
  if (!period) throw new Error(`There is no period ${n}.`);
  const opens = minutesOf(period.start) + offset;
  const opensTime = timeOf(opens);
  const closesTime = timeOf(opens + length);
  if (opensTime === null || closesTime === null || !(length > 0)) throw new Error(`A start window from ${opensTime} for ${length} minutes does not lie on ${date}.`);
  return { opensAt: viennaInstant(date, opensTime).toISOString(), closesAt: viennaInstant(date, closesTime).toISOString() };
}

/**
 * `{ date, n, offset, length }` when the start window opens within period `n`
 * - from its start up to but not including its end, to the minute - and
 * closes on the same Vienna date; `offset` is the minutes after the period's
 * start, `length` the start window's minutes. Null for any other window, and
 * without periods.
 */
export function matchStart(periods, opensAt, closesAt) {
  if (periods.length === 0) return null;
  const opens = viennaLocal(opensAt);
  const closes = viennaLocal(closesAt);
  if (opens.date !== closes.date) return null;
  const period = periods.find((candidate) => candidate.start <= opens.time && opens.time < candidate.end);
  if (!period) return null;
  return {
    date: opens.date,
    n: period.n,
    offset: minutesOf(opens.time) - minutesOf(period.start),
    length: Math.round((Date.parse(closesAt) - Date.parse(opensAt)) / 60000),
  };
}

/** The offset and length of the start window a new sitting proposes (`school-periods`). */
export const defaultOffset = 5;
export const defaultLength = 10;

/**
 * What the form of an online sitting proposes at `now`: today and the first
 * period whose default start window - 5 to 15 minutes after its start - has
 * not closed yet; once none of today is left, the next day and its first
 * period numbered 1 or higher, or its first period when there is none. With
 * the default offset and length.
 */
export function defaultStart(periods, now = new Date()) {
  if (periods.length === 0) return null;
  const { date, time } = viennaLocal(now);
  const today = periods.find((period) => minutesOf(time) < minutesOf(period.start) + defaultOffset + defaultLength);
  const choice = today ? { date, n: today.n } : { date: nextDate(date), n: (periods.find((period) => period.n >= 1) ?? periods[0]).n };
  return { ...choice, offset: defaultOffset, length: defaultLength };
}

/**
 * The plan of an offline sitting on `date` (offline-sitting-periods design
 * D2): it starts `offset` minutes after the start of period `from` and ends
 * at the end of period `to`, both by Vienna's clock on that date. The offset
 * never moves the end. Throws for an unknown period, for `to` before `from`,
 * for an offset outside the start period, and for a plan past midnight.
 */
export function planFor(periods, date, from, offset, to) {
  const first = periodNumbered(periods, from);
  const last = periodNumbered(periods, to);
  if (!first || !last || to < from) throw new Error(`There is no plan from period ${from} to period ${to}.`);
  const opens = minutesOf(first.start) + offset;
  if (!Number.isInteger(offset) || offset < 0 || opens >= minutesOf(first.end)) throw new Error(`${offset} minutes do not lie within period ${from}.`);
  const opensTime = timeOf(opens);
  if (opensTime === null || minutesOf(last.end) <= opens) throw new Error(`A plan from ${opensTime} to ${last.end} does not lie on ${date}.`);
  return { opensAt: viennaInstant(date, opensTime).toISOString(), closesAt: viennaInstant(date, last.end).toISOString() };
}

/**
 * `{ date, from, offset, to }` when an offline sitting planned from `opensAt`
 * for `durationMinutes` lies on the periods as the form reads it: the start
 * lies within period `from` - from its start up to but not including its end,
 * to the minute - and the planned end, on the same Vienna date, lies within
 * `from` (then `to` is `from`) or is the end of a later period `to`. Null for
 * any other plan, and without periods.
 */
export function matchPlan(periods, opensAt, durationMinutes) {
  if (periods.length === 0 || !(durationMinutes > 0)) return null;
  const opens = viennaLocal(opensAt);
  const closes = viennaLocal(Date.parse(opensAt) + durationMinutes * 60000);
  if (opens.date !== closes.date) return null;
  const first = periods.find((candidate) => candidate.start <= opens.time && opens.time < candidate.end);
  if (!first) return null;
  const offset = minutesOf(opens.time) - minutesOf(first.start);
  if (closes.time <= first.end) return { date: opens.date, from: first.n, offset, to: first.n };
  const last = periods.find((candidate) => candidate.n > first.n && candidate.end === closes.time);
  if (!last) return null;
  return { date: opens.date, from: first.n, offset, to: last.n };
}
