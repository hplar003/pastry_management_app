/**
 * Security plan Task 6 (B1 rationale): a cross-tenant access to a
 * single-resource route must look identical to a nonexistent id — 404, not
 * 403 — so the response never leaks whether the id exists at all in
 * another organization.
 *
 * Needs a REAL database (real orgs, members, sessions, RLS) via
 * `tests/helpers/seed-two-orgs.ts`, so this file is named
 * `*.integration.test.ts` and runs only under `npm run test:integration`
 * (vitest.integration.config.mts) — see that helper's and
 * `src/server/auth/grant-ceiling.integration.test.ts`'s doc comments.
 *
 * NOT YET RUNNABLE: this file (now covering the Organization Settings
 * plan's Branches/Members/Invitations/Roles routes too, as of Task 9) has
 * never been executed against a real database in this environment. It has
 * been reasoned through against the real route/service code and
 * cross-checked against `grant-ceiling.integration.test.ts`'s working
 * patterns, but it has NOT been executed. Do not trust a "passing" claim
 * about it until someone runs it against a real (non-production) Neon
 * branch via `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as suppliersGet, PATCH as suppliersPatch, DELETE as suppliersDelete } from "@/app/api/v1/suppliers/[id]/route";
import { GET as ingredientsGet, PATCH as ingredientsPatch, DELETE as ingredientsDelete } from "@/app/api/v1/ingredients/[id]/route";
import { GET as recipesGet, PATCH as recipesPatch, DELETE as recipesDelete } from "@/app/api/v1/recipes/[id]/route";
import { GET as inventoryGet } from "@/app/api/v1/inventory/route";
import { GET as movementsGet } from "@/app/api/v1/inventory/movements/route";
import { POST as adjustPost } from "@/app/api/v1/inventory/adjust/route";
import { POST as transferPost } from "@/app/api/v1/inventory/transfer/route";
import { PATCH as branchesPatch, DELETE as branchesDelete } from "@/app/api/v1/branches/[id]/route";
import { PATCH as membersPatch, DELETE as membersDelete } from "@/app/api/v1/members/[id]/route";
import { DELETE as invitationsDelete } from "@/app/api/v1/invitations/[id]/route";
import { GET as rolesGet, PATCH as rolesPatch, DELETE as rolesDelete } from "@/app/api/v1/roles/[name]/route";

import { callRoute, type RouteHandler } from "../helpers/call-route";
import {
  ORG_B_ONLY_ROLE,
  RESTRICTED_PERMISSION,
  setupTwoOrgs,
  teardownTwoOrgs,
  type TwoOrgsFixture,
} from "../helpers/seed-two-orgs";

let fixture: TwoOrgsFixture;

beforeAll(async () => {
  fixture = await setupTwoOrgs();
}, 120_000);

afterAll(async () => {
  await teardownTwoOrgs();
});

// ---------------------------------------------------------------------------
// table: one entry per single-resource GET/PATCH/DELETE route
// ---------------------------------------------------------------------------

type ResourceCase = {
  label: string;
  method: "GET" | "PATCH" | "DELETE";
  handler: RouteHandler;
  path: (id: string) => string;
  body?: Record<string, unknown>;
  /** Picks the cross-org target id out of org B's seeded fixture. */
  crossOrgId: (orgB: TwoOrgsFixture["orgB"]) => string;
};

