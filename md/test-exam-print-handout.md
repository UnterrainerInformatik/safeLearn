@@@ teacher
# Handout fixture for printing

The handout of an offline test that is printed and written on paper
(`exam-handout`, "A teacher prints a handout and its solution"). The module
fills the class and the date, the teacher fills the room on the test's page.
The print shows the public variant; the solution's print shows the private
one instead.

#### Quickie - %%var CLASS%% - %%var DATE%% - REST (Gruppe A)

HANDOUT-PRINT-TASK: hand the paper in at room %%var ROOM%%.

@@@ #variant-public
PRINT-PUBLIC-VARIANT
@@@

@@@ #variant-private
PRINT-PRIVATE-VARIANT
@@@
