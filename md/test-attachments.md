# Attachments

The fixture page of `test/checks/attachments.js`. Every image below is referenced nowhere else in the corpus, except the shared one, which `test-attachments-teachers.md` embeds too.

## Unrestricted

![[test-attachment-public.png]]

## Shared

Embedded here, inside a `4bhif` block below, and on a page only teachers may open.

![[test-attachment-shared.png]]

@@@ 4bhif
![[test-attachment-shared.png]]
@@@

@@@ teacher
## Teachers only

![[test-attachment-teacher.png]]
@@@

@@@ teacher[2025-01-01T00:00:00 to 2025-01-02T00:00:00]
## A window that has closed

![[test-attachment-window.png]]
@@@

@@@ #exam
## Exam variant

![[test-attachment-exam.png]]
@@@

## Ambiguous

Two files carry this name, in `assets/attachments-a/` and `assets/attachments-b/`, and the embed names neither folder, so it renders as nothing.

![[test-attachment-ambiguous.png]]

## In code

Written as an example of the syntax, so neither renders as an image nor makes the file reachable, as in Obsidian: `![[test-attachment-unreferenced.png]]`

```markdown
![[test-attachment-unreferenced.png]]
```