const RESOURCE_CASES: ResourceCase[] = [
  {
    label: "supplier get",
    method: "GET",
    handler: suppliersGet as RouteHandler,
    path: (id) => `/api/v1/suppliers/${id}`,
    crossOrgId: (orgB) => orgB.supplierId,
  },
  {
    label: "supplier update",
    method: "PATCH",
    handler: suppliersPatch as RouteHandler,
    path: (id) => `/api/v1/suppliers/${id}`,
    body: { name: "hijacked" },
    crossOrgId: (orgB) => orgB.supplierId,
  },
  {
    label: "supplier delete",
    method: "DELETE",
    handler: suppliersDelete as RouteHandler,
    path: (id) => `/api/v1/suppliers/${id}`,
    crossOrgId: (orgB) => orgB.supplierId,
  },
  {
    label: "ingredient get",
    method: "GET",
    handler: ingredientsGet as RouteHandler,
    path: (id) => `/api/v1/ingredients/${id}`,
    crossOrgId: (orgB) => orgB.ingredientId,
  },
  {
    label: "ingredient update",
    method: "PATCH",
    handler: ingredientsPatch as RouteHandler,
    path: (id) => `/api/v1/ingredients/${id}`,
    body: { name: "hijacked" },
    crossOrgId: (orgB) => orgB.ingredientId,
  },
  {
    label: "ingredient delete",
    method: "DELETE",
    handler: ingredientsDelete as RouteHandler,
    path: (id) => `/api/v1/ingredients/${id}`,
    crossOrgId: (orgB) => orgB.ingredientId,
  },
  {
    label: "recipe get",
    method: "GET",
    handler: recipesGet as RouteHandler,
    path: (id) => `/api/v1/recipes/${id}`,
    crossOrgId: (orgB) => orgB.recipeId,
  },
  {
    label: "recipe update",
    method: "PATCH",
    handler: recipesPatch as RouteHandler,
    path: (id) => `/api/v1/recipes/${id}`,
    body: { name: "hijacked" },
    crossOrgId: (orgB) => orgB.recipeId,
  },
  {
    label: "recipe delete",
    method: "DELETE",
    handler: recipesDelete as RouteHandler,
    path: (id) => `/api/v1/recipes/${id}`,
    crossOrgId: (orgB) => orgB.recipeId,
  },
];

describe("tenant isolation: org A's owner can never see org B's single-resource ids (404, not 403)", () => {
  it.each(RESOURCE_CASES)(
    "$label: 404s when org A's owner targets org B's resource",
    async ({ method, handler, path, body, crossOrgId }) => {
      const targetId = crossOrgId(fixture.orgB);
      const result = await callRoute(handler, {
        method,
        path: path(targetId),
        cookie: fixture.orgA.owner.cookie,
        params: { id: targetId },
        body,
      });

      expect(result.status, JSON.stringify(result.body)).toBe(404);
      expect(result.body?.error).toBe("NOT_FOUND");
    },
  );

  it("control: org A's owner CAN read org A's own supplier (the matrix isn't blocking everything)", async () => {
    const result = await callRoute(suppliersGet as RouteHandler, {
      method: "GET",
      path: `/api/v1/suppliers/${fixture.orgA.supplierId}`,
      cookie: fixture.orgA.owner.cookie,
      params: { id: fixture.orgA.supplierId },
    });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body?.id).toBe(fixture.orgA.supplierId);
  });
});

