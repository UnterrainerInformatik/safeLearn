## ADDED Requirements

### Requirement: Rows are coloured by what they mean

Where a row of one of the module's tables stands for one value that matters most for it (a grade, a test's state, a participant's status), the row SHALL be coloured by that value, from one shared set of row colours:
- **good** (green): a good outcome or something completed;
- **bad** (red): a failing outcome, or something happening right now that needs attention;
- **warn** (amber): something that will need attention soon, or a flag to look at;
- **info** (slate): something later, or not taking part;
- **neutral**: no colour.

A coloured row SHALL show a tint across the whole row and a stripe of the same hue at its left edge. A flag that does not judge the row SHALL show the stripe only. Each tone SHALL have its own values for light and dark mode, with text staying readable on the tint. The tint SHALL also cover cells that stay in place when the table scrolls horizontally.

The colour SHALL NOT be the only carrier of the meaning. The row SHALL say it in words, through the value it shows (such as the grade) or as its tooltip, and a table whose rows do not show the value itself SHALL have a legend naming the colours. The marked row SHALL keep its own highlight over the tint, and its stripe SHALL stay visible. A cell with a colour of its own, such as a Matura candidate's name, SHALL keep it. A table whose rows already carry colours of their own (the attendance table's handout groups, the question pool's chosen and unreviewed questions) SHALL keep them and not take on these colours.

#### Scenario: The marked row

- **WHEN** a teacher clicks a row coloured red
- **THEN** the row shows the marked highlight, and the red stripe stays at its left edge

#### Scenario: Dark mode

- **WHEN** a teacher reading in dark mode opens a table with green, red, amber and slate rows
- **THEN** every tint is a dark variant of its hue, and the text on it reads as on any other row

#### Scenario: A sideways-scrolled table

- **WHEN** a teacher scrolls the gradebook sheet sideways
- **THEN** the student's name, proposal and grade, which stay in place, show the row's tint like the cells that scroll
