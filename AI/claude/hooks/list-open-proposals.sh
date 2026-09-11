#!/bin/sh
# SessionStart hook — surfaces the backlog in AI/open-proposals.md so the
# assistant knows about open bug reports and ideas without being asked.
#
# Prints nothing when the file is missing or holds no entries, and always
# exits 0: a session start must never be blocked or noisy because of this.

root="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$root" ]; then
    # Fallback for a missing CLAUDE_PROJECT_DIR: this script lives in
    # <root>/AI/claude/hooks/, so the repo root is three levels up.
    script_dir=$(dirname -- "$0")
    root=$(CDPATH= cd -- "$script_dir/../../.." 2>/dev/null && pwd)
fi
[ -n "$root" ] || exit 0

backlog="$root/AI/open-proposals.md"
[ -f "$backlog" ] && [ -r "$backlog" ] || exit 0

# A real entry is a "## " heading (a category is "# ", one level up); a file
# holding only category headings and no entries under them has none.
count=$(grep -c '^## ' -- "$backlog" 2>/dev/null)
[ -n "$count" ] && [ "$count" -gt 0 ] || exit 0

printf 'Open backlog in AI/open-proposals.md (%s entries):\n\n' "$count"
cat -- "$backlog"
printf '\n%s\n' 'These are open bug reports and ideas with no tasks yet. Offer picking one up as the next step, e.g. turning it into an OpenSpec change with /opsx:propose. Do not start working on them unasked, and do not repeat this list later in the session.'

exit 0