/**
 * `adjust`/`transfer` don't take a resource id in the URL — the equivalent
 * cross-tenant probe is org A's owner passing org B's `ingredientId` in the
 * request BODY.
 *
 * Expected status is 400 (ValidationError), not 404: `adjustStock`/
 * `transferStock` (src/features/inventory/server/service.ts) look up the
 * ingredient via `repository.findIngredientById(ctx.db, ingredientId)`,
 * where `ctx.db` is org-A-scoped (`forTenant`) — org B's ingredient id
 * simply doesn't resolve, which is EXACTLY the same code path Task 5
 * already built for a plain nonexistent id
 * (`throw new ValidationError({ ingredientId: "does not exist" })`). There
 * is no separate "exists in another org" branch to distinguish from "never
 * existed" — both produce the identical 400 `{ ingredientId: "does not
 * exist" }`, which already satisfies the same non-disclosure goal as the
 * resource-id routes' 404 (a caller can't tell "wrong org" from "made up
 * id" either way); a 404 wouldn't fit the body-field shape of these two
 * routes, and nothing in Task 5's code returns one for this input, so 400
 * is both what the existing code actually does and the response that
 * preserves the same non-disclosure property.
 *
 * IMPORTANT: both tests below assert the exact `details` shape, not just
 * `status`/`error`. `transferStock`'s real check order (`src/features/
 * inventory/server/service.ts`) is: (1) `toBranchId === fromBranchId`
 * (`ValidationError({ toBranchId: "cannot transfer to the same branch" })`),
 * THEN (2) the ingredient lookup — the one this test means to exercise —
 * THEN (3) `toTeam` (`ValidationError({ toBranchId: "not a branch in this
 * organization" })` when `toBranchId` doesn't name a team in the caller's
 * own org, which org B's branchId never does from org A's perspective). The
 * body below picks `toBranchId: fixture.orgB.branchId` specifically so check
 * (1) doesn't fire (it differs from org A's own `fromBranchId`), which lets
 * execution reach check (2) — the ingredient lookup. But checks (2) and (3)
 * BOTH produce a 400 `{ error: "VALIDATION" }` — asserting only status/code
 * can't tell them apart. If the ingredient-isolation check were silently
 * broken (e.g. wrongly resolving org B's ingredient as if it existed in org
 * A), execution would fall through to check (3) instead, which ALSO 400s
 * VALIDATION — so a status/code-only assertion would still pass for the
 * wrong reason and this test would prove nothing. Asserting the exact
 * `details` (`{ ingredientId: "does not exist" }`) is what actually
 * distinguishes "the ingredient check correctly rejected org B's id" from
 * "the ingredient check silently passed and a later, unrelated check
 * happened to also 400". Same reasoning applies to the `adjust` case, even
 * though `adjustStock` only has the one validation branch today (asserting
 * the exact detail there too is cheap insurance against this test
 * silently losing its meaning if a second check is ever added ahead of it).
 */
describe("tenant isolation: inventory adjust/transfer reject another org's ingredientId in the body", () => {
  it("adjust: 400s with the exact 'ingredientId does not exist' detail when org A's owner passes org B's ingredientId", async () => {
    const result = await callRoute(adjustPost as RouteHandler, {
      method: "POST",
      path: "/api/v1/inventory/adjust",
      cookie: fixture.orgA.owner.cookie,
      branchId: fixture.orgA.branchId,
      body: { ingredientId: fixture.orgB.ingredientId, qty: 1, reason: "test" },
    });

    expect(result.status, JSON.stringify(result.body)).toBe(400);
    expect(result.body?.error).toBe("VALIDATION");
    expect(result.body?.details).toEqual({ ingredientId: "does not exist" });
  });

  it("transfer: 400s with the exact 'ingredientId does not exist' detail when org A's owner passes org B's ingredientId", async () => {
    const result = await callRoute(transferPost as RouteHandler, {
      method: "POST",
      path: "/api/v1/inventory/transfer",
      cookie: fixture.orgA.owner.cookie,
      branchId: fixture.orgA.branchId,
      body: {
        // Only needs to differ from fromBranchId (org A's branchId) so the
        // same-branch check (the service's REAL first check) doesn't fire
        // before reaching the ingredient lookup this test is actually
        // exercising. org B's branchId is a convenient value for this —
        // it's never reached, because the ingredient check 400s before the
        // later toTeam check that would otherwise examine it. See this
        // describe block's doc comment for why the `details` assertion
        // below is what actually proves that, not just the status/code.
        ingredientId: fixture.orgB.ingredientId,
        quantity: 1,
        reason: "test",
        toBranchId: fixture.orgB.branchId,
      },
    });

    expect(result.status, JSON.stringify(result.body)).toBe(400);
    expect(result.body?.error).toBe("VALIDATION");
    expect(result.body?.details).toEqual({ ingredientId: "does not exist" });
  });
});

