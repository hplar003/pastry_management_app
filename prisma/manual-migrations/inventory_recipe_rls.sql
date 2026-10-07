-- Security plan control C2: Postgres RLS for the inventory/recipe tables
-- (Supplier, Ingredient, StockMovement, Recipe, RecipeIngredient).
--
-- STAGED, NOT YET A PRISMA MIGRATION. This file is not picked up by
-- `prisma migrate dev` on its own. To apply it:
--   1. Run `npx prisma migrate dev --create-only --name inventory_recipe_rls`.
--      This diffs the schema against the database and creates an EMPTY
--      migration folder at prisma/migrations/<timestamp>_inventory_recipe_rls/
--      containing the CREATE TABLE statements for the 5 new models. This is
--      the one step in this whole task that touches the database (only to
--      read current schema state for the diff) and must be run by a human,
--      not this agent.
--   2. Open the generated migration.sql and APPEND the contents of this file
--      (everything below this header block) after the CREATE TABLE
--      statements Prisma generated, so tables exist before RLS references
--      them.
--   3. Run `npx prisma migrate dev` to apply the completed migration against
--      the real database (as the owner role, via DATABASE_URL_UNPOOLED).
--   4. Sanity-check with psql (owner role):
--        SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--          WHERE relname IN
--            ('Supplier','Ingredient','StockMovement','Recipe','RecipeIngredient');
--      -- every row should show (t, t).
--        SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--          WHERE table_name IN
--            ('Supplier','Ingredient','StockMovement','Recipe','RecipeIngredient')
--          AND grantee = 'app_user'
--          ORDER BY table_name, privilege_type;
--      -- Supplier: INSERT, SELECT, UPDATE only (no DELETE)
--      -- Ingredient: INSERT, SELECT, UPDATE only (no DELETE)
--      -- StockMovement: INSERT, SELECT only (no UPDATE, no DELETE)
--      -- Recipe: INSERT, SELECT, UPDATE only (no DELETE)
--      -- RecipeIngredient: INSERT, SELECT, UPDATE, DELETE (all four — see note below)
--
-- Prerequisite: app_user already exists with the attributes/membership
-- guaranteed by prisma/migrations/20260930005000_app_user_rls/migration.sql's
-- guard (that migration must already be applied). Because that earlier
-- migration already ran `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
-- SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user`, every table Prisma
-- creates in step 1/3 above (run as the owner role) automatically receives
-- those four DML grants the moment it's created — no GRANT statements are
-- needed below, only the REVOKEs that narrow specific tables.

-- Supplier: soft-delete only (deletedAt), never hard-deleted by the app.
REVOKE DELETE ON TABLE "Supplier" FROM app_user;

-- Ingredient: soft-delete only. StockMovement rows reference ingredientId as
-- permanent history, so the app must never hard-delete an ingredient out from
-- under that ledger.
REVOKE DELETE ON TABLE "Ingredient" FROM app_user;

-- StockMovement: append-only ledger, same treatment as AuditLog (G1/G2) — no
-- UPDATE, no DELETE. A correction is a new, opposite-signed movement row, not
-- an edit of history.
REVOKE UPDATE, DELETE ON TABLE "StockMovement" FROM app_user;

-- Recipe: soft-delete only (deletedAt).
REVOKE DELETE ON TABLE "Recipe" FROM app_user;

-- RecipeIngredient deliberately KEEPS its normal DELETE grant — do NOT revoke
-- it to "match" the other four tables above. A RecipeIngredient row is
-- current-state ("what this recipe currently calls for"), not a ledger entry,
-- and a recipe update legitimately needs to delete-and-reinsert its line
-- items. This asymmetry with Supplier/Ingredient/StockMovement/Recipe is
-- intentional.

-- Tenant isolation (security plan C1/C2). current_setting(..., true) returns
-- NULL when app.org_id is unset, so a query outside forTenant(ctx) (or
-- withTenantTx) sees zero rows and cannot insert.

ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Supplier"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ingredient" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Ingredient"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "StockMovement"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "Recipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Recipe" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Recipe"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "RecipeIngredient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecipeIngredient" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "RecipeIngredient"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
