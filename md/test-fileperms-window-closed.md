@@@ teacher[2025-01-01T00:00:00 to 2025-01-02T00:00:00]
# Closed Window

This file's first line restricts the whole file to teachers, and gives that
grant a window that opened and closed on the second of January 2025.

A directive whose windows have all closed leaves no role active, so the file is
hidden from everyone — including a teacher, the very role it names, and
including an admin, whose short-circuit is never reached because the window is
decided first. The application refuses it in different words than it uses for a
directive naming roles the reader does not hold: one says come back later, the
other says ask someone else. See `docs-permissions.md`.

The body below this line reaches no reader while the window is shut, which is
what the permissions check asserts. Nothing here quotes either refusal verbatim,
so that a day on which this file did render could not make the check pass by
accident.

Only visible while the window is open.