/**
 * Exercises `src/server/http/with-auth.ts`'s B3 branch-scoping gate (step
 * 5) for an ORG-WIDE caller (owner/admin): the branch id in `x-branch-id`
 * must name a real team in the CALLER'S OWN organization
 * (`auth.api.listOrganizationTeams({ query: { organizationId } })`), not
 * merely any real team anywhere. Org B's `branchId` is a genuine team id —
 * seeded by `setupTwoOrgs()` via `buildOrg`'s own
 * `db.team.findFirstOrThrow` — that exists in org B, not org A, so sending
 * it as org A's owner must be rejected the same way a made-up id would be.
 *
 * Before the with-auth.ts fix this test is named after, an org-wide
 * caller's `x-branch-id` was accepted with no verification at all, so this
 * case would have silently succeeded (200, with `ctx.branchId` set to a
 * team belonging to a DIFFERENT organization — exactly the kind of
 * cross-tenant branch id that could otherwise flow into
 * `StockMovement.branchId`/`AuditLog.branchId`). It must now 403.
 */
describe("tenant isolation: org A's owner cannot act on org B's real branch id via x-branch-id (B3)", () => {
  const CROSS_ORG_BRANCH_CASES: Array<{
    label: string;
    method: "GET" | "POST";
    handler: RouteHandler;
    path: string;
    body?: (f: TwoOrgsFixture) => Record<string, unknown>;
  }> = [
    {
      label: "inventory current stock (GET)",
      method: "GET",
      handler: inventoryGet as RouteHandler,
      path: "/api/v1/inventory",
    },
    {
      label: "inventory movements (GET)",
      method: "GET",
      handler: movementsGet as RouteHandler,
      path: "/api/v1/inventory/movements",
    },
    {
      label: "inventory adjust (POST)",
      method: "POST",
      handler: adjustPost as RouteHandler,
      path: "/api/v1/inventory/adjust",
      body: (f) => ({ ingredientId: f.orgA.ingredientId, qty: 1, reason: "test" }),
    },
  ];

  it.each(CROSS_ORG_BRANCH_CASES)(
    "$label: 403 BRANCH_NOT_A_MEMBER when org A's owner sends org B's real branchId",
    async ({ method, handler, path, body }) => {
      const result = await callRoute(handler, {
        method,
        path,
        cookie: fixture.orgA.owner.cookie,
        // org B's REAL seeded team/branch id, not a placeholder — it must
        // be rejected precisely because it belongs to another org, not
        // because it's malformed or nonexistent.
        branchId: fixture.orgB.branchId,
        body: body?.(fixture),
      });

      expect(result.status, JSON.stringify(result.body)).toBe(403);
      expect(result.body?.error).toBe("BRANCH_NOT_A_MEMBER");
    },
  );
});

