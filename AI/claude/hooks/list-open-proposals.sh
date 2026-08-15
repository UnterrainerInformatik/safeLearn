#!/bin/sh
# SessionStart hook — lists the hand-written change requests waiting in
# AI/proposals/ and tells the assistant to offer them as the next step.
#
# Prints nothing when there is nothing pending, and always exits 0: a session
# start must never be blocked or noisy because of this check.

root="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$root" ]; then
    # Fallback for a missing CLAUDE_PROJECT_DIR: this script lives in
    # <root>/AI/claude/hooks/, so the repo root is three levels up.
    script_dir=$(dirname -- "$0")
    root=$(CDPATH= cd -- "$script_dir/../../.." 2>/dev/null && pwd)
fi
[ -n "$root" ] || exit 0

proposals_dir="$root/AI/proposals"
[ -d "$proposals_dir" ] || exit 0

# An unexpanded glob and anything that is not a readable file are skipped, so
# an empty or unreadable directory leaves count at 0.
count=0
list=""
for file in "$proposals_dir"/*.md; do
    [ -f "$file" ] && [ -r "$file" ] || continue
    name=$(basename -- "$file")
    heading=$(grep -m 1 '^#' -- "$file" 2>/dev/null | sed 's/^#\{1,\}[[:space:]]*//')
    if [ -n "$heading" ]; then
        list="$list  - $name — $heading
"
    else
        list="$list  - $name
"
    fi
    count=$((count + 1))
done

[ "$count" -gt 0 ] || exit 0

printf 'Open proposals in AI/proposals/ (%s):\n%s\n' "$count" "$list"
printf '%s\n' 'These are hand-written change requests waiting to be picked up. Offer them to the user as the next step: turning one of them into an OpenSpec change with /opsx:propose. Do not start working on them unasked, and do not repeat this list later in the session.'

exit 0
