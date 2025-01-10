# Permissions
Here you can find an explanation of the projects permissions-features.

[back](README.md) to the main page.
## Security
To restrict the visibility of a whole file or parts of a document's content and therefore effectively hiding it from anyone not having any of the given roles assigned, you specify a comma-separated list of roles.
Anyone who has even one of these roles assigned will be able to view the document or that part of the document you specified the directive for.
### Here are the rules
* By default everyone has access to a file or document-content.
* There are some roles that are built in...
	* `admin`... is a role for testing-purposes, new features, etc...
	* `teacher`... see everything (except for admin-only). So when you make a document visible to users with the role, let's say `5chif`, then you don't have to specify `teacher`. That is implied.
	* You gain a role either by getting the OU= value set by LDAP (`Teachers` gets translated to `teacher` and `Students` to `students`), or by assigning a client-role with that name.
	* The name of the user works as permission-role as well. So in the case of this test-setup here the user 'student' has first-name 'Stu' and last-name 'Dent'; So the viable permission for this user would be `@@@ Stu Dent`.
* Roles are case-insensitive. So putting `@@@ Stu Dent, 4BHIF` is the same as putting `@@@ stu dent, 4bhif`.
* If the directive is in the first line of the document (the very first line), then it applies to the whole document.
	* In that case, there is no end-directive.
* Documents that are hidden for a viewer will not be displayed to that viewer, even if the viewer has a direct-link.
* Documents that are hidden for a viewer will not be visible in the directory-tree on the left as well.
* If a directory on the left has only files invisible to the viewer, then the entry of that directory will be invisible as well.

There is no role `student`. Students are just users without the `teacher` role.
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
