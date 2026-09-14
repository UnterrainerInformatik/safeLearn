# Search: a file that is restricted after the last scan

A check adds a whole-file directive to this file while the application is
running and no scan follows, then searches for the word below. The index still
records this file as one every session may see; the answer must come from the
file as it now stands on disk, so the word must not come back.

The word is STALEOFFEN, and it appears in no other corpus file. The check puts
this file back the way it found it.
