## Context

Three characters to take off the screen, on a line that must stay reachable. The plugin has done this twice already — the directive line, the fragment — and both times the answer was the same mechanism. What is new here is that there is nothing to put in the marker's place.

## Decisions

### A replacement with no widget

`plugin-quieter-tag-markings` settled the general form: a `Decoration.replace` lifted by `isTouched`, in preference to a stylesheet that shrinks the text to nothing. The argument there was that a person deleting a tag must not be backspacing through characters nobody can see, and it applies here with more force, not less — deleting this marker is the whole point of reaching it.

What differs is the widget. The directive line has a heading to stand in its place and a fragment has an icon, because in both cases something is still being said. Here nothing is: the frame's floor is drawn on that line by `permission-block-end` and it is the whole statement. So the replacement carries no widget, and what is left is a `cm-line` with the block's classes and no content — the blank line the frame closes on.

That is also why the range is not made atomic, exactly as it is not for the directive line. A range the cursor cannot enter needs something else to lift it, and every one of those is a way for the line to become uneditable when it fails. Here it would be worse than uneditable: an unreachable closing marker is a restriction a teacher cannot take back.

### `resolveBlocks` says whether it closed the block

`Block.to` was two different things depending on how the walk ended — the line the closing marker stands on, or the last line of a document that never closed the block. Nothing had needed to tell them apart before: both ends carry `permission-block-end` because the frame closes at the bottom either way.

Now it matters, because one of them is punctuation and the other is a sentence somebody wrote. The walk is the only place that knows which, so it says so: `closed: boolean` on the block. The alternative — testing `lines.at(block.to)` against `closesPermissionBlock` again at the point of use — is a second opinion about a question already answered, and the reason every recognition rule in this plugin sits in one block at the top of the file is that a tag form with two rules is what let the editor and the reading view drift apart.

The field is set for the side-by-side block too, though nothing reads it there. A block that reported it for one kind and not the other would be a field whose meaning depends on which kind you are holding.

### `markLines` hands over the lines, not the rule

`buildDecorations` receives `closers: Set<number>` beside `directives`, from the one walk of the document that `markLines` already does. It is the same shape the directive lines arrive in and for the same reason: the decoration set and the DOM pass must not be free to disagree about where a block ends.

### The side-by-side markers stay as they are

`##side-by-side-start`, `##separator` and `##side-by-side-end` are visible in the editor and stay visible. The separator in particular is not punctuation at the edge of a region — it decides where one column ends and the next begins, in the middle of content, and a person moving it is doing something to the layout rather than removing a restriction. Whether those three should be quieted is a question about that block kind; answering it here because the code was open would be a change nobody asked for.

## Risks / Trade-offs

- **A blank line that is not blank.** The document holds `@@@` on a line that shows nothing, so a person counting lines or selecting by eye sees one more empty line than the file has. Mitigated by the frame: the line is inside the box, at its floor, and the floor is where a closing marker is. The reading view has shown exactly this since `plugin-hide-tags` and it is the state this is measured against.
- **Two markers, one string.** Both of a block's markers hold `@@@`, so a check reaching for one by text finds the other. That is a hazard for the checks rather than for the plugin, and it is why the harness gained a way to name the last line holding a needle rather than the first.
- **Nothing marks where a block ends except the frame.** If the frame fails to draw — a theme, a future defect in the pass that reaches widget elements — the block's end becomes invisible rather than merely unmarked. The frame is checked by geometry rather than by class list, which is what `plugin-frame-across-widgets` established for this reason.
