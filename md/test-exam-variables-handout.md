@@@ teacher
# Handout fixture with variables

The handout of an offline test whose parts that change from test to test are
handout variables (`exam-handout`). The module fills the class and the date,
and the teacher fills the PIN on the test's page. Everywhere else - this
file's own page, search, the plugin - the variables are comments and hidden.

#### Test - %%var CLASS%% - %%var DATE%% - Quarkus REST Basics

HANDOUT-VARIABLES-TASK: log in to Franklyn with the PIN %%var FRANKLYN_PIN%%.
