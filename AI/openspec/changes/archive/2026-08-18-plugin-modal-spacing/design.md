## Context

Two questions the source proposal asks rather than answers: where the space between the field and the button comes from, and whether one answer serves both dialogs. Neither is hard. Both are easy to answer badly, because the bad answer is one line long.

## Decisions

### The space comes from a button container, not from a margin

`button.style.marginTop = "1rem"` is one line, needs nothing and looks right on the machine it was written on. It is also a length this plugin has no business knowing. Obsidian's dialogs are laid out by the theme the person chose, themes change the rhythm of a dialog as a whole, and a plugin that writes its own gap is a plugin that is a few pixels wrong in every theme but one — silently, because nothing ever fails.

So the button moves into a `modal-button-container` of its own, which is the element Obsidian's own dialogs put their confirmation in. The spacing, the alignment and the behaviour at a narrow width come from the theme, and this plugin says only *this is the dialog's confirmation*.

The alternative worth naming is `new Setting(contentEl).addButton(…)`, which is public plugin API where the container is a class name. It was not taken because a `Setting` is a settings *row*: it brings a name column, a description column and, in several themes, a rule above itself. Those are the parts of a settings tab, and a dialog that asks one question is not one. Buying spacing with a row that draws a line above the button trades a small wrong thing for a larger one.

The price of the class name is real: it is Obsidian's, not ours, and a version that renamed it would leave the button unspaced again — exactly the state this change is about. That is what the geometry check below catches, which is why the check belongs to this change rather than being a nicety attached to it.

### Both dialogs get the same shape

They ask different things, and the difference between a number field and a ten-row textarea is already the whole of it. Everything around the field is the same question — *what is this, and how do I confirm it* — so it is answered the same way in both: heading, whatever explains the field, the field, the confirmation in its container below.

This is worth writing down as a requirement rather than doing twice, because the failure it prevents is not these two dialogs being wrong. It is the *third* dialog, added later, being laid out however its author happened to create its elements — which is exactly how these two arrived here.

### The check reads boxes, not classes

Asking whether the button sits inside an element carrying the container's class would pass on a page where that element exists and collapses to nothing. What this change claims is that there is space between the field and the button, so the check measures: the button's box starts below where the field's box ends, and the two do not touch.

`columnsAreSideBySide` is the model. It reads `getBoundingClientRect()` of the laid-out columns rather than asking whether the elements carry the class that is supposed to lay them out, for the same reason: a class name is what somebody intended, and a box is what a person sees.

The gap is asserted as greater than zero, not as a number. A specific number would be this plugin choosing the spacing after all, by the back door, and it would fail on the first theme that is roomier or tighter than the one the check was written under.

## Risks / Trade-offs

- **The container is a class name, not an API.** If Obsidian renames or restyles it, the button loses its spacing and nothing throws. The geometry check is the guard, and it fails loudly the first time a run happens under such a version.
- **`answerColumnCount`, `answerNameList` and the screenshot tool all click `.modal-container button`.** The button gains an ancestor but stays the only `button` in the container, so the selector still finds it. Three callers depend on that detail of the DOM either way — a run is what proves it, and one run exercises all three.
- **The name-list picture changes.** `tools/obsidian-screenshots.mjs` photographs that dialog. The shot lives in the plugin repository and is not copied into the documentation, so nothing published goes stale; it is re-taken so that what it shows is what the dialog is.
