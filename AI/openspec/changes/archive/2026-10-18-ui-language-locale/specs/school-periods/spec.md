## MODIFIED Requirements

### Requirement: Windows on period boundaries are shown as periods

With periods configured, every place in the UI that shows a sitting's window SHALL show a window that opens at the start of one period and closes at the end of the same or a later period on the same date as the date and the period range. The weekday and date SHALL follow the user's chosen format and the words for one period and a range SHALL follow the user's chosen language (see `ui-language`, `locale-formats`), such as `Tue 20/10 · lessons 3–4` or `Tue 20/10 · lesson 3` in English with `en-GB`, and `Di. 20.10. · 3.–4. EH` or `Di. 20.10. · 3. EH` in German with `de-AT`. Any other window SHALL be shown in clock times as without periods. This SHALL hold at least in the list of tests, the sittings of a test, the teacher's live view and the class screen.

#### Scenario: A sitting in the list of tests

- **WHEN** the list of tests shows a sitting from 2026-10-20 10:00 to 11:45 to a teacher with English and `de-AT`
- **THEN** its window reads `Tue 20.10. · lessons 3–4`

#### Scenario: The same sitting in German

- **WHEN** a teacher with German and `de-AT` sees that sitting
- **THEN** its window reads `Di. 20.10. · 3.–4. EH`

#### Scenario: A window off the periods

- **WHEN** the live view shows a sitting from 2026-10-20 10:05 to 10:55
- **THEN** its window reads in clock times, as without periods
