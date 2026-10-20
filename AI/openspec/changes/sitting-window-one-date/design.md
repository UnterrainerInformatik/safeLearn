## Context

`clockEditor` (`exam/client/tests.js`) draws two `sl-date-input time` elements named `opensAt` and `closesAt` and writes each one's instant into the form's window state. The periods editor already has a single `sl-date-input name="date"`. `sl-date-input` without `time` gives "YYYY-MM-DD"; `parseTime` (`i18n/format.js`) reads "HH:MM".

## Goals / Non-Goals

**Goals:** one date and two times in the clock-time form, wherever it appears (new sitting, change, reschedule; with and without periods).

**Non-Goals:** a server rule against windows across midnight (the form can no longer make one; the API keeps two instants and existing checks create windows relative to now, which may cross midnight); changing the period editor.

## Decisions

### D1 Fields

`clockEditor` draws `sl-date-input name="date"` (no time), and two text fields `name="opensTime"` and `name="closesTime"` styled like the time part of `sl-date-input` (`inputmode=numeric`, placeholder from `exam.dateInput.timePattern`, `size=5`), labelled **Opens** and **Closes**. On a valid change of any of the three the window state becomes `viennaInstant(date, opens)` / `viennaInstant(date, closes)`. A time that `parseTime` cannot read marks its field invalid (`setCustomValidity` with `exam.dateInput.unreadableTime`) and leaves the state as it was, so the form refuses to submit.

### D2 A stored window across midnight

A sitting stored before this change may cross midnight. The form shows its opening date and both times; saving it unchanged would close before it opens and is refused by the existing rule. Accepted: such sittings are test data, not real ones.

### D3 Tests

The harness checks that read `sl-date-input[name=opensAt]` and `[name=closesAt]` read the date field and the two time fields instead.
