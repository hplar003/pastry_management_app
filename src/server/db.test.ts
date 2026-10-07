// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A fake driver adapter standing in for @prisma/adapter-neon. It records every
 * SQL statement together with the connection it ran on ("pool", or "tx1",
 * "tx2", ... for each transaction's dedicated connection), so the tests can
 * prove that set_config and the tenant query share one transaction without a
 * live database. Every query returns zero rows unless a test sets `fake.respond`.
 */
const log = vi.hoisted(() => [] as { conn: string; sql: string; args: unknown[] }[]);
/** Optional per-test override: return a result set for a SQL string, or undefined for zero rows. */
const fake = vi.hoisted(() => ({ respond: undefined as undefined | ((sql: string) => unknown) }));

vi.mock("@prisma/adapter-neon", () => {
  type Query = { sql: string; args: unknown[] };
  const empty = { columnTypes: [], columnNames: [], rows: [] };
  const queryable = (conn: string) => ({
    provider: "postgres" as const,
    adapterName: "fake-neon",
    async queryRaw(q: Query) {
      log.push({ conn, sql: q.sql, args: q.args });
      return fake.respond?.(q.sql) ?? empty;
    },
    async executeRaw(q: Query) {
      log.push({ conn, sql: q.sql, args: q.args });
      return 0;
    },
  });
  let txCount = 0;

  class PrismaNeon {
    provider = "postgres" as const;
    adapterName = "fake-neon";
    async connect() {
      return {
        ...queryable("pool"),
        executeScript: async () => {},
        async startTransaction() {
          const conn = `tx${++txCount}`;
          return {
            ...queryable(conn),
            options: { usePhantomQuery: false },
            commit: async () => {},
            rollback: async () => {},
          };
        },
        dispose: async () => {},
      };
    }
  }
  return { PrismaNeon };
});

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/db");
  vi.stubEnv("DATABASE_URL_UNPOOLED", "postgresql://user:pass@localhost/db");
  vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
});

const ctx = { organizationId: "org_1", branchId: null, userId: "u1" };

/** The exact statement forTenant must issue first. `true` = transaction-local. */
const SET_CONFIG_SQL = "select set_config('app.org_id', $1, true)";

/**
 * Asserts the log is exactly: set_config, the given statements, then `end`,
 * all on one transaction connection. Returns the tenant statements.
 */
function expectTenantTx(statementCount: number, end: "COMMIT" | "ROLLBACK" = "COMMIT") {
  expect(log).toHaveLength(statementCount + 2);
  const conn = log[0].conn;
  expect(conn).toMatch(/^tx\d+$/);
  expect(log[0]).toEqual({ conn, sql: SET_CONFIG_SQL, args: ["org_1"] });
  expect(log.map((e) => e.conn)).toEqual(log.map(() => conn));
  expect(log.at(-1)).toEqual({ conn, sql: end, args: [] });
  return log.slice(1, -1);
}

