import "server-only";

import { auth } from "@/server/auth/auth";
import { APIError } from "better-auth/api";
import type { RequestCtx } from "@/server/http/with-auth";
import { AppError } from "@/server/errors";
import type { CreateBranchInput, UpdateBranchInput } from "@/features/branches/schemas";
import { Prisma } from "@/generated/prisma/client";

/**
 * The generated `AuditLog` create input minus `organizationId` — `ctx.db`
 * (`forTenant`, src/server/db.ts) injects that field at runtime into
 * `args.data` for every tenant-model write, overriding any caller-supplied
 * value, so it's never supplied here. Same pattern as
 * `AuditLogCreateData` in `src/features/organization/server/service.ts`.
 */
type AuditLogCreateData = Omit<Prisma.AuditLogUncheckedCreateInput, "organizationId">;

/**
 * The exact shape every route in `src/app/api/v1/branches/**` returns.
 * Better Auth's team object also carries `organizationId` — dropped here
 * since every branch returned is already scoped to `ctx.organizationId`
 * and the client has no use for it (same DTO discipline as
 * `OrganizationDto` in `src/features/organization/server/service.ts`).
 */
export type BranchDto = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Better Auth's team object (`better-auth/dist/plugins/organization/routes/crud-team.mjs`). */
type Team = {
  id: string;
  name: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(team: Team): BranchDto {
  return {
    id: team.id,
    name: team.name,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

/**
 * Better Auth's own business-rule rejections for team mutations (last-team
 * deletion, deleting your own active team, the `maximumTeams` cap, ...)
 * throw `APIError` (`better-auth/api`), which `toErrorResponse`
 * (`src/server/errors.ts`) doesn't recognize — left uncaught, it would
 * surface as an opaque `500 {"error":"INTERNAL"}`, leaking nothing but also
 * telling the frontend nothing actionable. This re-throws it as this app's
 * own `AppError`, carrying the specific Better Auth error code
 * (`UNABLE_TO_REMOVE_LAST_TEAM`, `TEAM_NOT_FOUND`, ...) as `code` and the
 * real HTTP status Better Auth chose (`err.statusCode`) as `status`, so the
 * route's existing `toErrorResponse` path maps it to a clean 4xx with a code
 * `getApiErrorMessage` (or a future branches-specific case there) can read.
 */
function rethrowTeamApiError(err: unknown): never {
  if (err instanceof APIError) {
    const body = err.body as { code?: string; message?: string } | null | undefined;
    throw new AppError(body?.code ?? "TEAM_OPERATION_FAILED", err.statusCode ?? 400, body?.message);
  }
  throw err;
}

/**
 * Every `auth.api.*` call needs real request `Headers` to resolve the
 * caller's session — `RequestCtx` (src/server/http/with-auth.ts) does NOT
 * carry them. Callers (route handlers) pass `req.headers` in explicitly —
 * same template `src/features/organization/server/service.ts` established.
 */
export async function listBranches(ctx: RequestCtx, headers: Headers): Promise<BranchDto[]> {
  const teams = await auth.api.listOrganizationTeams({
    headers,
    query: { organizationId: ctx.organizationId },
  });
  return (teams as Team[]).map(toDto);
}

export async function createBranch(
  ctx: RequestCtx,
  headers: Headers,
  input: CreateBranchInput,
): Promise<BranchDto> {
  let created: Team | null;
  try {
    created = (await auth.api.createTeam({
      headers,
      body: { name: input.name, organizationId: ctx.organizationId },
    })) as Team | null;
  } catch (err) {
    rethrowTeamApiError(err);
  }
  if (!created) throw new AppError("BRANCH_CREATE_FAILED", 500);

  const after = toDto(created);

  // `Team` itself isn't a tenant table (TENANT_MODELS in src/server/db.ts)
  // — it's owned by the Better Auth boundary, written above via
  // auth.api.createTeam, not through ctx.db. `AuditLog` IS a tenant table,
  // so this one write goes through ctx.db (forTenant), which injects
  // organizationId automatically. No withTenantTx: that helper only matters
  // when >=2 tenant-table writes must commit atomically together, and the
  // Better-Auth-boundary call can never be atomic with a Postgres
  // transaction anyway (accepted gap, security plan decision #4) — so this
  // is a plain, sequential write after the Better Auth call has already
  // succeeded. Matches G1's explicit "branch create/delete" audit item.
  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "branch.create",
    entity: "Team",
    entityId: created.id,
    after,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    // See the `unknown` hop note in
    // `src/features/organization/server/service.ts` — required by `tsc`
    // for this literal-object-missing-`organizationId` shape.
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });

  return after;
}

export async function updateBranch(
  ctx: RequestCtx,
  headers: Headers,
  id: string,
  input: UpdateBranchInput,
): Promise<BranchDto> {
  let updated: Team | null;
  try {
    updated = (await auth.api.updateTeam({
      headers,
      body: { teamId: id, data: { name: input.name } },
    })) as Team | null;
  } catch (err) {
    rethrowTeamApiError(err);
  }
  if (!updated) throw new AppError("BRANCH_UPDATE_FAILED", 500);

  // No AuditLog entry — G1 only names branch create/delete as audited
  // actions, not rename; matches the brief's explicit instruction not to
  // invent extra auditing beyond what the plan specifies.
  return toDto(updated);
}

export async function deleteBranch(ctx: RequestCtx, headers: Headers, id: string): Promise<void> {
  // Best-effort pre-read for the audit `before` snapshot: `listBranches`
  // already exists and is cheap (a single `listOrganizationTeams` call), so
  // it's used here rather than skipping straight to `{ id }` — but if the
  // id doesn't match anything (already gone, or a stale client), this falls
  // back to recording just the id rather than failing the delete over a
  // snapshot that was only ever "nice to have".
  const before = (await listBranches(ctx, headers)).find((team) => team.id === id) ?? { id };

  try {
    await auth.api.removeTeam({
      headers,
      body: { teamId: id, organizationId: ctx.organizationId },
    });
  } catch (err) {
    rethrowTeamApiError(err);
  }

  const auditData = {
    branchId: ctx.branchId,
    actorId: ctx.userId,
    action: "branch.delete",
    entity: "Team",
    entityId: id,
    before,
    requestId: ctx.requestId,
  } satisfies AuditLogCreateData;

  await ctx.db.auditLog.create({
    data: auditData as unknown as Prisma.AuditLogUncheckedCreateInput,
  });
}
