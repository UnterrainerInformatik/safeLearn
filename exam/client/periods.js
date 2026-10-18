/**
 * The school's teaching periods (`school-periods`): parsing the deployment's
 * `SCHOOL_PERIODS`, turning a date and a range of periods into a sitting's
 * window, and recognising a window that lies on period boundaries.
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
