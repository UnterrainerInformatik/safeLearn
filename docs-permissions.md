# Permissions
Here you can find an explanation of the projects permissions-features.

[Back](README.md) to the main page.
## Security
To restrict the visibility of a whole file or parts of a document's content and therefore effectively hiding it from anyone not having any of the given roles assigned, you specify a comma-separated list of roles.
Anyone who has even one of these roles assigned will be able to view the document or that part of the document you specified the directive for.
### Here are the rules
* By default everyone has access to a file or document-content.
* A directive lists the roles that are allowed to read the content. It never grants those roles to whoever reads it. `@@@ admin` is visible to a session that holds `admin` and to nobody else, and the same goes for every other role name.
* There are some roles that are built in...
	* `admin`... is a role for testing-purposes, new features, etc...
	* `teacher`... see everything (except for admin-only). So when you make a document visible to users with the role, let's say `5chif`, then you don't have to specify `teacher`. That is implied.
	* `teachers`... is an alias of `teacher`. Anyone holding `teacher` also satisfies a directive written in the plural, and anyone without it satisfies neither. The alias is part of the reader's roles, so `@@@ teacher`, `@@@ teachers` and `@@@ teacher, teachers` all address exactly the same people.
	* `student`... is a role the code knows but that almost nobody holds — see [Addressing students](#addressing-students) below before you use it in a directive.
	* `students`... is an alias of `student`. Anyone holding `student` also satisfies a directive written in the plural, and anyone without it satisfies neither. The alias is part of the reader's roles, so `@@@ student`, `@@@ students` and `@@@ student, students` all address exactly the same people — which, in a normal school setup, is nobody.
	* You gain a role either by getting the OU= value set by LDAP (`Teachers` gets translated to `teacher` and `Students` to `student`), or by assigning a client-role with that name.
	* The name of the user works as permission-role as well. So in the case of this test-setup here the user 'student' has first-name 'Stu' and last-name 'Dent'; So the viable permission for this user would be `@@@ Stu Dent`.
		* The built-in role names are reserved. A user whose displayed name is `admin`, `teacher`, `teachers`, `student` or `students` is not addressable by that name and does not gain the role from it — only LDAP or a client-role grants it. Such a collision is written to the server log; rename the account to make the name usable again.
	* On an instance without sign-in (`AUTH=none`, [tier 1](docs-installation.md#tier-1--publishing)) nobody has an account to take roles or a name from. There every reader holds exactly the roles `READER_ROLES` lists — `READER_ROLES=teacher,4bhif` makes every reader a teacher in `4bhif` — and nothing a request carries adds to them or takes one away. Without `READER_ROLES` a reader holds no role, so every restricted section and file stays hidden. The rules above apply to these roles exactly as to a session's: the plural aliases, `admin`, the student view and the exam gate. A block addressed to a person by name is shown to no reader.
* Roles are case-insensitive. So putting `@@@ Stu Dent, 4BHIF` is the same as putting `@@@ stu dent, 4bhif`.
* If the directive is in the first line of the document (the very first line), then it applies to the whole document.
	* In that case, there is no end-directive.
	* A file whose first line opens Obsidian frontmatter (a properties block from `---` to `---`) has that block stripped before the directive is looked for, so its first line is the line right after the block. Put the directive there; see "File Restrictions" below.
* Documents that are hidden for a viewer will not be displayed to that viewer, even if the viewer has a direct-link.
* Documents that are hidden for a viewer will not be visible in the directory-tree on the left as well.
* If a directory on the left has only files invisible to the viewer, then the entry of that directory will be invisible as well.

### Attachments
Images, PDFs and every other file a page embeds or links (`![[name]]`, `[[name]]`, `![](path)`, `[text](path)`, a raw `<img src>`) follow the places they are used in. There is no directive for an attachment itself.
* An attachment is as visible as its **most visible** reference. One that sits on a teacher page, in a `@@@ 4bhif` block and on an unrestricted page is served to everyone; one that sits only on the teacher page is served to teachers only. A reference counts where the reader may see it right now: inside a closed time window, in the private variant without the variant view on, or in a teacher block while a teacher is in the student view, it counts for nobody.
* An attachment **no page references is not served** to anyone, even though the file sits under `md/`. The server logs these files after every scan, one line `[Attachments] unreferenced: <path>` each and one line with their count, so they can be removed from the repository. A teacher finds the same list on the page **Unreferenced attachments**, opened from the settings menu's **Administration** section: grouped by folder, with the time of the scan, and a **Copy paths** button that puts the paths on the clipboard one per line, ready for `git rm`. The page shows names only; it serves none of the files. Students and teachers in student view get neither the section nor the page, and an instance running with `AUTH=none` has neither. To keep such a file reachable, reference it on a page with the restriction it should have.
* An embed or wiki link whose file name exists in several folders and that does not give the folder (`![[diagram.png]]` with two `diagram.png`) renders as nothing and makes neither file reachable. Write the path, `![[folder/diagram.png]]`.
* A refused attachment is answered exactly like a file that does not exist.
* Tightening the restriction around a reference takes effect at once where the server rescans on change (`NEXT_AUTOSCAN`, as the WYSIWYG container has it). Without autoscan, a reader who opened the page before the edit may keep loading the attachment for **up to 10 minutes**.

### Exam handouts: the one exception
The exam module's offline tests can show a corpus file as a **handout** ([Offline Tests](docs-exam-module.md#offline-tests)). That is the only place where a file is shown to someone its whole-file directive does not admit. It shows a student nothing an ordinary page would show them only in the private-variant or optional view:
* Only the module's own handout page does it, and only for a participant of an open, started sitting who is marked present, for the file of their group - decided from the module's database at every request. Everyone else, and the same student before the start or after the window, gets what a path with nothing behind it gets.
* The page renders the file as for a student, whatever the reader's own view switches say: the first-line directive is set aside, `#variant-public` is shown, `#variant-private` and `#optional` hidden - so a test whose solutions sit in `#variant-private` blocks can be used as a handout as it is. A teacher's preview shows the same. Only the teacher's solution page shows `#variant-private` and `#optional` (and hides `#variant-public`). Inline blocks for roles - `@@@ teacher`, another class, another person - are decided exactly as on any page.
* These views are set by the server for that one rendering. No preference, cookie, header or query parameter produces them, and the same session's other pages keep following the reader's own switches.
* The file stays hidden everywhere else: the navigation tree, the search and its own URL still follow its directive.
* Its attachments count as visible for that student while, and only while, the handout is shown to them (see [Attachments](#attachments)); a file referenced only inside a `#variant-private` or `#optional` block does not count for a participant. A teacher's solution page counts for the teacher, private-variant and optional blocks included.

### Addressing students
**Being a student is not a role. It is the absence of the other two.** A student is a user who is neither `admin` nor `teacher`, and that is the normal case — the overwhelming majority of all users.

The role `student` does exist in the code: an LDAP unit `Students` is translated to it, and a client-role of that name grants it. But a school directory does not normally put its pupils into such a unit, so in practice nobody carries it. `@@@ student` and `@@@ students` then address nobody at all.

So do not try to address students positively. Content for everyone who is not a teacher needs **no directive** — by default everyone has access, which is the first rule above. You restrict content *away* from students with `@@@ teacher`; you do not hand it *to* them with `@@@ student`.

The teacher/student view toggle works on exactly this definition: switching to the student view does not give a teacher the `student` role, it takes `teacher`, `teachers` and `admin` away. What remains is a student.
### File Restrictions
Put the security directive on the first line of the document.
```markdown
@@@ 4bhif

# Some Document
Some text in a document only visible to users with the `4bhif` group or `teacher`.
```

```markdown
@@@ teacher

# Some Document
Some text in a document only visible to teachers.
```

A file with Obsidian properties keeps them at the very top, as Obsidian writes them; the directive goes on the line right after the closing `---`. The block is stripped before anything reads the file - the page, the navigation tree, search, the attachment check and exam handouts all see the directive there - and is never shown as content.
```markdown
---
klasse: 4AHIF
footer: "4AHIF - WMC4 - Hausübung 1"
---
@@@ teacher

# Some Document
Some text in a document only visible to teachers, whose properties are not shown as text.
```
The property values are searched like body text, by anyone the directive lets see the file and by nobody else. The page view offers a button showing all properties as a message, and a `header` or `footer` property holding text is shown above and below the content in all three views (on every slide in a presentation).

You can specify multiple roles, so anyone with ANY of those roles assigned will be able to view the document.
```markdown
@@@ 4bhif, 4chif, 5ahif

# Some Document
Some text in a document only visible to users with the `4bhif` OR `4chif` OR `5ahif` or any combination of those.
```
### File-Content Restrictions
Put the security directive in the middle of your documents' content.
Don't forget to put in an end-directive in this case.
These directives cannot be nested!

```markdown
# Some Docuemnt
Some text visible to all.

@@@ teacher
Some text only teachers can read, but not the students.
@@@

Some more text visible to all again.
```
Of course you can use full Obsidian-flavor-markdown within the directives.

#### Where a block begins and ends
The server and the Obsidian plugin read blocks by the same rules, so the block the plugin frames is the block the server hides or shows:
* **Markers are whole lines.** A block opens on a line that starts with `@@@` (spaces or tabs in front are fine, as inside a list item) and names something. It closes on the next line that holds nothing but `@@@`.
* **`@@@` anywhere else is text.** In the middle of a sentence or in inline code, as in "the solutions are in the `` `@@@ #variant-private` `` blocks", it neither opens nor closes anything.
* **Code blocks are code.** Marker lines inside a fenced code block (```` ``` ```` or `~~~`) are shown as written, so you can write syntax examples. A fence that is never closed protects nothing.
* **A stray closing line is ignored.** A `@@@` line with no open block closes nothing and is not shown.
* **An opening line inside a block opens nothing.** Blocks do not nest: the outer directive decides the whole block up to its closing line, and the inner directive line is not shown.
* **An unclosed block hides to the end.** A block that is never closed runs to the end of the document and is hidden from everyone it does not address. The server logs `[Blocks] unclosed: <file>:<line>` for it, so check your closing lines.

### Time-bound visibility
Every role inside a permission directive may optionally define a visibility window. Append a timestamp in square brackets directly after the role name:

```markdown
@@@ teacher,4ahif[2025-11-28T08:00:00]
Visible to teachers immediately and to 4AHIF starting at 28 Nov 2025 08:00.
@@@
```

Specify both start and end using `to`:

```markdown
@@@ teacher, 4bhif[2025-11-28T08:00:00 to 2025-11-28T10:50:00], 4ahif
4BHIF may read this only during the exam slot. Teachers and 4AHIF are unrestricted.
@@@
```

You can also create open-ended windows (`[2025-12-01T08:00:00]`) or hide content after a certain point (`[to 2025-12-01T12:00:00]`).

Timestamps follow ISO 8601 (`YYYY-MM-DDTHH:mm:ss`). Values without an explicit timezone are interpreted in the server's local timezone; append `Z` or an offset if you need UTC or a specific zone.

**A window the server cannot read closes its entry for good.** That covers a typo such as `4bhif[gestern]`, a time without seconds (`[2025-11-28T08:00]`), a window of which only one end can be read (`[2026-11-01T08:00:00 to nächste Woche]`) and an entry that cannot be read at all, such as `4ahif[]`. Such an entry admits nobody, at any time; it never falls back to "no window" and never keeps just the readable end. The other entries of the directive are unaffected, so in `@@@ teacher, 4bhif[gestern]` teachers still read the block and 4BHIF never does. The Obsidian plugin marks such a window while you write, and the server logs `[Permissions] unreadable window: <file>:<line> <entry>` at every scan.

The server continuously watches these windows. When a block or a whole file becomes visible or hidden, all subscribed clients receive a Server-Sent Events reload signal so the UI stays in sync automatically.

A window on a first-line directive restricts the whole file the same way:

```markdown
@@@ teacher[2025-11-28T08:00:00 to 2025-11-28T10:50:00]

# Some Document
Teachers may open this during the exam slot, and nobody at any other time.
```

**Roles stay roles when their windows close.** A block whose directive names roles or persons is shown only through one of those entries that is open right now. When all of them are closed - shut windows, unreadable ones - the block is hidden from everyone, an admin included, whatever view markers stand beside them: `@@@ 4ahif[to 2026-09-30T18:00:00], #optional` is not shown to everyone with optional blocks on once September is over. The admin short-circuit replaces only the role test, and only while a written role is open.

When every window in a whole-file directive is shut, no role is active — so the file is hidden from everyone, including the roles it names and from `admin`, which does not short-circuit a closed window. A reader who asks for it anyway is told **This content is not visible right now.**, rather than the **You do not have the required permissions to view this content.** they get for a directive naming roles they simply do not hold. The two messages are deliberately different: the first says come back later, the second says ask someone else. The file is left out of the navigation tree in both cases.

### Where the view switches are kept
The teacher view, the variant view and the optional view decide what a reader is shown, so where they are read from matters. With sign-in they are read from the reader's Keycloak account and from nothing else: a cookie, a header or a query parameter such as `?ve=1` is ignored. Without sign-in (`AUTH=none`) they are kept in the reader's browser, in the cookie `safelearn_config`, and they can only narrow what the reader's roles allow — the private variant still needs `teacher` among the reader roles. A preference block that does not parse is read as the defaults, which hide rather than show.

Parameters that only choose how one page is presented — `?reveal`, `?document`, print, a heading to scroll to — never change what a reader may see. Every presentation of a page carries the same permitted content, and these parameters stay in the URL, so a presentation link can be bookmarked and shared.

### File-Content Views
A directive entry that starts with `#` is not a role but a **view marker**. There are exactly three, and each name says first *how* it works and then *for whom*:

| Marker | Mechanism | Who sees it |
| --- | --- | --- |
| `#variant-private` | One side of an either-or. | Only teachers and admins with the variant switch on (`ve`). **Never a student**, whatever they set. Hidden on a handout, shown on its solution page. |
| `#variant-public` | The other side of that either-or. | Everyone who is not shown `#variant-private`. Every reader sees exactly one of the two. |
| `#optional` | A block the reader can show or hide. | Every reader who turns on the **optional blocks** switch (`va`), a student just as a teacher. Hidden on a handout, shown on its solution page. |

So the question to ask while writing is not "is this an answer?" but "may a student ever switch this on?". A test's real solutions belong in `#variant-private`; `#optional` is for hints and worked answers the class may reveal.

```markdown
# Question 23

## Introduction
@@@ #variant-public
You are a student making an internship at a big company that wants to re-write the legacy software.
@@@
@@@ #variant-private
You are employed at a company that wants to re-structure their legacy software.
@@@

## Question
* What development tools will you be using?
* Make a plan.
* Explain the steps to get to a finished new product.
@@@ #optional
## Answer
* Java and Javascript.
* Just do it.
* Do it. See, you're done.
@@@
```

In the reader menu, teachers get a switch between **private variant** and **public variant**; everyone gets the switch **optional blocks / no optional** for `#optional`.

#### Combining markers and roles

Entries are separated by commas, view markers included. The roles and persons of one directive are combined with **OR** - holding any one of them is enough. The view markers are combined with **AND**, with each other and with the roles - every one of them has to hold, in whichever order they are written:

```markdown
@@@ #variant-private, #optional
The solution, revealable by a teacher with the private variant on - never by a student.
@@@

@@@ 4bhif, 5bhif, #optional
A hint for the two classes, shown when they turn optional blocks on.
@@@
```

Without the comma, `#variant-private #optional` is one marker of an unknown name and hides its block from everyone. Since every reader sees exactly one of the two variants, `@@@ #variant-private, #variant-public` is shown to nobody - the plugin marks it as an error. A marker carrying a window works as the plain marker while the window is open; while it is shut, or if it cannot be read, nobody satisfies the marker and the block is hidden.

**An unknown view marker hides its block from everyone**, an admin included. That covers a typo such as `#variant-privat` and the retired names below: a block still marked `@@@ #exam` is shown to nobody until it is renamed. The Obsidian plugin marks such an entry as an error while you write, and the content suite checks `md/` for them.

The markers were renamed on 2026-11-22, without aliases:

| Old (retired) | New |
| --- | --- |
| `#exam` | `#variant-private` |
| `#practice` | `#variant-public` |
| `#answer` | `#optional` |

`node tools/rename-view-markers.mjs <dir>` counts the old names in a content directory (dry run); with `--write` it rewrites them wherever they follow `@@@` on their line, and then lists every old name left over (tags, prose) to be judged by hand. A bare `#exam` with no `@@@` before it is an Obsidian tag and is left alone.
