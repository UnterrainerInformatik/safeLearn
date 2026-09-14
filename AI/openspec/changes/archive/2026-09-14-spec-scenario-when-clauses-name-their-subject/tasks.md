## 1. The spec delta

- [x] 1.1 Cut the three affected requirements out of the live spec whole, rather than retyping them,
      and replace only the eight `WHEN` lines — each replacement asserted to match exactly once, so a
      clause that had already been reworded elsewhere would fail rather than pass silently
- [x] 1.2 Confirm no `generated from with`, `generated for with`, or clause ending on `is generated
      from` is left in the delta

## 2. Verification

- [x] 2.1 `openspec validate` passes on the change
- [x] 2.2 The requirement text either side of the eight lines is byte for byte what the live spec
      holds — asserted by construction, since the blocks are copied rather than written
- [x] 2.3 No code and no checks are touched, so the suites are the ones that ran green for the change
      this one follows up
