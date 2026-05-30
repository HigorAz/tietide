-- AlterTable
-- Adds a monotonic per-user token version. Embedded in every issued JWT and
-- compared on each request, so bumping it (logout / forced password or role
-- change) revokes all outstanding tokens. Backfills existing rows to 0, which
-- matches legacy tokens that carry no tokenVersion claim.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
