import "server-only";

import { APIError } from "better-auth/api";
import { auth } from "@/server/auth/auth";
import type { RequestCtx } from "@/server/http/with-auth";
import { forTenant } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import type { CreateOrganizationInput, UpdateOrganizationInput } from "@/features/organization/schemas";
import { Prisma } from "@/generated/prisma/client";

/**
 * The generated `AuditLog` create input minus `organizationId` — `ctx.db`
 * (`forTenant`, src/server/db.ts) injects that field at runtime into
 * `args.data` for every tenant-model write, overriding any caller-supplied
 * value, so it's never supplied here. Same pattern as
 * `SupplierCreateData` in `src/features/suppliers/server/repository.ts`.
 */
type AuditLogCreateData = Omit<Prisma.AuditLogUncheckedCreateInput, "organizationId">;

/**
 * The exact shape every route in `src/app/api/v1/organization/**` returns.
 * Better Auth's `getFullOrganization`/`updateOrganization` responses carry
 * far more (members, teams, invitations, Better Auth's own `metadata`,
 * `createdAt`, ...) — this picks only the "shop details" fields this
 * feature owns, the same DTO discipline every other feature's
 * repository.ts `select` applies.
 */
export type OrganizationDto = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
};

/**
 * `additionalFields` (address/phone/description) aren't in Better Auth's
 * own static response type, so they arrive as `unknown` on the returned
 * object — asserted here, once, at this one boundary, rather than letting
 * `unknown` leak into callers.
 */
type FullOrganization = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
};

function toDto(org: FullOrganization): OrganizationDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo: org.logo ?? null,
    address: org.address ?? null,
    phone: org.phone ?? null,
    description: org.description ?? null,
  };
}

/**
 * Every `auth.api.*` call needs real request `Headers` to resolve the
 * caller's session — `RequestCtx` (src/server/http/with-auth.ts) does NOT
 * carry them, only `userId`/`organizationId`/`branchId`/`requestId`/`db`.
 * Callers (route handlers) pass `req.headers` in explicitly; see
 * `updateOrganization` below and the route files in
 * `src/app/api/v1/organization/`. This is the template every later task in
 * the Organization Settings plan (Branches, Members, Roles, Sessions) also
 * follows.
 */
export async function getOrganization(ctx: RequestCtx, headers: Headers): Promise<OrganizationDto> {
  const org = await auth.api.getFullOrganization({
    headers,
    query: { organizationId: ctx.organizationId },
  });
  if (!org) throw new NotFoundError();
  return toDto(org as FullOrganization);
}

export async function updateOrganization(
  ctx: RequestCtx,
  headers: Headers,
  input: UpdateOrganizationInput,
): Promise<OrganizationDto> {
  const before = await getOrganization(ctx, headers);

  const updated = await auth.api.updateOrganization({
    headers,
    body: { organizationId: ctx.organizationId, data: input },
  });
  if (!updated) throw new AppError("ORGANIZATION_UPDATE_FAILED", 500);

  const after = toDto(updated as FullOrganization);

  // `Organization` itself isn't a tenant table (TENANT_MODELS in
  // src/server/db.ts) — it's owned by the Better Auth boundary, written
  // above via auth.api.updateOrganization, not through ctx.db. `AuditLog`
  // IS a tenant table, so this one write goes through ctx.db (forTenant),
  // which injects organizationId automatically. No withTenantTx: that
  // helper only matters when >=2 tenant-table writes must commit
  // atomically together, and the Better-Auth-boundary update can never be
  // atomic with a Postgres transaction anyway (accepted gap, security plan
  // decision #4) — so this is a plain, sequential write after the
  // Better Auth call has already succeeded.
  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "organization.update",
    entity: "Organization",
    entityId: ctx.organizationId,
    before,
    after,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    // `organizationId` is injected at runtime by `ctx.db` (forTenant), so
    // `auditData` is deliberately typed without it (`AuditLogCreateData`).
    // TS's `as` needs the `unknown` hop here (unlike Suppliers' inline
    // `(data satisfies X) as Y` on a named parameter type) because this is a
    // standalone object-literal-typed const missing a required property, not
    // "insufficient overlap" tolerance the `as` operator doesn't extend to —
    // confirmed by compiling both forms; the single-step cast fails tsc
    // (TS2352) for this specific literal-type shape, so keep the `unknown` hop.
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  return after;
}

