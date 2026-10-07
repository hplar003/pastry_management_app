/**
 * Integration tests for security plan controls C1 (forTenant) and C2 (RLS),
 * against a REAL Neon branch (see vitest.integration.config.mts). Run with
 * `npm run test:integration`.
 *
 * db.test.ts already proves, with a fake adapter, WHAT SQL forTenant emits.
 * These tests prove the result on a real Postgres: that the app role really is
 * subject to RLS, that set_config really lands on the query's connection
 * through Neon's pooler, and that rows really do not cross tenants.
 *
 * Two clients:
 * - `db` / `forTenant` : the app's own client, DATABASE_URL = `app_user`
 *   (NOBYPASSRLS, no UPDATE/DELETE on AuditLog).
 * - `owner`            : DATABASE_URL_UNPOOLED (the owner role, BYPASSRLS),
 *   used ONLY for ground truth and cleanup, never for the thing under test.
 *
 * `forTenant` without an organizationId throwing is covered by db.test.ts
 * ("throws when ctx has no organizationId"); it needs no database.
 */
import { randomBytes } from "node:crypto";

import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { db, forTenant } from "@/server/db";

/** Every AuditLog row these tests create has an organizationId with this prefix. */
const PREFIX = "itest-tenant-";
const runId = randomBytes(6).toString("hex");
const ORG_A = `${PREFIX}${runId}-a`;
const ORG_B = `${PREFIX}${runId}-b`;
const ctxA = { organizationId: ORG_A, branchId: null, userId: "itest-user-a" };
const ctxB = { organizationId: ORG_B, branchId: null, userId: "itest-user-b" };

const owner = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
});

// forTenant's types still require organizationId; it overwrites whatever is passed.
const row = (ctx: typeof ctxA, entityId: string) => ({
  organizationId: ctx.organizationId,
  actorId: ctx.userId,
  action: "itest.create",
  entity: "Integration",
  entityId,
});

let rowA: { id: string };
let rowB: { id: string };

