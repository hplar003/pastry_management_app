/**
 * Security plan Task 6 (B2): a caller holding only part of a feature's
 * permission vocabulary must be refused (403 PERMISSION_DENIED) for every
 * OTHER permission on every route, originally across Suppliers, Ingredients,
 * Recipes, and Inventory, and now (Organization Settings plan, Task 9)
 * extended to also cover Organization/Branches/Members/Invitations/Roles/
 * Audit-log. Also proves the matrix isn't accidentally blocking everything:
 * the one permission the restricted actor DOES hold (`supplier:read`) must
 * still succeed, plus a positive case for Sessions (no permission gate at
 * all — self-service).
 *
 * Needs a REAL database (real org, dynamic role, session) via
 * `tests/helpers/seed-two-orgs.ts`, so — like
 * `tenant-isolation.integration.test.ts` — this file is named
 * `*.integration.test.ts` and runs only under `npm run test:integration`.
 *
 * NOT YET RUNNABLE for the same reason as `tenant-isolation.integration.
 * test.ts`: this has never been executed against a real database in this
 * environment. Reasoned through against the real route/service code and
 * `grant-ceiling.integration.test.ts`'s working patterns; NOT executed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as suppliersPost, GET as suppliersListGet } from "@/app/api/v1/suppliers/route";
import { GET as suppliersGet, PATCH as suppliersPatch, DELETE as suppliersDelete } from "@/app/api/v1/suppliers/[id]/route";
import { POST as ingredientsPost, GET as ingredientsListGet } from "@/app/api/v1/ingredients/route";
import { GET as ingredientsGet, PATCH as ingredientsPatch, DELETE as ingredientsDelete } from "@/app/api/v1/ingredients/[id]/route";
import { GET as inventoryGet } from "@/app/api/v1/inventory/route";
import { POST as adjustPost } from "@/app/api/v1/inventory/adjust/route";
import { POST as transferPost } from "@/app/api/v1/inventory/transfer/route";
import { GET as movementsGet } from "@/app/api/v1/inventory/movements/route";
import { POST as recipesPost, GET as recipesListGet } from "@/app/api/v1/recipes/route";
import { GET as recipesGet, PATCH as recipesPatch, DELETE as recipesDelete } from "@/app/api/v1/recipes/[id]/route";
import { PATCH as organizationPatch } from "@/app/api/v1/organization/route";
import { POST as branchesPost } from "@/app/api/v1/branches/route";
import { PATCH as branchesPatch, DELETE as branchesDelete } from "@/app/api/v1/branches/[id]/route";
import { PATCH as membersPatch, DELETE as membersDelete } from "@/app/api/v1/members/[id]/route";
import { POST as invitationsPost } from "@/app/api/v1/invitations/route";
import { DELETE as invitationsDelete } from "@/app/api/v1/invitations/[id]/route";
import { POST as rolesPost } from "@/app/api/v1/roles/route";
import { GET as rolesGet, PATCH as rolesPatch, DELETE as rolesDelete } from "@/app/api/v1/roles/[name]/route";
import { GET as auditLogGet } from "@/app/api/v1/audit-log/route";
import { GET as auditLogActionsGet } from "@/app/api/v1/audit-log/actions/route";
import { GET as sessionsGet } from "@/app/api/v1/sessions/route";

import { callRoute, type RouteHandler } from "../helpers/call-route";
import { RESTRICTED_ROLE, setupTwoOrgs, teardownTwoOrgs, type TwoOrgsFixture } from "../helpers/seed-two-orgs";

let fixture: TwoOrgsFixture;

beforeAll(async () => {
  fixture = await setupTwoOrgs();
}, 120_000);

afterAll(async () => {
  await teardownTwoOrgs();
});

type ResolvedCase = {
  method: string;
  path: string;
  handler: RouteHandler;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  branchId?: string;
};

/**
 * Case builders take `fixture` as an argument and are called INSIDE each
 * `it.each` test body (after `beforeAll` has populated it), not at
 * describe-registration time — `fixture` doesn't exist yet when this
 * module's `describe` block body runs, only once `beforeAll` resolves.
 */
type CaseBuilder = (f: TwoOrgsFixture) => ResolvedCase;

/**
 * One entry per route+permission combination NOT held by the restricted
 * role ({ supplier: ["read"] }). Resource ids (where a route needs one) are
 * org A's own seeded resources — the point here is the PERMISSION gate,
 * which withAuth checks (step 4) before any resource lookup, so using the
 * member's own org's real ids (rather than a made-up one) proves this is a
 * permission 403, not an incidental 404.
 */