function rethrowOrganizationApiError(err: unknown): never {
  if (err instanceof APIError) {
    const body = err.body as { code?: string; message?: string } | null | undefined;
    throw new AppError(body?.code ?? "ORGANIZATION_OPERATION_FAILED", err.statusCode ?? 400, body?.message);
  }
  throw err;
}

/** `name` -> a URL-safe, lower-cased slug; `createOrganizationForSession` appends a short suffix on collision. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base.slice(0, 80) : "org";
}

/**
 * Self-service org bootstrap for an authenticated, 2FA-enrolled user who
 * belongs to zero organizations yet — this app is invite-only
 * (`disableSignUp: true`) and `organizationOptions.allowUserToCreateOrganization`
 * is deliberately `false` (see `src/server/auth/auth.ts`), so nobody can spin
 * up extra organizations through the normal `auth.api.createOrganization`
 * path. The one gap that left: a brand-new seeded admin/owner account (see
 * `prisma/seed.ts`'s user+credential steps) had no UI way to get an
 * organization at all — only a human running `prisma/seed.ts`'s organization
 * step by hand. This gives that same one-time bootstrap a UI path, scoped to
 * "the caller has no organization yet" so it can never be used to spam
 * extra orgs for an existing member (this app's one-org-per-user model).
 *
 * Calls `auth.api.createOrganization` with no `headers` (only `body.userId`)
 * — the same "system action" shape `prisma/seed.ts` uses — which is the one
 * path Better Auth's own endpoint exempts from `allowUserToCreateOrganization`
 * (`node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs`:
 * `isSystemAction = !session && ctx.body.userId`). The caller's *own* session
 * is still required and checked by the route handler before this runs; this
 * function only skips sending `headers` to this one inner call so Better
 * Auth takes the system-action branch instead of the normal, disabled one.
 */
export async function createOrganizationForSession(
  headers: Headers,
  userId: string,
  requestId: string,
  input: CreateOrganizationInput,
): Promise<OrganizationDto> {
  const existing = await auth.api.listOrganizations({ headers });
  if (existing.length > 0) {
    throw new AppError("ALREADY_HAS_ORGANIZATION", 409);
  }

  const baseSlug = slugify(input.name);
  let organization: FullOrganization | null = null;
  for (let attempt = 0; attempt < 5 && !organization; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      organization = (await auth.api.createOrganization({
        body: { name: input.name, slug, userId },
      })) as FullOrganization | null;
    } catch (err) {
      const isSlugCollision =
        err instanceof APIError &&
        (err.body as { code?: string } | null | undefined)?.code === "ORGANIZATION_ALREADY_EXISTS";
      if (!isSlugCollision) rethrowOrganizationApiError(err);
      // Loop again with a new suffix.
    }
  }
  if (!organization) throw new AppError("ORGANIZATION_CREATE_FAILED", 500);

  try {
    await auth.api.setActiveOrganization({
      headers,
      body: { organizationId: organization.id },
    });
  } catch (err) {
    rethrowOrganizationApiError(err);
  }

  const after = toDto(organization);

  const auditData = {
    branchId: null,
    actorId: userId,
    action: "organization.create",
    entity: "Organization",
    entityId: organization.id,
    after,
    requestId,
  } satisfies AuditLogCreateData;

  await forTenant({ organizationId: organization.id, branchId: null, userId }).auditLog.create({
    // See the `unknown` hop note in `updateOrganization` above.
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  return after;
}
