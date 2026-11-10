@@@ teacher
# Hot reload: the restricted file of a sync

A check modifies this file and `test-hot-reload-open.md` at the same moment,
on an instance that watches the corpus. A client that declares only the open
file must not learn this file's path from the reload stream, and a client that
declares both paths strung together must not be told anything.

The check puts this file back the way it found it.
