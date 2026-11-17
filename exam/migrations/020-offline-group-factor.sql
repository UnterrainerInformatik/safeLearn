-- The factor A:B of an offline test with two handouts (`offline-test`,
-- offline-test-group-factor design D1): a harder handout's group counts its
-- results times its factor, capped at the full result. At most one group is
-- raised, from 1 to 2; the other stays at 1. Only adds columns with defaults,
-- so every existing test counts 1:1 as before. Read only for an offline test
-- with handout B; an online test keeps 1:1 and nothing reads it.
ALTER TABLE test ADD COLUMN group_factor_a REAL NOT NULL DEFAULT 1 CHECK (group_factor_a BETWEEN 1 AND 2);
ALTER TABLE test ADD COLUMN group_factor_b REAL NOT NULL DEFAULT 1
  CHECK (group_factor_b BETWEEN 1 AND 2 AND (group_factor_a = 1 OR group_factor_b = 1));
