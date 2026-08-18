## Context

Three questions, and only the first looks like the interesting one.

## Decisions

### A link, not a copy that a build writes

The alternative to linking is having the plugin's build copy `main.js`, `manifest.json` and `styles.css` into each vault that wants them. It keeps git simple, needs no platform-specific command, and works the same everywhere.

It was not taken because it makes the vault hold a build rather than *the* build, and the distinction is exactly what this is for: a copy is current until the next rebuild, and a person who forgets the copy step is looking at output from an hour ago while reading source from now. That is a slow way to be confused, and the confusion looks like a plugin defect.

A link has no such state. Obsidian reads `main.js` from the checkout each time it loads the plugin, so "reload Obsidian" is the whole of the update procedure and there is nothing that can be stale except the build itself.

### A junction on Windows, a symlink elsewhere

`New-Item -ItemType Junction` on Windows and `ln -s` on Linux and macOS. One command each, and the guide gives both rather than a portable script, because a portable script here would be a wrapper over two one-line commands whose failure modes are what a person actually needs to see.

A junction rather than `New-Item -ItemType SymbolicLink`: a directory symlink on Windows needs developer mode or an elevated shell, and a junction needs neither. `test/obsidian/harness.js` already made this choice for the vault it assembles, and this is the same choice for a vault a person keeps — one answer, not two.

### The git step is part of the procedure, not a footnote

This is the decision that matters, and it is the one that reads as boring.

Git follows a junction and a symlink as if it were an ordinary directory. In a vault repository that tracks `.obsidian/plugins/`, the linked directory therefore looks to git like the tracked files having changed to whatever the checkout currently holds — so every rebuild dirties the vault, and, far worse, a `git checkout` or `git pull` there writes through the link into the plugin's working tree. `styles.css` in that checkout is *source*. Losing it to a routine pull in an unrelated repository is a way to lose work that leaves no trace of where it went.

So the procedure is: untrack the files, ignore the directory, *then* link. In that order, because untracking after the link is already made stages a set of deletions whose contents came from the checkout.

The guide states the reason rather than the rule alone. A rule without its reason is the first step a person drops when the vault they are linking happens not to be a repository — and the next vault is.

### It goes beside the harness, not beside the install instructions

`docs-obsidian.md` describes the plugin as the person installing it sees it, and that person installs from the community browser. Putting a development procedure there would put the two routes side by side for a reader who needs only one of them, and the wrong one is the one that ends in a broken vault.

`docs-testing.md` already carries the plugin checkout, `SAFELEARN_TEST_PLUGIN_DIR` and the `AI/plugin` link, all of it per-installation and all of it for somebody working on this project. The new section belongs with them, and `docs-obsidian.md` keeps a single sentence pointing at it so that a developer who starts on the user-facing page is not left guessing.

## Risks / Trade-offs

- **The guide can only be walked through on the platform it is walked through on.** The Windows half is executed and confirmed by doing it; the Linux half is the same procedure with `ln -s`, and it is written from the same facts rather than from a run. It is marked as such rather than presented as equally verified.
- **The ignore rule hides a real dependency of the vault.** Somebody cloning that vault afterwards gets no plugin at all and no file explaining why, so the ignore entry carries a comment saying what belongs there and that it is set per installation — the same shape `AI/plugin` already uses in this repository's own `.gitignore`.
- **A linked vault loads whatever the checkout last built, including a broken build.** That is the point of it, and it is worth saying once in the guide: a vault used to *give a lecture from* should hold the released plugin, not the checkout.
