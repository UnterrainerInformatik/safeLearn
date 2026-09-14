# Search: the views a session switches between

Every word in capitals below occurs in this file and in no other, so a check can
ask for one of them and know exactly which passage would have to have been read
for an answer to come back.

This paragraph is visible to every session and names ANSICHTOFFEN.

## The exam variant and its complement
The `ve` preference is one a reader sets for themselves, and the exam half of
the pair is not theirs to open: it is granted to teachers and admins and to
nobody else, however the switch stands. The sentence introducing the pair stays
visible either way, so a match is one of the two blocks and nothing else:
@@@ #exam
>Only the exam view reads KLAUSURANSICHT.
@@@
@@@ #practice
>Only the practice view reads UEBUNGSANSICHT.
@@@

## The answer, which is a view and not a restriction
`#answer` asks no question about roles - `va` alone decides it, for a student
exactly as for a teacher. The block is here so that a check states that on
purpose rather than leaving the next reader to assume the search enforces
something the rule never said:
@@@ #answer
>A session that asked for answers reads LOESUNGSANSICHT.
@@@

## A block whose window has closed
No role is active in the directive below, so the block is nobody's to read -
not the teacher's, and not an admin's either:
@@@ teacher[2025-01-01T00:00:00 to 2025-01-02T00:00:00]
>Nobody reads FENSTERGESCHLOSSEN any more.
@@@
