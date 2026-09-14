# Search: blocks that decide who may read them

Every word in capitals below occurs in this file and in no other, so a check can
ask for one of them and know exactly which passage would have to have been read
for an answer to come back.

This paragraph is visible to every session and names OFFENERBEGRIFF.

## A block only teachers may see
The sentence introducing the block stays visible either way, so a match is the
block and nothing else:
@@@ teacher
>Only teachers read LEHRERGEHEIMNIS.
@@@

## A block addressed to one person by name
Erika Musterfrau is nobody in this realm, so this block is addressed to a person
neither demo session is:
@@@ erika musterfrau
>Only Erika reads ERIKAGEHEIMNIS.
@@@

## The seam a removed block leaves behind
Removing the block below puts the end of the line above it directly against the
start of the text after it. The joined document then reads the marker at the end
of that line, a line break, and the marker the next line starts with - a sequence
no one wrote, and one that must never be reported as a match. Each of the two
markers occurs exactly once in this file, so a match on the pair can only have
come from the join.

Die linke Haelfte endet mit NAHTLINKS
@@@ teacher
>Only teachers read this block.
@@@NAHTRECHTS beginnt die rechte Haelfte.
