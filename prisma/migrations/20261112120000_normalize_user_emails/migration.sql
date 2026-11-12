-- Email identity is compared case-insensitively by the app (registration,
-- password login, OAuth account matching). Normalize existing rows so a legacy
-- "Alice@Example.com" still resolves.
--
-- Rows whose normalized form would collide with another account are left
-- untouched: updating them would violate the unique index and block deploys.
UPDATE "User" u
SET "email" = lower(btrim(u."email"))
WHERE u."email" <> lower(btrim(u."email"))
  AND NOT EXISTS (
    SELECT 1
    FROM "User" other
    WHERE other."id" <> u."id"
      AND lower(btrim(other."email")) = lower(btrim(u."email"))
  );
