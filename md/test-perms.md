# Simple Permission
The following paragraph is only visible to teachers:
@@@ teacher
>Only visible to teachers.

@@@

# Simple Group Permission
The following paragraph is only visible to 5BHIF:
@@@ 5bhif
>Only visible to 5BHIF.

@@@

# User Permission
The following paragraph is only visible to Stu Dent
@@@ Stu Dent
>Only visible to Stu Dent

@@@
# NO Nested Permissions!
Nested permissions don't work due to the way we parse the permission-declarations (regexp).

The following paragraph is only visible to 5BHIF:
@@@ 5bhif
>Only visible to users in 5BHIF group.

The following paragraph is only visible to teachers in group 5BHIF:
@@@ teacher
>Only visible to users being in teachers AND 5bhif groups.

@@@
@@@