const DENIED_CASES: Record<string, CaseBuilder> = {
  // --- Suppliers: create/update/delete (read is the one held permission) ---
  "supplier:create": () => ({
    method: "POST",
    path: "/api/v1/suppliers",
    handler: suppliersPost as RouteHandler,
    body: { name: "nope" },
  }),
  "supplier:update": (f) => ({
    method: "PATCH",
    path: `/api/v1/suppliers/${f.orgA.supplierId}`,
    handler: suppliersPatch as RouteHandler,
    params: { id: f.orgA.supplierId },
    body: { name: "nope" },
  }),
  "supplier:delete": (f) => ({
    method: "DELETE",
    path: `/api/v1/suppliers/${f.orgA.supplierId}`,
    handler: suppliersDelete as RouteHandler,
    params: { id: f.orgA.supplierId },
  }),

  // --- Ingredients: create/read/update/delete (none held) ---
  "ingredient:create": () => ({
    method: "POST",
    path: "/api/v1/ingredients",
    handler: ingredientsPost as RouteHandler,
    body: { name: "nope", unit: "kg" },
  }),
  "ingredient:read (list)": () => ({
    method: "GET",
    path: "/api/v1/ingredients",
    handler: ingredientsListGet as RouteHandler,
  }),
  "ingredient:read (single)": (f) => ({
    method: "GET",
    path: `/api/v1/ingredients/${f.orgA.ingredientId}`,
    handler: ingredientsGet as RouteHandler,
    params: { id: f.orgA.ingredientId },
  }),
  "ingredient:update": (f) => ({
    method: "PATCH",
    path: `/api/v1/ingredients/${f.orgA.ingredientId}`,
    handler: ingredientsPatch as RouteHandler,
    params: { id: f.orgA.ingredientId },
    body: { name: "nope" },
  }),
  "ingredient:delete": (f) => ({
    method: "DELETE",
    path: `/api/v1/ingredients/${f.orgA.ingredientId}`,
    handler: ingredientsDelete as RouteHandler,
    params: { id: f.orgA.ingredientId },
  }),

  // --- Inventory: read/adjust/transfer (none held) ---
  "inventory:read (current stock)": (f) => ({
    method: "GET",
    path: "/api/v1/inventory",
    handler: inventoryGet as RouteHandler,
    branchId: f.orgA.branchId,
  }),
  "inventory:read (movements)": (f) => ({
    method: "GET",
    path: "/api/v1/inventory/movements",
    handler: movementsGet as RouteHandler,
    branchId: f.orgA.branchId,
  }),
  "inventory:adjust": (f) => ({
    method: "POST",
    path: "/api/v1/inventory/adjust",
    handler: adjustPost as RouteHandler,
    branchId: f.orgA.branchId,
    body: { ingredientId: f.orgA.ingredientId, qty: 1, reason: "nope" },
  }),
  "inventory:transfer": (f) => ({
    method: "POST",
    path: "/api/v1/inventory/transfer",
    handler: transferPost as RouteHandler,
    branchId: f.orgA.branchId,
    body: {
      ingredientId: f.orgA.ingredientId,
      quantity: 1,
      reason: "nope",
      toBranchId: f.orgB.branchId,
    },
  }),

  // --- Recipes: create/read/update/delete (none held) ---
  "recipe:create": (f) => ({
    method: "POST",
    path: "/api/v1/recipes",
    handler: recipesPost as RouteHandler,
    body: {
      name: "nope",
      yieldQuantity: 1,
      yieldUnit: "batch",
      ingredients: [{ ingredientId: f.orgA.ingredientId, quantity: 1 }],
    },
  }),
  "recipe:read (list)": () => ({
    method: "GET",
    path: "/api/v1/recipes",
    handler: recipesListGet as RouteHandler,
  }),
  "recipe:read (single)": (f) => ({
    method: "GET",
    path: `/api/v1/recipes/${f.orgA.recipeId}`,
    handler: recipesGet as RouteHandler,
    params: { id: f.orgA.recipeId },
  }),
  "recipe:update": (f) => ({
    method: "PATCH",
    path: `/api/v1/recipes/${f.orgA.recipeId}`,
    handler: recipesPatch as RouteHandler,
    params: { id: f.orgA.recipeId },
    body: { name: "nope" },
  }),
  "recipe:delete": (f) => ({
    method: "DELETE",
    path: `/api/v1/recipes/${f.orgA.recipeId}`,
    handler: recipesDelete as RouteHandler,
    params: { id: f.orgA.recipeId },
  }),

  // --- Organization: update (read has no permission gate, see with-auth) ---
  "organization:update": () => ({
    method: "PATCH",
    path: "/api/v1/organization",
    handler: organizationPatch as RouteHandler,
    body: { name: "nope" },
  }),

  // --- Branches: create/update/delete (read has no permission gate) ---
  "team:create": () => ({
    method: "POST",
    path: "/api/v1/branches",
    handler: branchesPost as RouteHandler,
    body: { name: "nope" },
  }),
  "team:update": (f) => ({
    method: "PATCH",
    path: `/api/v1/branches/${f.orgA.secondBranchId}`,
    handler: branchesPatch as RouteHandler,
    params: { id: f.orgA.secondBranchId },
    body: { name: "nope" },
  }),
  "team:delete": (f) => ({
    method: "DELETE",
    path: `/api/v1/branches/${f.orgA.secondBranchId}`,
    handler: branchesDelete as RouteHandler,
    params: { id: f.orgA.secondBranchId },
  }),

  // --- Members: update/delete (read has no permission gate) ---
  "member:update": (f) => ({
    method: "PATCH",
    path: `/api/v1/members/${f.orgA.ownerMemberId}`,
    handler: membersPatch as RouteHandler,
    params: { id: f.orgA.ownerMemberId },
    body: { role: "member" },
  }),
  "member:delete": (f) => ({
    method: "DELETE",
    path: `/api/v1/members/${f.orgA.ownerMemberId}`,
    handler: membersDelete as RouteHandler,
    params: { id: f.orgA.ownerMemberId },
  }),

  // --- Invitations: create/cancel (read has no permission gate) ---
  "invitation:create": () => ({
    method: "POST",
    path: "/api/v1/invitations",
    handler: invitationsPost as RouteHandler,
    body: { email: "nope@sec7.integration.test", role: "member" },
  }),
  "invitation:cancel": (f) => ({
    method: "DELETE",
    path: `/api/v1/invitations/${f.orgA.invitationId}`,
    handler: invitationsDelete as RouteHandler,
    params: { id: f.orgA.invitationId },
  }),

  // --- Roles: create/update/delete/read-one (read of the name list has no permission gate; GET /roles/[name] requires ac:read, separate from the list) ---
  "ac:create": () => ({
    method: "POST",
    path: "/api/v1/roles",
    handler: rolesPost as RouteHandler,
    body: { role: "nope-role", permission: { supplier: ["read"] } },
  }),
  "ac:read (single role)": () => ({
    method: "GET",
    path: `/api/v1/roles/${RESTRICTED_ROLE}`,
    handler: rolesGet as RouteHandler,
    params: { name: RESTRICTED_ROLE },
  }),
  "ac:update": () => ({
    method: "PATCH",
    path: `/api/v1/roles/${RESTRICTED_ROLE}`,
    handler: rolesPatch as RouteHandler,
    params: { name: RESTRICTED_ROLE },
    body: { permission: { supplier: ["read"] } },
  }),
  "ac:delete": () => ({
    method: "DELETE",
    path: `/api/v1/roles/${RESTRICTED_ROLE}`,
    handler: rolesDelete as RouteHandler,
    params: { name: RESTRICTED_ROLE },
  }),

  // --- Audit log: read (list + distinct action names) ---
  "audit:read": () => ({
    method: "GET",
    path: "/api/v1/audit-log",
    handler: auditLogGet as RouteHandler,
  }),
  "audit:read (actions)": () => ({
    method: "GET",
    path: "/api/v1/audit-log/actions",
    handler: auditLogActionsGet as RouteHandler,
  }),
};