describe("forTenant", () => {
  it("throws when ctx has no organizationId", async () => {
    const { forTenant } = await import("./db");
    expect(() => forTenant({ ...ctx, organizationId: "" })).toThrow(/organizationId/);
  });

  it("runs set_config and the scoped query on the same transaction connection", async () => {
    const { forTenant } = await import("./db");
    log.length = 0;

    // A caller-supplied organizationId must be overridden, not merged.
    await forTenant(ctx).auditLog.findMany({ where: { organizationId: "org_evil", action: "x" } });

    // Everything ran on the transaction connection (the real adapter issues
    // BEGIN inside startTransaction; the engine sends COMMIT), nothing on the pool.
    const [select] = expectTenantTx(1);
    expect(select.sql).toMatch(/^SELECT .* FROM "public"\."AuditLog" WHERE /);
    expect(select.sql).toContain(
      'WHERE ("public"."AuditLog"."organizationId" = $1 AND "public"."AuditLog"."action" = $2) OFFSET $3',
    );
    expect(select.args).toEqual(["org_1", "x", "0"]);
  });

  it("injects organizationId into createMany data", async () => {
    const { forTenant } = await import("./db");
    log.length = 0;

    // The generated types still require organizationId in `data`; the cast
    // lets this test prove the extension supplies it.
    await forTenant(ctx).auditLog.createMany({
      data: [
        { actorId: "u1", action: "a", entity: "e", entityId: "1" },
        { actorId: "u1", action: "b", entity: "e", entityId: "2" },
      ] as never,
    });

    const [insert] = expectTenantTx(1);
    expect(insert.sql).toMatch(/^INSERT INTO "public"\."AuditLog"/);
    expect(insert.args.filter((a) => a === "org_1")).toHaveLength(2);
  });

  it("overrides a caller-supplied organizationId in create data", async () => {
    const { forTenant } = await import("./db");
    log.length = 0;

    await forTenant(ctx).auditLog.create({
      data: { actorId: "u1", action: "a", entity: "e", entityId: "1", organizationId: "org_evil" },
    });

    const [insert] = expectTenantTx(1);
    expect(insert.sql).toMatch(/^INSERT INTO "public"\."AuditLog" \("id","organizationId",/);
    expect(insert.args[1]).toBe("org_1");
    expect(insert.args).not.toContain("org_evil");
  });

  it("forces organizationId in updateMany data and where", async () => {
    const { forTenant } = await import("./db");
    log.length = 0;

    await forTenant(ctx).auditLog.updateMany({
      where: { action: "x" },
      data: { organizationId: "org_evil", action: "y" },
    });

    const [update] = expectTenantTx(1);
    expect(update.sql).toBe(
      'UPDATE "public"."AuditLog" SET "organizationId" = $1, "action" = $2 ' +
        'WHERE ("public"."AuditLog"."action" = $3 AND "public"."AuditLog"."organizationId" = $4)',
    );
    expect(update.args).toEqual(["org_1", "y", "x", "org_1"]);
  });

  it("forces organizationId in update data and where", async () => {
    const { forTenant } = await import("./db");
    log.length = 0;

    // The fake adapter returns no rows, so Prisma reports the record as not
    // found; the statement it sent is what this test checks.
    await expect(
      forTenant(ctx).auditLog.update({ where: { id: "id1" }, data: { organizationId: "org_evil" } }),
    ).rejects.toThrow(/No record was found for an update/);

    const [update] = expectTenantTx(1, "ROLLBACK");
    expect(update.sql).toMatch(
      /^UPDATE "public"\."AuditLog" SET "organizationId" = \$1 WHERE \("public"\."AuditLog"\."id" = \$2 AND "public"\."AuditLog"\."organizationId" = \$3\) RETURNING /,
    );
    expect(update.args).toEqual(["org_1", "id1", "org_1"]);
  });

  describe("upsert", () => {
    const upsertArgs = {
      where: { id: "id1" },
      create: { actorId: "u1", action: "a", entity: "e", entityId: "1", organizationId: "org_evil" },
      update: { organizationId: "org_evil", action: "z" },
    };
    const lookup = {
      sql:
        'SELECT "public"."AuditLog"."id" FROM "public"."AuditLog" ' +
        'WHERE ("public"."AuditLog"."id" = $1 AND "public"."AuditLog"."organizationId" = $2) OFFSET $3',
      args: ["id1", "org_1", "0"],
    };

    afterEach(() => {
      fake.respond = undefined;
    });

    it("scopes the lookup and forces organizationId in the create branch", async () => {
      const { forTenant } = await import("./db");
      log.length = 0;

      // No existing row, so Prisma inserts. The fake's INSERT ... RETURNING
      // yields no rows, which Prisma reports as not found.
      await expect(forTenant(ctx).auditLog.upsert(upsertArgs)).rejects.toThrow(/No record was found/);

      const [select, insert] = expectTenantTx(2, "ROLLBACK");
      expect(select).toMatchObject(lookup);
      expect(insert.sql).toMatch(/^INSERT INTO "public"\."AuditLog" \("id","organizationId",/);
      expect(insert.args[1]).toBe("org_1");
      expect(insert.args).not.toContain("org_evil");
    });

    it("scopes the lookup and forces organizationId in the update branch", async () => {
      const { forTenant } = await import("./db");
      log.length = 0;
      // The tenant-scoped lookup finds a row, so Prisma takes the update branch.
      fake.respond = (sql) =>
        sql === lookup.sql ? { columnNames: ["id"], columnTypes: [7 /* Text */], rows: [["id1"]] } : undefined;

      await expect(forTenant(ctx).auditLog.upsert(upsertArgs)).rejects.toThrow(/No record was found/);

      const [select, update] = expectTenantTx(2, "ROLLBACK");
      expect(select).toMatchObject(lookup);
      expect(update.sql).toMatch(
        /^UPDATE "public"\."AuditLog" SET "organizationId" = \$1, "action" = \$2 WHERE .*"public"\."AuditLog"\."organizationId" = \$5\)\) RETURNING /,
      );
      expect(update.args).toEqual(["org_1", "z", "id1", "id1", "org_1"]);
    });
  });

  it("passes non-tenant models straight through: no set_config, no transaction", async () => {
    const { forTenant } = await import("./db");
    log.length = 0;

    await forTenant(ctx).user.findMany({ where: { email: "a@b.c" } });

    expect(log).toHaveLength(1);
    expect(log[0].conn).toBe("pool");
    expect(log[0].sql).toMatch(/^SELECT .* FROM "public"\."user" WHERE "public"\."user"\."email" = \$1 OFFSET \$2$/);
    expect(log[0].args).toEqual(["a@b.c", "0"]);
  });
});