/**
 * Settings plan (Tasks 2-6): cross-org single-resource access for
 * Branches/Members/Invitations/Roles. Unlike `RESOURCE_CASES` above (all of
 * which 404 `NOT_FOUND` identically), these four features do NOT all land
 * on the same status/code — each entry below asserts the status
 * and error code the REAL code actually produces, reasoned through against
 * the service layer, not the generic 404 every one of these routes might
 * naively be expected to return:
 *
 * - Members/Invitations: `findMemberOrThrow`/`findInvitationOrThrow`
 *   (`src/features/{members,invitations}/server/service.ts`) pre-read the
 *   target via `listMembers`/`listInvitations`, which are already scoped to
 *   `ctx.organizationId` — org B's id is simply absent from that list, so
 *   these throw this app's own `NotFoundError` (404 `NOT_FOUND`) BEFORE ever
 *   reaching Better Auth, same shape as `RESOURCE_CASES` above.
 *
 * - Branches: `updateBranch`/`deleteBranch` have no equivalent org-scoped
 *   pre-check of their own — they call `auth.api.updateTeam`/`removeTeam`
 *   directly. Reading Better Auth's own handlers
 *   (`node_modules/better-auth/dist/plugins/organization/routes/
 *   crud-team.mjs`): both resolve `organizationId` from the CALLER's active
 *   org (not from the target team), look up the team via
 *   `adapter.findTeamById({ teamId, organizationId })`, and explicitly
 *   re-check `team.organizationId !== organizationId` — so org B's real
 *   branch id correctly fails this check, but as Better Auth's own
 *   `APIError.from("BAD_REQUEST", TEAM_NOT_FOUND)` (an HTTP 400), not a 404.
 *   `rethrowTeamApiError` (`src/features/branches/server/service.ts`)
 *   re-throws that as this app's `AppError("TEAM_NOT_FOUND", 400)` verbatim.
 *   Still non-disclosing (org B's branch data never appears in the
 *   response), just a different status/code than the 404 pattern — a real
 *   inconsistency worth knowing about, not a leak, and out of this task's
 *   scope to "fix" (no Task 2-8 feature-code changes without stopping to
 *   report first, per this task's brief).
 *
 * - Roles: `getRole`/`updateRole`/`deleteRole` all resolve via
 *   `auth.api.getOrgRole`/`updateOrgRole`/`deleteOrgRole` with
 *   `{ organizationId: ctx.organizationId, roleName }` — Better Auth scopes
 *   the lookup by the CALLER's own org, so a role name that exists only in
 *   org B (this fixture's `ORG_B_ONLY_ROLE`, deliberately never defined in
 *   org A — see that constant's doc comment in `seed-two-orgs.ts`) simply
 *   doesn't resolve for org A's owner. `getRole`'s own doc comment is
 *   explicit about this: "400, not 404: mirrors Better Auth's own
 *   getOrgRole ... which raises ROLE_NOT_FOUND as a BAD_REQUEST, never a
 *   404." Confirms the brief's open question: role names are NOT globally
 *   unique (both orgs independently define "restricted" under the identical
 *   name), and a cross-org name lookup is a clean, non-leaking 400
 *   ROLE_NOT_FOUND — never org B's actual permission payload.
 */
type CrossOrgIdentityCase = {
  method: "GET" | "PATCH" | "DELETE";
  handler: RouteHandler;
  path: string;
  params: Record<string, string>;
  body?: Record<string, unknown>;
  expectedStatus: number;
  expectedError: string;
};

/**
 * Case builders take `fixture` as an argument and are called INSIDE each
 * `it.each` test body, not at describe-registration time — same pattern
 * `permission-matrix.integration.test.ts`'s `CaseBuilder`/`DENIED_CASES`
 * already establishes, for the same reason: `fixture` doesn't exist until
 * `beforeAll` resolves, but the CASE TABLE's labels/shape are static and
 * known up front.
 */
type CrossOrgIdentityCaseBuilder = (f: TwoOrgsFixture) => CrossOrgIdentityCase;

