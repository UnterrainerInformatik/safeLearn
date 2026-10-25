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
* Documents that are hidden for a viewer will not be displayed to that viewer, even if the viewer has a direct-link.
* Documents that are hidden for a viewer will not be visible in the directory-tree on the left as well.
* If a directory on the left has only files invisible to the viewer, then the entry of that directory will be invisible as well.

### Attachments
Images, PDFs and every other file a page embeds or links (`![[name]]`, `[[name]]`, `![](path)`, `[text](path)`, a raw `<img src>`) follow the places they are used in. There is no directive for an attachment itself.
* An attachment is as visible as its **most visible** reference. One that sits on a teacher page, in a `@@@ 4bhif` block and on an unrestricted page is served to everyone; one that sits only on the teacher page is served to teachers only. A reference counts where the reader may see it right now: inside a closed time window, in the exam variant without the exam view, or in a teacher block while a teacher is in the student view, it counts for nobody.
* An attachment **no page references is not served** to anyone, even though the file sits under `md/`. The server logs these files after every scan, one line `[Attachments] unreferenced: <path>` each and one line with their count, so they can be removed from the repository. A teacher finds the same list on the page **Unreferenced attachments**, opened from the settings menu's **Administration** section: grouped by folder, with the time of the scan, and a **Copy paths** button that puts the paths on the clipboard one per line, ready for `git rm`. The page shows names only; it serves none of the files. Students and teachers in student view get neither the section nor the page, and an instance running with `AUTH=none` has neither. To keep such a file reachable, reference it on a page with the restriction it should have.
* An embed or wiki link whose file name exists in several folders and that does not give the folder (`![[diagram.png]]` with two `diagram.png`) renders as nothing and makes neither file reachable. Write the path, `![[folder/diagram.png]]`.
* A refused attachment is answered exactly like a file that does not exist.
* Tightening the restriction around a reference takes effect at once where the server rescans on change (`NEXT_AUTOSCAN`, as the WYSIWYG container has it). Without autoscan, a reader who opened the page before the edit may keep loading the attachment for **up to 10 minutes**.

### Exam handouts: the one exception
The exam module's offline tests can show a corpus file as a **handout** ([Offline Tests](docs-exam-module.md#offline-tests)). That is the only place where a file is shown to someone its whole-file directive does not admit, and the only place a student sees `#exam` content:
* Only the module's own handout page does it, and only for a participant of an open, started sitting who is marked present, for the file of their group - decided from the module's database at every request. Everyone else, and the same student before the start or after the window, gets what a path with nothing behind it gets.
* The page renders the file as for a student, whatever the reader's own view switches say: the first-line directive is set aside, `#exam` is shown, `#practice` and `#answer` hidden. Inline blocks for roles - `@@@ teacher`, another class, another person - are decided exactly as on any page.
* These views are set by the server for that one rendering. No preference, cookie, header or query parameter produces them, and the same session's other pages keep showing the practice variant.
* The file stays hidden everywhere else: the navigation tree, the search and its own URL still follow its directive.
* Its attachments count as visible for that student while, and only while, the handout is shown to them (see [Attachments](#attachments)); a teacher's preview and solution deck count for the teacher.

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

The server continuously watches these windows. When a block or a whole file becomes visible or hidden, all subscribed clients receive a Server-Sent Events reload signal so the UI stays in sync automatically.

A window on a first-line directive restricts the whole file the same way:

```markdown
@@@ teacher[2025-11-28T08:00:00 to 2025-11-28T10:50:00]

# Some Document
Teachers may open this during the exam slot, and nobody at any other time.
```

When every window in a whole-file directive is shut, no role is active — so the file is hidden from everyone, including the roles it names and from `admin`, which does not short-circuit a closed window. A reader who asks for it anyway is told **This content is not visible right now.**, rather than the **You do not have the required permissions to view this content.** they get for a directive naming roles they simply do not hold. The two messages are deliberately different: the first says come back later, the second says ask someone else. The file is left out of the navigation tree in both cases.

### Where the view switches are kept
The teacher view, the exam view and the answer view decide what a reader is shown, so where they are read from matters. With sign-in they are read from the reader's Keycloak account and from nothing else: a cookie, a header or a query parameter such as `?ve=1` is ignored. Without sign-in (`AUTH=none`) they are kept in the reader's browser, in the cookie `safelearn_config`, and they can only narrow what the reader's roles allow — the exam view still needs `teacher` among the reader roles. A preference block that does not parse is read as the defaults, which hide rather than show.

Parameters that only choose how one page is presented — `?reveal`, `?document`, print, a heading to scroll to — never change what a reader may see. Every presentation of a page carries the same permitted content, and these parameters stay in the URL, so a presentation link can be bookmarked and shared.

### File-Content Views
There are two views.
```markdown
# Question 23

## Introduction
@@@ #practice
You are a student making an internship at a big company that wants to re-write the legacy software.
@@@
@@@ #exam
You are employed at a company that wants to re-structure their legacy software.
@@@

## Question
* What development tools will you be using?
* Make a plan.
* Explain the steps to get to a finished new product.
@@@ #answer
## Answer
* Java and Javascript.
* Just do it.
* Do it. See, you're done.
@@@
```
