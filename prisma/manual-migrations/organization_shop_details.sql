-- Organization Settings plan, Task 1: shop-details columns on the Better
-- Auth `organization` table (address, phone, description). This table is
-- the tenant root (no organizationId column, not in TENANT_MODELS) — no RLS
-- statements are needed here, just plain nullable columns.
--
-- STAGED, NOT YET A PRISMA MIGRATION. This file is not picked up by
-- `prisma migrate dev` on its own. To apply it:
--   1. Run `npx prisma migrate dev --create-only --name organization_shop_details`.
--      This diffs the schema against the database and creates an EMPTY
--      migration folder at prisma/migrations/<timestamp>_organization_shop_details/
--      containing the generated migration.sql. This is the one step in this
--      whole task that touches the database (only to read current schema
--      state for the diff) and must be run by a human, not this agent.
--   2. Open the generated migration.sql and compare it against the ALTER
--      TABLE statements below. Prisma should generate exactly this (the
--      three `ADD COLUMN` statements) on its own since the schema change is
--      a plain addition of nullable fields; if it does, no merge is needed.
--      If the generated SQL differs (e.g. column ordering, quoting), replace
--      it with the statements below so the migration matches this reviewed
--      SQL.
--   3. Run `npx prisma migrate dev` to apply the completed migration against
--      the real database (as the owner role, via DATABASE_URL_UNPOOLED).
--   4. Sanity-check with psql (owner role):
--        SELECT column_name, is_nullable, data_type FROM information_schema.columns
--          WHERE table_name = 'organization'
--          AND column_name IN ('address', 'phone', 'description')
--          ORDER BY column_name;
--      -- all three rows should show is_nullable = 'YES', data_type = 'text'.

ALTER TABLE "organization" ADD COLUMN "address" TEXT;
ALTER TABLE "organization" ADD COLUMN "phone" TEXT;
ALTER TABLE "organization" ADD COLUMN "description" TEXT;