const CROSS_ORG_IDENTITY_CASES: Record<string, CrossOrgIdentityCaseBuilder> = {
  "branch update": (f) => ({
    method: "PATCH",
    handler: branchesPatch as RouteHandler,
    path: `/api/v1/branches/${f.orgB.secondBranchId}`,
    params: { id: f.orgB.secondBranchId },
    body: { name: "hijacked" },
    expectedStatus: 400,
    expectedError: "TEAM_NOT_FOUND",
  }),
  "branch delete": (f) => ({
    method: "DELETE",
    handler: branchesDelete as RouteHandler,
    path: `/api/v1/branches/${f.orgB.secondBranchId}`,
    params: { id: f.orgB.secondBranchId },
    expectedStatus: 400,
    expectedError: "TEAM_NOT_FOUND",
  }),
  "member role update": (f) => ({
    // Org B's owner's own Member ROW id (not a userId) — see
    // `SeededOrg.ownerMemberId`'s doc comment in `seed-two-orgs.ts`.
    method: "PATCH",
    handler: membersPatch as RouteHandler,
    path: `/api/v1/members/${f.orgB.ownerMemberId}`,
    params: { id: f.orgB.ownerMemberId },
    body: { role: "member" },
    expectedStatus: 404,
    expectedError: "NOT_FOUND",
  }),
  "member remove": (f) => ({
    method: "DELETE",
    handler: membersDelete as RouteHandler,
    path: `/api/v1/members/${f.orgB.ownerMemberId}`,
    params: { id: f.orgB.ownerMemberId },
    expectedStatus: 404,
    expectedError: "NOT_FOUND",
  }),
  "invitation cancel": (f) => ({
    method: "DELETE",
    handler: invitationsDelete as RouteHandler,
    path: `/api/v1/invitations/${f.orgB.invitationId}`,
    params: { id: f.orgB.invitationId },
    expectedStatus: 404,
    expectedError: "NOT_FOUND",
  }),
  "role get (name only exists in org B)": () => ({
    method: "GET",
    handler: rolesGet as RouteHandler,
    path: `/api/v1/roles/${ORG_B_ONLY_ROLE}`,
    params: { name: ORG_B_ONLY_ROLE },
    expectedStatus: 400,
    expectedError: "ROLE_NOT_FOUND",
  }),
  "role update (name only exists in org B)": () => ({
    method: "PATCH",
    handler: rolesPatch as RouteHandler,
    path: `/api/v1/roles/${ORG_B_ONLY_ROLE}`,
    params: { name: ORG_B_ONLY_ROLE },
    body: { permission: { supplier: ["read"] } },
    expectedStatus: 400,
    expectedError: "ROLE_NOT_FOUND",
  }),
  "role delete (name only exists in org B)": () => ({
    method: "DELETE",
    handler: rolesDelete as RouteHandler,
    path: `/api/v1/roles/${ORG_B_ONLY_ROLE}`,
    params: { name: ORG_B_ONLY_ROLE },
    expectedStatus: 400,
    expectedError: "ROLE_NOT_FOUND",
  }),
};

describe("tenant isolation: branches/members/invitations/roles single-resource cross-org access", () => {
  it.each(Object.entries(CROSS_ORG_IDENTITY_CASES))(
    "%s: org A's owner gets a clean, non-disclosing error against org B's real resource",
    async (_label, build) => {
      const c = build(fixture);
      const result = await callRoute(c.handler, {
        method: c.method,
        path: c.path,
        cookie: fixture.orgA.owner.cookie,
        params: c.params,
        body: c.body,
      });

      expect(result.status, `${_label}: ${JSON.stringify(result.body)}`).toBe(c.expectedStatus);
      expect(result.body?.error, `${_label}: ${JSON.stringify(result.body)}`).toBe(c.expectedError);
    },
  );

  it("control: org A's owner CAN update org A's own second branch (the matrix isn't blocking everything)", async () => {
    const result = await callRoute(branchesPatch as RouteHandler, {
      method: "PATCH",
      path: `/api/v1/branches/${fixture.orgA.secondBranchId}`,
      cookie: fixture.orgA.owner.cookie,
      params: { id: fixture.orgA.secondBranchId },
      body: { name: "renamed by owner" },
    });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body?.id).toBe(fixture.orgA.secondBranchId);
  });

  /**
   * Control for the three "role ... (name only exists in org B)" cases
   * above: without this, those cases could "pass" for the wrong reason —
   * `ORG_B_ONLY_ROLE` simply never resolving for ANYONE (e.g. a case-
   * normalization mismatch between what `create-role` actually stores and
   * what these lookups query) rather than org-scoping correctly rejecting a
   * cross-org caller. Proving org B's OWN owner gets a real 200 with the
   * expected `permission` payload confirms the role genuinely exists and is
   * reachable by its rightful org, which is what makes org A's 400
   * `ROLE_NOT_FOUND` above actually mean something.
   */
  it("control: org B's OWN owner CAN read org B's own org-B-only role", async () => {
    const result = await callRoute(rolesGet as RouteHandler, {
      method: "GET",
      path: `/api/v1/roles/${ORG_B_ONLY_ROLE}`,
      cookie: fixture.orgB.owner.cookie,
      params: { name: ORG_B_ONLY_ROLE },
    });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body?.role).toBe(ORG_B_ONLY_ROLE);
    expect(result.body?.permission).toEqual(RESTRICTED_PERMISSION);
  });
});
