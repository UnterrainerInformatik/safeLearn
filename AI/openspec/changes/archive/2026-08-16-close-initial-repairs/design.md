## Context

See `proposal.md` — Why. What shapes the approach here is that the change is a list rather than a feature: nine repairs that share no code and no risk profile, from a role rule that decides what a class sees down to a typo. The temptation is to treat them as one sweep. Three of them change behavior a reader can observe, two more change an error path, and the rest cannot break anything at runtime because the code they touch was never executed. Those three groups want different care, and the ordering below follows that split rather than the order of the bullets in the source proposal.

Two constraints are worth stating before the decisions:

- **The view rules live in one `switch` in `hasRoles` (`utils.js`)**, evaluated after the student-view downgrade has already removed `teacher`, `teachers` and `admin` from the role set and cleared the local `isTeacher`/`isAdmin` flags. The `#exam` case reads those flags; the `#practice` case reads neither. That asymmetry is the whole defect — the two cases were written as independent rules over the same preference rather than as one rule and its complement.
- **The corpus root `md/` is hardcoded.** `scanFiles` walks it directly; no environment variable redirects it, and `test/harness.js` starts the application against the working tree. So any state that requires a different corpus — an empty one above all — is not reachable from a check.

## Goals / Non-Goals

**Goals:**

- The `#exam`/`#practice` pair is decided by one rule, so the two cannot drift apart again.
- Every error path this change touches ends in a rendered page or a served response, never in a stack trace.
- The verification suite stops asserting the practice defect as intended behavior.
- Whoever follows the documentation arrives at something that exists.
- `AI/proposals/initial-repairs.md` has nothing left in it.

**Non-Goals:**

- Authentication for `/hot-reload`. Struck from the list by the proposal's author; the endpoint stays reachable without a session and this change only stops it from throwing.
- The remaining Observations in `AI/architecture.md` that this change does not name: the per-scan `getPermissionsFor` cost, the duplicated whole-file permission check, the mixed comment languages, the SSE connection per page, the missing type checking, and the `MemoryStore` (already settled as a decision by `harden-deployment-surface`). They are recorded, not queued.
- Any change to which fonts, themes or render features exist. This change removes code that is not called and repairs code that is.

## Decisions

### The practice rule is written as the complement of the exam rule, not as its own condition

`#practice` becomes `!(a.ve == 1 && (isAdmin || isTeacher))` — literally the negation of the expression the `#exam` case evaluates, over the same flags at the same point after the downgrade. The two cases then read as one rule and its complement, and the property the spec demands (exactly one variant, always) is visible at the place a future reader would change either of them.

*Alternatives considered.* **Clear `a.ve` during the student-view downgrade**, so that `#practice`'s existing `a.ve == 0` starts matching. Same observable behavior, and it reads well at the downgrade — but it makes a preference a casualty of a role decision, and it leaves the two view cases looking independent, which is the condition that produced the defect. **Add `|| !(isAdmin || isTeacher)` to the existing condition.** Also equivalent, and shorter, but it states the complement without looking like one; the next person to touch the exam gate has no reason to look at the practice case.

The exam rule itself is not touched. `role-resolution` already specifies it, `harden-role-set-assembly` hardened it, and inverting it in one place is enough.

### The empty navigation tree is repaired but not verified in the browser

`getDirectoryListing` reads `filteredFiles[filteredFiles.length - 1]` to decide whether to close two `div`s. The guard is one condition. Proving it is the problem: reaching it needs a session that may see no file, and since `md/` is hardcoded, the only way to produce that from a check is to restrict every corpus file against every test account — which would take the rest of the suite down with it.

So the repair ships with its verification gap recorded in `docs-testing.md`'s "What the corpus demonstrates but a run cannot assert", alongside the `catch` in `hasRoles`, which is unreachable for the same kind of reason. The `content-verification` delta deliberately carries no scenario for it: that spec describes what a run asserts, and inventing a scenario no check can execute would make the spec the least trustworthy document in the repository.

*Alternative considered.* Make the corpus root configurable and start a second application instance against an empty directory. That is a real answer, and it would close this gap and make several others reachable — but it adds an environment variable to the deployment surface and a second server lifecycle to the harness, to prove a two-line guard. If a second such gap appears, that is the change to write; one does not justify it.

Worth noting for the record: the realistic trigger is not permissions at all. The WYSIWYG containers bind-mount the author's own vault, so a teacher pointing the container at a fresh, empty folder hits this on the first page load.

### The truncation goes away entirely, and the corpus grows a name that would have caught it

`obsidian.js:949` calls `f.split(0, -3)` where `slice(0, -3)` was meant — `String.prototype.split` with `0` as the separator and a limit that coerces to no limit. For a name without a `0` it returns a one-element array that stringifies back with the `.md` still attached; for a name containing `0` it splits there and the array stringifies with a comma in the middle, which does not resolve.

