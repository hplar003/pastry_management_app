-- Security plan control C2: least-privilege runtime role + Postgres RLS.
--
-- STAGED, NOT YET A PRISMA MIGRATION. Prisma applies prisma/migrations/* in
-- folder-name order, and the first migration (Task 3: Better Auth tables +
-- AuditLog) has not been generated yet. A folder created now would sort
-- before it and fail on a missing "AuditLog". Once `init` exists, move this
-- file into an empty migration created with:
--   npx prisma migrate dev --create-only --name app_user_rls
-- (see .superpowers/sdd/task-4-report.md for the exact steps).
--
-- Prerequisite: the `app_user` role exists on the branch, created via SQL
-- (NOT `neon roles create`, which grants neon_superuser membership; the guard
-- below aborts if that membership, or any other, is present).
-- Run as the owner role (DATABASE_URL_UNPOOLED), which Prisma CLI already uses.

-- Guard: refuse to run unless app_user
--   1. exists,
--   2. has none of the attributes SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB,
--      REPLICATION on the role itself, and
--   3. is a member of NO other role.
-- Check 3 is needed because Postgres never inherits role ATTRIBUTES through
-- group membership. A role in neon_superuser (what `neon roles create` does)
-- still shows rolbypassrls = false on itself, yet it can `SET ROLE
-- neon_superuser` to bypass RLS. It also inherits object privileges, e.g. via
-- pg_write_all_data, which would override the AuditLog REVOKE below.
-- pg_auth_members.member is the OID of the role that belongs to the group
-- (roleid is the group), so matching member to app_user's OID asks "does
-- app_user belong to anything?". This catches neon_superuser without
-- hardcoding its name. The reverse direction (the owner being a member OF
-- app_user, which PG16+ adds automatically for the creating role) is allowed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE EXCEPTION 'Role app_user does not exist. Create it first (task-4 report, step 2).';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_user'
      AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'Role app_user must be NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles r ON r.oid = m.member
    WHERE r.rolname = 'app_user'
  ) THEN
    RAISE EXCEPTION 'Role app_user must not be a member of any role (e.g. neon_superuser). Run REVOKE <group> FROM app_user as the owner.';
  END IF;
END
$$;

-- Table privileges: DML only, no ownership, no DDL.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;

-- Tables created by later migrations (run by this same owner role) get the
-- same DML grants automatically. Each new tenant table must still enable and
-- force RLS in its own migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- The runtime role must not touch Prisma's migration history. Guarded
-- because Prisma's shadow database (used to validate this migration file
-- during `migrate dev`) never creates _prisma_migrations -- only the real
-- target database does -- so a bare REVOKE by name fails there.
DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "_prisma_migrations" FROM app_user';
  END IF;
END
$$;

-- AuditLog is append-only for the app (control G1).
REVOKE UPDATE, DELETE ON TABLE "AuditLog" FROM app_user;

-- Tenant isolation. current_setting(..., true) returns NULL when app.org_id
-- is unset, so a query outside forTenant(ctx) sees zero rows and cannot insert.
-- Better Auth tables (user, session, account, organization, member, team, ...)
-- are deliberately NOT covered: they are reached only via the auth adapter.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("organizationId" = current_setting('app.org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.org_id', true));
