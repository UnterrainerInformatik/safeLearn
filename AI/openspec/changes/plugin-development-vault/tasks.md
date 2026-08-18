## 1. Write the procedure

- [ ] 1.1 Add a subsection to `docs-testing.md` under "The second run: the Obsidian plugin", for a person who works on the plugin and wants a vault that loads what was last built — beside the checkout and the per-installation paths that are already described there, not beside the install instructions a user follows.
- [ ] 1.2 Give the prerequisite first: a checkout with `npm install` run once and `npm run build` run at least once. `main.js` is not committed, so a vault linked to a checkout that was never built loads nothing, and Obsidian says nothing useful about why.
- [ ] 1.3 Give both commands, each with what it should print or produce: `New-Item -ItemType Junction` on Windows, `ln -s` on Linux and macOS. A junction rather than a symbolic link on Windows, because that one needs neither developer mode nor an elevated shell.
- [ ] 1.4 Put the git step before the link and say what it prevents: git follows the link, so in a vault that tracks `.obsidian/plugins/` a later `checkout` or `pull` writes through it into the plugin's sources, where `styles.css` is source and not output. Untrack, ignore, then link — in that order.
- [ ] 1.5 Say that the ignore entry needs a comment naming what belongs in that directory, the way this repository's own `.gitignore` does for `AI/plugin`: a person cloning the vault afterwards otherwise finds an absence with no explanation.
- [ ] 1.6 Close with the two things that are true afterwards: a rebuild is picked up by reloading Obsidian and by nothing else, and a vault used to teach from should hold the released plugin rather than a checkout.

## 2. Point the other page at it

- [ ] 2.1 In `docs-obsidian.md`, leave "Installing It" saying what it says — the community browser is the route for the person that page is written for. Add at most one sentence saying that somebody working on the plugin has a different route, and where it is.

## 3. Walk it through

- [ ] 3.1 Follow the written procedure on Windows from the top, in a vault that is a git repository, and correct the text wherever a step turns out to assume something it did not say. `secureLectures` was linked this way already, so a second vault or a scratch clone is the honest test of the text rather than of the outcome.
- [ ] 3.2 Confirm the thing the git step exists for: after following it, a `git status` in the vault is clean across a rebuild of the plugin, and a `git checkout` there leaves the checkout's `styles.css` untouched.
- [ ] 3.3 Mark the Linux half for what it is. It is the same procedure with `ln -s`, written from the same facts; unless it is run on Linux before this is closed, say so rather than presenting both halves as equally walked.
- [ ] 3.4 Nothing for `AI/architecture.md` §9: this changes no behaviour, accepts no divergence from the renderer, and adds nothing the plugin mirrors from the server.