The repair is not `slice`, though: it is no truncation at all. The extension the call meant to cut off is the one the page handler decides on — `app.js:308` answers a request because `path.extname` says `.md`, and anything else falls through `express.static("/md")` to the catch-all redirect. So a link that dropped it would not resolve either. A run with `slice(0, -3)` in place shows exactly that: `/md/test-presentation` and `/md/test-chapter-10` both land on the start page, and the duplicate-basename check that had been passing fails with them. `f` is already the path that disambiguates the copies, and the single-candidate line three above emits its path whole; the duplicate branch now does the same.

The corpus therefore gains a duplicated basename carrying a digit, in two folders, so the branch is exercised on the input that distinguishes the two functions. This is the one place where a repair without a new corpus file would look verified while proving nothing.

### The shortcut check lands with the document view, not with the keyboard

`CTRL+ALT+D` is the documented way into the document view, so its check belongs to `test/checks/presentation.js`, which already owns that view — not to a new check file for keyboard handling, which would guard one line of `obsidian-page.js` and nothing else. The check presses the shortcut with shift held and without it, because the defect is precisely that the shifted key was never matched; asserting only the unshifted press would pass against the broken code.

The other repair in client-side code has no such home and gets no check: the `/hot-reload` guard is asserted from `test/checks/deployment-surface.js` against the endpoint directly, since the harness refuses that stream inside the browser on purpose (`test/harness.js:375-381` — an endless response that would pile up connections across a walk of dozens of pages). Asserting it needs a request whose stream is read for its headers and then abandoned, not a page that subscribes.

### Node 24 is pinned by line, not by patch

`.nvmrc` gets `24`, the `Dockerfile` gets `node:24-alpine`, and `package.json` gains `"engines": { "node": ">=24 <25" }` so the requirement is stated once where a reader looks for it.

The current `Dockerfile` pins `25.6.0` exactly. A patch-exact pin is only worth its cost when something updates it; nothing in this repository does, and the pin's practical effect has been to hold the image on whatever version was current when the line was written while the security patches for that line went by. Pinning the line keeps the major and minor guarantee that matters and lets a rebuild collect patches.

*Alternative considered.* Keep `.nvmrc` at 20 and change nothing else — Node 20 left maintenance in April 2026, so local development would be running a line that receives no fixes. Raising `.nvmrc` to 25 instead was the other option: it agrees with the image today, but 25 is an odd-numbered line with no long-term support window, so the disagreement would return the moment 26 lands.

### `cors` is removed rather than wired up

The declaration has been in `package.json` without an import for the life of the file. The application renders its own pages against its own session cookie, and `/convert` is reached from the same origin; nothing in the repository or the documentation describes a cross-origin caller. Removing a declaration that was never loaded cannot change behavior, and adding middleware to justify a dependency would.

The self-reference `"safe-learn": "file:"` goes with it. It makes `npm install` resolve the package into its own `node_modules`, which is at best a no-op and at worst a source of a confusing tree.

### Documentation is corrected in place; the ASCIIDoc announcement is withdrawn

Each documentation divergence is a sentence that names something the code does not have. They are corrected where they stand — no restructuring, no new document.

The ASCIIDoc / GitHub Pages path is the exception, because it is not a wrong detail but an announcement of work that was never done, and it is on the start page of every deployment. `index.html` loses the promise and `docs-debugging.md` loses the reference. `asciidocs/` stays on disk: it is source material, and deleting it would be a decision about the author's intentions rather than a repair. It simply stops being described as feeding a pipeline.

## Risks / Trade-offs

- **A teacher who has kept the exam view on now sees the practice question in the student view, where they previously saw a gap** → That is the repair, but it is a visible change for the one group that uses both switches. It is stated in the proposal's Impact and belongs in the change's summary when it is archived; no notice inside the application is warranted for restoring a question that was disappearing.
- **The Node 24 move is the only step that can break the build** → It lands as its own task with `npm test` as its gate, and it is separable: if the suite fails on 24, the version work can be dropped from the change without touching any other repair. `jsdom`, `puppeteer` and `shiki` are the dependencies with native or version-sensitive surface; nothing in the tree declares an upper bound below 24.
- **New corpus files can move assertions that count or address navigation entries** → `test/checks/navigation.js` walks the tree, and folder-level checks elsewhere read positions. The corpus additions go in before the `slice` repair, so the suite runs once with the new files and the old code and any disturbance surfaces as its own failure rather than as a suspected regression from the repair.
- **Removing exports is invisible until something imported them** → `uiConfig`, `hasAllRoles` and `mdFilesDirOnHdd` are asserted absent from the repository, not merely absent from the modules that seemed likely; the WYSIWYG container directories and `http/` collections are part of that sweep.
- **The practice repair is being made against a check that currently asserts the defect** → The check is rewritten in the same task as the rule, not before it and not after, so the suite is never green on a state nobody intends.

## Migration Plan

No data migration and no deployment step beyond the image rebuild the Node change implies. Sessions are unaffected: `hasRoles` reads preferences per request, so the new practice rule applies to every session on the next page load without anyone logging out.

Rollback is per repair — the change touches nine independent places and any one of them can be reverted alone. The Node bump is the only one whose revert also requires an image rebuild.

## Open Questions

None. The three that would have changed the specs — what a downgraded teacher sees, which Node line, and whether the ASCIIDoc path gets built or withdrawn — were decided before this document was written.