async function deleteTestRows() {
  await owner.auditLog.deleteMany({ where: { organizationId: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  // Leftovers from an aborted earlier run.
  await deleteTestRows();

  // Seeded THROUGH forTenant as app_user: if set_config did not reach the
  // insert's connection, RLS's WITH CHECK would reject these inserts.
  rowA = await forTenant(ctxA).auditLog.create({ data: row(ctxA, "a"), select: { id: true } });
  rowB = await forTenant(ctxB).auditLog.create({ data: row(ctxB, "b"), select: { id: true } });
});

afterAll(async () => {
  await deleteTestRows();
  expect(await owner.auditLog.count({ where: { organizationId: { startsWith: PREFIX } } })).toBe(0);
  await owner.$disconnect();
  await db.$disconnect();
});

describe("test database sanity", () => {
  it("app client connects as app_user, which is subject to RLS on AuditLog", async () => {
    const [who] = await db.$queryRaw<{ user: string; bypass: boolean }[]>`
      select current_user::text as "user",
             (select rolbypassrls from pg_roles where rolname = current_user) as bypass`;
    expect(who).toEqual({ user: "app_user", bypass: false });

    const [rls] = await owner.$queryRaw<{ enabled: boolean; forced: boolean }[]>`
      select relrowsecurity as enabled, relforcerowsecurity as forced
      from pg_class where oid = '"AuditLog"'::regclass`;
    expect(rls).toEqual({ enabled: true, forced: true });
  });

  it("both seeded rows really exist (owner view, bypassing RLS)", async () => {
    const rows = await owner.auditLog.findMany({
      where: { id: { in: [rowA.id, rowB.id] } },
      select: { id: true, organizationId: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: rowA.id, organizationId: ORG_A },
        { id: rowB.id, organizationId: ORG_B },
      ]),
    );
  });
});

describe("forTenant (C1) on a real database", () => {
  it("findMany returns only the caller's organization's rows", async () => {
    const rows = await forTenant(ctxA).auditLog.findMany({
      where: { organizationId: { startsWith: PREFIX } },
      select: { id: true, organizationId: true },
    });
    expect(rows.map((r) => r.id)).toContain(rowA.id);
    expect(rows.map((r) => r.id)).not.toContain(rowB.id);
    expect(rows.every((r) => r.organizationId === ORG_A)).toBe(true);
  });

  it("cannot reach org B's row by id, or by naming org B in the where clause", async () => {
    const tenantA = forTenant(ctxA);
    expect(await tenantA.auditLog.findUnique({ where: { id: rowB.id } })).toBeNull();
    expect(await tenantA.auditLog.findFirst({ where: { id: rowB.id } })).toBeNull();
    // forTenant OVERRIDES a caller-supplied organizationId (it does not AND
    // it), so asking for org B yields org A's rows, never org B's.
    const asked = await tenantA.auditLog.findMany({ where: { organizationId: ORG_B }, select: { id: true, organizationId: true } });
    expect(asked.map((r) => r.id)).not.toContain(rowB.id);
    expect(asked.every((r) => r.organizationId === ORG_A)).toBe(true);
    expect(await tenantA.auditLog.count({ where: { id: rowB.id } })).toBe(0);
  });

  it("cannot update or delete org B's row, and org B's row is untouched", async () => {
    const tenantA = forTenant(ctxA);
    // On AuditLog the FIRST layer that stops this is G1: app_user has no
    // UPDATE/DELETE privilege on the table at all, hence "permission denied".
    // (forTenant's where-injection for updates/deletes is proven by
    // db.test.ts; it gets real-DB coverage once a mutable tenant table exists.)
    await expect(
      tenantA.auditLog.update({ where: { id: rowB.id }, data: { action: "tampered" } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(tenantA.auditLog.updateMany({ where: { id: rowB.id }, data: { action: "tampered" } })).rejects.toThrow(/permission denied/i);
    await expect(tenantA.auditLog.delete({ where: { id: rowB.id } })).rejects.toThrow(/permission denied/i);
    await expect(tenantA.auditLog.deleteMany({ where: { id: rowB.id } })).rejects.toThrow(/permission denied/i);

    const b = await owner.auditLog.findUnique({ where: { id: rowB.id } });
    expect(b).toMatchObject({ organizationId: ORG_B, action: "itest.create" });
  });

  it("a create that names another organization is written to the caller's organization", async () => {
    const created = await forTenant(ctxA).auditLog.create({
      data: { ...row(ctxA, "spoof"), organizationId: ORG_B },
      select: { id: true },
    });
    const stored = await owner.auditLog.findUnique({ where: { id: created.id }, select: { organizationId: true } });
    expect(stored).toEqual({ organizationId: ORG_A });
  });

  it("each tenant sees its own row", async () => {
    const seenByB = await forTenant(ctxB).auditLog.findMany({
      where: { id: { in: [rowA.id, rowB.id] } },
      select: { id: true },
    });
    expect(seenByB).toEqual([{ id: rowB.id }]);
  });
});

describe("Row-Level Security (C2) on a real database", () => {
  it("app_user with no app.org_id set sees zero AuditLog rows", async () => {
    const [{ n }] = await db.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from "AuditLog" where id in (${rowA.id}, ${rowB.id})`;
    expect(n).toBe(0);
    // And not just these two: the whole table is invisible.
    const [{ all }] = await db.$queryRaw<{ all: number }[]>`select count(*)::int as "all" from "AuditLog"`;
    expect(all).toBe(0);
  });

  it("app.org_id does not leak onto the pooled connection after a forTenant query", async () => {
    // set_config(..., true) is transaction-local. Interleave tenant queries
    // with raw ones: a leaked setting would make a raw count non-zero.
    for (let i = 0; i < 3; i++) {
      expect(await forTenant(ctxA).auditLog.count({ where: { id: rowA.id } })).toBe(1);
      const [{ n }] = await db.$queryRaw<{ n: number }[]>`
        select count(*)::int as n from "AuditLog" where id = ${rowA.id}`;
      expect(n).toBe(0);
      const [{ setting }] = await db.$queryRaw<{ setting: string | null }[]>`
        select nullif(current_setting('app.org_id', true), '') as setting`;
      expect(setting).toBeNull();
    }
  });

  it("with app.org_id set, the policy shows exactly that organization's rows", async () => {
    const [, rows] = await db.$transaction([
      db.$executeRaw`select set_config('app.org_id', ${ORG_A}, true)`,
      db.$queryRaw<{ id: string }[]>`select id from "AuditLog" where id in (${rowA.id}, ${rowB.id})`,
    ]);
    expect(rows).toEqual([{ id: rowA.id }]);
  });

  it("rejects an insert with no app.org_id set (WITH CHECK)", async () => {
    await expect(
      db.$executeRaw`
        insert into "AuditLog" (id, "organizationId", "actorId", action, entity, "entityId")
        values (${`itest-${runId}-noorg`}, ${ORG_A}, 'x', 'itest.raw', 'Integration', 'raw')`,
    ).rejects.toThrow(/row-level security/i);
  });

  it("rejects a cross-tenant insert even with app.org_id set (WITH CHECK backstop)", async () => {
    // Bypasses forTenant's data override on purpose: the database itself must
    // refuse a row for org B while the session is scoped to org A.
    await expect(
      db.$transaction([
        db.$executeRaw`select set_config('app.org_id', ${ORG_A}, true)`,
        db.$executeRaw`
          insert into "AuditLog" (id, "organizationId", "actorId", action, entity, "entityId")
          values (${`itest-${runId}-cross`}, ${ORG_B}, 'x', 'itest.raw', 'Integration', 'raw')`,
      ]),
    ).rejects.toThrow(/row-level security/i);
    expect(await owner.auditLog.count({ where: { id: `itest-${runId}-cross` } })).toBe(0);
  });
});