describe("withTenantTx", () => {
  it("throws when ctx has no organizationId, before issuing any query", async () => {
    const { withTenantTx } = await import("./db");
    log.length = 0;

    await expect(withTenantTx({ ...ctx, organizationId: "" }, async () => "x")).rejects.toThrow(/organizationId/);

    expect(log).toHaveLength(0);
  });

  it("runs set_config as the first statement, then every statement fn issues, on the same connection", async () => {
    const { withTenantTx } = await import("./db");
    log.length = 0;

    const result = await withTenantTx(ctx, async (tx) => {
      await tx.$executeRaw`insert into "AuditLog" default values`;
      await tx.$executeRaw`insert into "StockMovement" default values`;
      return "ok";
    });

    expect(result).toBe("ok");
    const [first, second] = expectTenantTx(2);
    expect(log[0]).toEqual({ conn: log[0].conn, sql: SET_CONFIG_SQL, args: ["org_1"] });
    expect(first.sql).toBe('insert into "AuditLog" default values');
    expect(second.sql).toBe('insert into "StockMovement" default values');
  });

  it("passes the raw, non-extended transaction client to fn (no auto-injection)", async () => {
    const { withTenantTx } = await import("./db");
    log.length = 0;

    await withTenantTx(ctx, async (tx) => {
      // The raw client has no `forTenant` extension layered on: a plain model
      // call must NOT get organizationId injected the way forTenant does.
      await tx.auditLog.findMany({ where: { action: "x" } });
      return null;
    });

    const [select] = expectTenantTx(1);
    // Unlike forTenant, no organizationId is forced into the WHERE clause or
    // args: fn must scope it itself (the SELECT list still names the column).
    expect(select.sql).toBe('SELECT "public"."AuditLog"."id", "public"."AuditLog"."organizationId", ' +
      '"public"."AuditLog"."branchId", "public"."AuditLog"."actorId", "public"."AuditLog"."action", ' +
      '"public"."AuditLog"."entity", "public"."AuditLog"."entityId", "public"."AuditLog"."before", ' +
      '"public"."AuditLog"."after", "public"."AuditLog"."ip", "public"."AuditLog"."userAgent", ' +
      '"public"."AuditLog"."requestId", "public"."AuditLog"."createdAt" FROM "public"."AuditLog" ' +
      'WHERE "public"."AuditLog"."action" = $1 OFFSET $2');
    expect(select.args).toEqual(["x", "0"]);
  });

  it("rolls back the whole transaction if fn throws partway through", async () => {
    const { withTenantTx } = await import("./db");
    log.length = 0;

    await expect(
      withTenantTx(ctx, async (tx) => {
        await tx.$executeRaw`insert into "AuditLog" default values`;
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);

    // set_config + the one insert issued before the throw, then ROLLBACK —
    // all on the same connection. (Whether that insert's effect is actually
    // discarded is a property of the real adapter's rollback, not something
    // this fake can observe; that gets its real proof at the integration-test
    // level.)
    expectTenantTx(1, "ROLLBACK");
  });
});
