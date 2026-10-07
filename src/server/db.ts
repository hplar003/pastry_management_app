import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { env } from "@/env";

/**
 * Raw Prisma client singleton connected to Neon via the pooled DATABASE_URL.
 * This client is used by the Better Auth adapter and seed scripts.
 *
 * In development, the instance is cached on globalThis to prevent hot-reload
 * from creating multiple PrismaClient instances (which is wasteful and can
 * cause connection pool issues). In production, a single instance is created
 * and reused for the lifetime of the process.
 */

const globalForPrisma = globalThis as unknown as { db?: PrismaClient };

export const db =
  globalForPrisma.db ??
  new PrismaClient({
    adapter: new PrismaNeon({ connectionString: env.DATABASE_URL }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = db;
}

/** Who is acting, in which tenant. Always built from the session, never from the request. */
export type TenantCtx = { organizationId: string; branchId: string | null; userId: string };

/**
 * Models with an `organizationId` column and an RLS policy (security plan C1/C2).
 * Add a model here in the same change that adds its RLS policy.
 */
const TENANT_MODELS: ReadonlySet<string> = new Set([
  "AuditLog",
  "Supplier",
  "Ingredient",
  "StockMovement",
  "Recipe",
  "RecipeIngredient",
]);

/** Operations whose tenant scoping goes into `args.data` rather than `args.where`. */
const CREATE_OPERATIONS: ReadonlySet<string> = new Set(["create", "createMany", "createManyAndReturn"]);

/** Operations scoped by `args.where` that also write `args.data`. */
const UPDATE_OPERATIONS: ReadonlySet<string> = new Set(["update", "updateMany", "updateManyAndReturn"]);

type Args = Record<string, unknown>;

function withOrganizationId(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) return data.map((row: Args) => ({ ...row, organizationId }));
  return { ...(data as Args), organizationId };
}

/**
 * Returns `db` scoped to one organization (security plan C1 + C2).
 *
 * For every operation on a tenant model it:
 * 1. forces `organizationId = ctx.organizationId` into `where` (and into `data`
 *    for creates and updates, and into both `create` and `update` for upserts),
 *    overriding any caller-supplied value, so a write can never re-parent a row
 *    to another organization;
 * 2. runs the query in a batch transaction whose first statement is
 *    `set_config('app.org_id', <org>, true)`, so the RLS policy sees the tenant.
 *    `true` makes the setting transaction-local, so it never leaks to the next
 *    user of a pooled connection.
 *
 * Why step 2 is on the same connection: `query(args)` returns a PrismaPromise.
 * Passing it into `db.$transaction([...])` calls its `requestTransaction`, and
 * Prisma's query-extension runner explicitly re-binds the request to that
 * batch transaction ("allow query extensions to re-wrap in transactions",
 * runtime/core/extensions/applyQueryExtensions.ts). The client engine then
 * runs the batch sequentially, in index order, inside one adapter transaction
 * (one Neon Pool connection). This is Prisma's documented RLS-extension pattern.
 *
 * Known limitation: a tenant operation issued inside an interactive
 * `$transaction(async (tx) => ...)` is re-wrapped into its own batch
 * transaction, so it is NOT atomic with the other statements of that
 * interactive transaction.
 *
 * Non-tenant models pass through untouched.
 */
export function forTenant(ctx: TenantCtx) {
  const { organizationId } = ctx;
  if (!organizationId) {
    throw new Error("forTenant() requires ctx.organizationId");
  }

  return db.$extends({
    name: "forTenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }

          const scoped: Args = { ...(args as Args) };
          if (CREATE_OPERATIONS.has(operation)) {
            scoped.data = withOrganizationId(scoped.data, organizationId);
          } else {
            scoped.where = { ...(scoped.where as Args | undefined), organizationId };
            if (UPDATE_OPERATIONS.has(operation)) {
              scoped.data = withOrganizationId(scoped.data, organizationId);
            } else if (operation === "upsert") {
              scoped.create = withOrganizationId(scoped.create, organizationId);
              scoped.update = withOrganizationId(scoped.update, organizationId);
            }
          }

          const [, result] = await db.$transaction([
            db.$executeRaw`select set_config('app.org_id', ${organizationId}, true)`,
            query(scoped as typeof args),
          ]);
          return result;
        },
      },
    },
  });
}

/**
 * Runs `fn` inside one real interactive Postgres transaction (one connection),
 * with `set_config('app.org_id', <org>, true)` as its first statement, so RLS
 * sees the tenant for every statement that follows — and all of them commit
 * or roll back together. This is for the two cases `forTenant` structurally
 * cannot cover (see its "Known limitation" doc comment): writing a domain row
 * plus an `AuditLog` row together, or writing two linked domain rows (e.g. a
 * parent + its line items) together.
 *
 * **Unlike `forTenant(ctx)`, this does NOT auto-inject `organizationId` into
 * anything.** The `tx` passed to `fn` is the raw, non-extended Prisma
 * transaction client — not `db.forTenant(ctx)`, not `db.$extends(...)`. Every
 * write `fn` issues must set `organizationId` (and `branchId`, where that
 * table has one) explicitly on each row. Postgres RLS is still the real
 * backstop: a write that gets this wrong, or a caller that tries to target
 * another org, fails the table's `WITH CHECK` policy and the *entire*
 * transaction rolls back — but that is a safety net, not a substitute for
 * getting the scoping right in `fn`.
 *
 * Use `db.forTenant(ctx)` for an ordinary single-statement read or write.
 * Use `withTenantTx` only when a write genuinely spans multiple rows/tables
 * that must commit or roll back together.
 */
export async function withTenantTx<T>(
  ctx: TenantCtx,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!ctx.organizationId) {
    throw new Error("withTenantTx() requires ctx.organizationId");
  }
  const { organizationId } = ctx;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}