describe("permission matrix: the restricted member ({ supplier: ['read'] }) is refused every OTHER permission", () => {
  it.each(Object.entries(DENIED_CASES))("%s: 403 PERMISSION_DENIED", async (_label, build) => {
    const c = build(fixture);
    const result = await callRoute(c.handler, {
      method: c.method,
      path: c.path,
      cookie: fixture.orgA.member.cookie,
      branchId: c.branchId,
      body: c.body,
      params: c.params,
    });

    expect(result.status, `${_label}: ${JSON.stringify(result.body)}`).toBe(403);
    expect(result.body?.error, `${_label}: ${JSON.stringify(result.body)}`).toBe("PERMISSION_DENIED");
  });

  it("control: the restricted member CAN read org A's own supplier (the matrix isn't blocking everything)", async () => {
    const result = await callRoute(suppliersGet as RouteHandler, {
      method: "GET",
      path: `/api/v1/suppliers/${fixture.orgA.supplierId}`,
      cookie: fixture.orgA.member.cookie,
      params: { id: fixture.orgA.supplierId },
    });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body?.id).toBe(fixture.orgA.supplierId);
  });

  it("control: the restricted member CAN list org A's suppliers", async () => {
    const result = await callRoute(suppliersListGet as RouteHandler, {
      method: "GET",
      path: "/api/v1/suppliers",
      cookie: fixture.orgA.member.cookie,
    });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
  });

  /**
   * `GET /api/v1/sessions`/`DELETE /api/v1/sessions/[id]` have no
   * resource-level permission check at all (self-service — see those
   * routes' own doc comments), so they're deliberately absent from
   * `DENIED_CASES` above: there is no permission to deny. This is the
   * positive case the brief asks for instead, proving the restricted
   * member's famously narrow role ({ supplier: ["read"] }, nothing else —
   * not even any `member`/`team`/`ac` grant) still isn't enough to lock
   * them out of managing their OWN sessions. Only `GET` (listing), not
   * `DELETE` (revoking) — revoking the one session behind
   * `fixture.orgA.member.cookie` would invalidate that cookie for any
   * later test in this file that still needs it, for no extra coverage:
   * `revokeSession`'s own self-scoping (`ctx.userId`, see
   * `src/features/sessions/server/service.ts`) is already covered by
   * Task 7's own unit tests, per this task's brief.
   */
  it("control: the restricted member CAN list their own sessions (self-service, no permission gate)", async () => {
    const result = await callRoute(sessionsGet as RouteHandler, {
      method: "GET",
      path: "/api/v1/sessions",
      cookie: fixture.orgA.member.cookie,
    });

    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(Array.isArray(result.body)).toBe(true);
  });
});
