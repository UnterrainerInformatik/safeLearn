## Context

Teachers are picked in three places in `exam/client/classes.js`:

- the class page's `teacherSection`: a `<select>` of the directory's teachers not yet entered, plus an "enter" button
- `ClassNew`: a `checklist()` of all teachers, nobody ticked
- the year change's class step: last year's teachers ticked, and the directory's other teachers as a long checklist inside a `<details>`

All three get their people from `/directory/teachers`, which is loaded whole (about 250 entries). `displayPerson` writes `Family Given`.

The bar's preselection (`exam/client/bar.js`, `connectBar`) works like this. Choosing a year **or a class** writes the target address into `sessionStorage` (`cascadeKey`). The target page then picks a single remaining choice and writes the key again for its own target. That is why switching the class on a class page lands on the single course.

## Goals / Non-Goals

**Goals:**
- one matching rule and one filter field, used by all three places
- a class switch in the bar ends on the class page

**Non-Goals:**
- the student search on the class page (`/directory/people?q=`, server-side) keeps its own matching. Bringing it in line is a separate change.
- no fuzzy matching or typo tolerance. Only substring pieces.
- no change to the server or to what `/directory/teachers` returns

## Decisions

### D1: Matching is a pure client helper, pieces as substrings

`matchesPerson(person, query)` lowercases and NFD-normalises the input, then strips combining marks (`\p{M}`). It does the same to `familyName givenName username` and checks that every whitespace-separated piece of the query is a substring of that haystack. Pieces are substrings, not word prefixes, so `lei` matches inside `gruber-leitner` without a special rule for hyphens. *Alternative:* prefix-of-word matching is more precise, but it needs hyphen and apostrophe handling, and with 250 teachers the extra matches substrings bring do not hurt. The helper lives next to `displayPerson` and is exported, so a test can call it.

### D2: One filter element wraps a list of rows

`teacherFilter(rows)` returns a search field (`type="search"`, filtering on `input` with no debounce, since everything is local) and a "nobody matches" line. It shows or hides each row with `hidden` and does not rebuild the list. Hidden checkboxes keep their state, so `checklist().ticked()` still returns hidden ticked teachers. This is how the spec's "ticked stays ticked" holds without extra bookkeeping.

### D3: The class page's dropdown becomes field + match list

The `<select>` goes away. Under the field there is a list of the teachers not yet entered, each with its own "enter" button that calls the existing `POST /classes/:id/teachers`. The list starts collapsed: it shows nothing until something is typed, so 250 rows do not push the roster down. *Alternative:* keep the `<select>` and filter its options. Filtering `<option>`s is unreliable across browsers (`hidden` on options does not work in Safari), and a list is easier to test.

### D4: In the year change, the filter covers the other teachers only

Last year's teachers are a short, pre-ticked list and stay as they are. The filter sits inside the `<details>` of the other teachers. When the admin types into it, the `<details>` opens.

### D5: Only the bar's own choice continues from a class

In `connectBar`'s change handler, `cascadeTo` is called only for `position === "year"`. A class the teacher chose therefore opens its page without the key, and `reachedByChoice()` returns false there. The bar's own choice (`window.location.replace` at the end of `connectBar`) writes the key as before, so start → single class → single course and year → single class → single course still work. *Alternative:* keep cascading on a class choice but stop it when the page left had no course chosen. That rule is harder to explain and still surprises a teacher coming from a course page of a subject the new class lacks.

## Risks / Trade-offs

- [A substring like `an` matches many teachers] → harmless. The list just stays long until a second piece narrows it.
- [Teachers used to the dropdown look for it] → the field carries the same label (`teacherPickerLabel`), and its placeholder names what to type.
- [The `exam-navigation` change also affects a teacher with one class who switches between years' classes by hand] → intended: a hand choice is the teacher's last word, as the requirement already says for links.
