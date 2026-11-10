# Hot reload: the open file of a sync

A check modifies this file and `test-hot-reload-restricted.md` at the same
moment, on an instance that watches the corpus, while a client that declares
this file as open listens to the reload stream. That client must be told to
reload its page, and must be told nothing else: neither this file's path nor
the path of the restricted file modified beside it.

The check puts this file back the way it found it.
