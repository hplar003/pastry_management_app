/**
 * Shared fixture for the cross-tenant/cross-permission security integration
 * tests (security plan Task 6 / CLAUDE.md: "Every new route must be added
 * to tests/security/*"). Builds TWO organizations ("A" and "B"), each with:
 *
 *   - one owner actor (full permissions, the organization's creator — Better
 *     Auth's own `createOrganization` gives them the default team/branch
 *     membership and `creatorRole` ("owner") automatically);
 *   - one restricted member actor, holding a deliberately narrow dynamic
 *     role (`{ supplier: ["read"] }` only — nothing else, not even
 *     `ingredient`/`recipe`/`inventory` read);
 *   - one default team (its only branch);
 *   - one seeded Supplier, Ingredient, and Recipe (one line item,
 *     referencing that ingredient), created via REAL POST calls to the
 *     actual `/api/v1/{suppliers,ingredients,recipes}` route handlers as
 *     that org's owner — this both seeds data for the other tests and is a
 *     free smoke test that those routes work end-to-end against a real
 *     database.
 *
 * Follows `src/server/auth/grant-ceiling.integration.test.ts`'s exact
 * pattern for how it signs in / creates orgs / creates dynamic roles /
 * builds session cookies (real sign-in through the real `/api/auth` route
 * handler, per-run unique email/slug prefixes, RFC 2544 benchmarking IPs,
 * `beforeAll`/`afterAll` cleanup) rather than inventing a new one.
 *
 * Call `setupTwoOrgs()` in `beforeAll` and `teardownTwoOrgs()` in `afterAll`.
 * Both are idempotent/defensive the same way the existing integration test
 * is: `setupTwoOrgs()` cleans up leftovers from an aborted prior run before
 * creating anything.
 */
import "server-only";

import { randomBytes } from "node:crypto";

import { PrismaNeon } from "@prisma/adapter-neon";
import { hashPassword } from "better-auth/crypto";

import { PrismaClient } from "@/generated/prisma/client";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { POST as suppliersPost } from "@/app/api/v1/suppliers/route";
import { POST as ingredientsPost } from "@/app/api/v1/ingredients/route";
import { POST as recipesPost } from "@/app/api/v1/recipes/route";
import { POST as branchesPost } from "@/app/api/v1/branches/route";
import { POST as invitationsPost } from "@/app/api/v1/invitations/route";
import { GET as membersGet } from "@/app/api/v1/members/route";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";
import { callRoute, mergeSetCookies, type RouteHandler } from "./call-route";

/**
 * Owner-role client (DATABASE_URL_UNPOOLED), used ONLY for cleanup of the
 * domain tables below — exactly the pattern `src/server/db.integration.
 * test.ts` already uses ("for ground truth and cleanup"). The app's own
 * `db` export connects as `app_user`, which (per `prisma/migrations/
 * 20260930005000_app_user_rls/migration.sql` and `prisma/manual-migrations/
 * inventory_recipe_rls.sql`) has NO DELETE grant on Supplier/Ingredient/
 * Recipe (soft-delete only) and NO UPDATE/DELETE grant on StockMovement/
 * AuditLog (append-only ledgers) — every one of those deletes would throw
 * "permission denied" through `db`. Organization/User/RateLimit are Better
 * Auth tables that were never revoked from `app_user` (the adapter needs
 * full DML on them), so those three stay on the app's own `db`.
 */
// Named `ownerDb`, not `owner`: `buildOrg` below already uses `owner` as the
// local variable name for the organization's owner ACTOR (a user), and the
// two must never be confused with each other.
const ownerDb = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED! }),
});

export const EMAIL_DOMAIN = "sec7.integration.test";
export const SLUG_PREFIX = "itest-sec7-";
export const IP_PREFIX = "198.18."; // RFC 2544 benchmarking range: never a real client

const runId = randomBytes(4).toString("hex");
const clientIp = `${IP_PREFIX}${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const origin = new URL(process.env.BETTER_AUTH_URL!).origin;

/** The restricted member's dynamic role: supplier read only, nothing else. */
export const RESTRICTED_PERMISSION = { supplier: ["read"] } as const;
export const RESTRICTED_ROLE = "restricted";

/**
 * A custom role created ONLY in org B (see `buildOrg`), never in org A —
 * unlike `RESTRICTED_ROLE`, which both orgs define under the identical name
 * "restricted" (useful for proving a by-name lookup stays scoped to the
 * caller's own org even when the name collides, but NOT useful for proving
 * the opposite case: a name that simply doesn't exist in the caller's org at
 * all). `tenant-isolation.integration.test.ts`'s roles case targets this
 * constant directly — org A's owner has no role by this name in their own
 * org, so `GET/PATCH/DELETE /api/v1/roles/orgbonlyrole` must come back as a
 * clean "not found", never org B's actual permission payload.
 *
 * MUST be all-lowercase: Better Auth's `create-role` endpoint normalizes
 * (`normalizeRoleName = role.toLowerCase()`,
 * `node_modules/better-auth/dist/plugins/organization/routes/
 * crud-access-control.mjs`) the role name it actually stores, but
 * get/update/delete lookups on our side are case-sensitive with no
 * normalization. A mixed-case constant here would get stored lowercased by
 * `create-role` while every lookup below still queries the original mixed
 * case — so it would 404/`ROLE_NOT_FOUND` for EVERYONE, including org B's
 * own owner, not just a cross-org caller. That would make the cross-org
 * tenant-isolation case vacuous: it would "pass" because the name is never
 * found by anyone, not because org-scoping correctly rejected a cross-org
 * lookup. Keeping this already-lowercase avoids the mismatch entirely.
 */
export const ORG_B_ONLY_ROLE = "orgbonlyrole";

export type Actor = { userId: string; cookie: string };

export type SeededOrg = {
  organizationId: string;
  branchId: string;
  /** A second team/branch in this org, seeded via a real `POST /api/v1/branches` call — needed for a tenant-isolation case on `branches/[id]` that must target a REAL (not made-up) cross-org id. */
  secondBranchId: string;
  owner: Actor;
  member: Actor;
  supplierId: string;
  ingredientId: string;
  recipeId: string;
  /** One pending invitation, seeded via a real `POST /api/v1/invitations` call — needed for a permission-matrix case on `invitations/[id]` cancel and a tenant-isolation case on the same route. */
  invitationId: string;
  /** The Better Auth `Member` ROW id (not `owner.userId`) backing this org's owner membership — fetched via a real `GET /api/v1/members` call, since `createOrganization` doesn't return it directly. Needed for a tenant-isolation case on `members/[id]`, which takes a member row id, not a user id. */
  ownerMemberId: string;
};

export type TwoOrgsFixture = { orgA: SeededOrg; orgB: SeededOrg };

// ---------------------------------------------------------------------------
// low-level helpers (mirrors grant-ceiling.integration.test.ts's call()/createUser()/signIn())
// ---------------------------------------------------------------------------

async function authCall(path: string, body: unknown, cookie?: string) {
  const res = await authPost(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-forwarded-for": clientIp,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null, res };
}

async function createUser(label: string) {
  const ctx = await auth.$context;
  const email = `${label}-${runId}@${EMAIL_DOMAIN}`;
  const password = randomBytes(18).toString("base64url");
  const user = await ctx.internalAdapter.createUser(
    { email, name: label, emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(password),
  });
  // `twoFactorEnabled` is left false here on purpose — see `enableTwoFactor`'s
  // doc comment below for why it must not be set before this user's first
  // `signIn()`.
  return { userId: user.id, email, password };
}

/**
 * A3 (mandatory 2FA): withAuth 403s TWO_FACTOR_REQUIRED unless this is true.
 * Flipping it directly in the database is fine for test setup — real TOTP
 * enrollment isn't what these tests are about — but it MUST happen AFTER
 * this user's `signIn()`, never before.
 *
 * Why: Better Auth's `twoFactor` plugin registers an after-hook on
 * `/sign-in/email` (`node_modules/better-auth/dist/plugins/two-factor/
 * index.mjs`, roughly lines 244-328) that runs once the credential handler
 * has already created a real session. The hook reads
 * `ctx.context.newSession` — that just-created session — and, if
 * `newSession.user.twoFactorEnabled` is already `true`, DELETES the session
 * it just created (`deleteSessionCookie` + `internalAdapter.deleteSession`)
 * and replies `{ twoFactorRedirect: true }` instead of a usable session.
 * `deleteSessionCookie` calls `expireCookie`, which sends
 * `Set-Cookie: <name>=; Max-Age=0; ...` — an explicit deletion, not a
 * missing cookie. So signing in a user whose `twoFactorEnabled` is already
 * `true` silently produces NO usable session, and the very next call
 * (`/organization/set-active`) 401s and setup throws. Signing in first
 * (while the flag is still `false`, so the hook's `if` is false and it
 * returns immediately) gets a real session; only then is the flag flipped.
 */
async function enableTwoFactor(userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
}

async function signIn(email: string, password: string): Promise<string> {
  const { status, res } = await authCall("/sign-in/email", { email, password });
  if (status !== 200) throw new Error(`sign-in failed for ${email}: ${status}`);
  // Built via mergeSetCookies (not a naive Set-Cookie join) so that if this
  // sign-in DID hit the twoFactorRedirect path above (e.g. this helper is
  // ever called out of order again), the deleted session_token cookie is
  // dropped rather than kept as an empty `session_token=` entry — which
  // would otherwise still satisfy the `includes("session_token=")` check
  // below and mask the failure. See mergeSetCookies's doc comment.
  const cookie = mergeSetCookies("", res);
  if (!cookie.includes("session_token=")) {
    throw new Error(`sign-in for ${email} produced no session cookie`);
  }
  return cookie;
}

/**
 * Drops the cookie-cache cookie (`better-auth.session_data`, or
 * `__Secure-better-auth.session_data` behind https; possibly chunked as
 * `...session_data.0`, `.1`, ... for a large session) from a `Cookie`
 * header string. Must be called after `enableTwoFactor` and before any
 * further authenticated call for that user.
 *
 * Why: `cookieCache` is enabled (`src/server/auth/auth.ts`), so `signIn`'s
 * response also set a cache cookie snapshotting the user record AT SIGN-IN
 * TIME — i.e. with `twoFactorEnabled: false`, since `enableTwoFactor` hasn't
 * run yet. Better Auth's `sessionMiddleware` (`node_modules/better-auth/
 * dist/api/routes/session.mjs`, `getSessionFromCtx`) prefers that cache
 * cookie over a database read whenever it's present and not expired (up to
 * `cookieCache.maxAge`, 5 minutes by default) — so without this, every
 * subsequent `withAuth`-gated call would read the STALE cached
 * `twoFactorEnabled: false` and 403 with `TWO_FACTOR_REQUIRED` for the
 * cache's whole lifetime, even though the real database row is correct.
 * Dropping the cookie forces the next session read to fall back to the
 * database, which by then has the correct value.
 */
function dropSessionDataCookie(cookie: string): string {
  return cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const idx = part.indexOf("=");
      const name = (idx === -1 ? part : part.slice(0, idx)).toLowerCase();
      return !name.includes("session_data");
    })
    .join("; ");
}

/**
 * `withAuth` reads `session.session.activeOrganizationId` directly (not
 * via the organization plugin's own resolution), so every actor needs an
 * explicit `/organization/set-active` call after signing in — unlike the
 * owner's org-creation call (a server-side `userId` system action with no
 * session attached), nothing sets this automatically.
 */
async function setActiveOrganization(cookie: string, organizationId: string): Promise<string> {
  const { status, res } = await authCall("/organization/set-active", { organizationId }, cookie);
  if (status !== 200) throw new Error(`set-active failed for org ${organizationId}: ${status}`);
  return mergeSetCookies(cookie, res);
}

// ---------------------------------------------------------------------------
// one organization's worth of setup
// ---------------------------------------------------------------------------

async function buildOrg(label: "A" | "B"): Promise<SeededOrg> {
  const owner = await createUser(`owner${label}`);
  const org = await auth.api.createOrganization({
    body: {
      name: `Sec7 ${label} ${runId}`,
      slug: `${SLUG_PREFIX}${label.toLowerCase()}-${runId}`,
      userId: owner.userId,
    },
  });
  if (!org) throw new Error(`createOrganization failed for org ${label}`);
  const organizationId = org.id;

  const team = await db.team.findFirstOrThrow({
    where: { organizationId },
    select: { id: true },
  });
  const branchId = team.id;

  // Sign in BEFORE flipping twoFactorEnabled (see enableTwoFactor's doc
  // comment), then strip the stale cookie-cache cookie before the very next
  // authenticated call (see dropSessionDataCookie's doc comment).
  let ownerCookie = await signIn(owner.email, owner.password);
  await enableTwoFactor(owner.userId);
  ownerCookie = dropSessionDataCookie(ownerCookie);
  ownerCookie = await setActiveOrganization(ownerCookie, organizationId);

  // Define the restricted role (owner's own permission ceiling covers it —
  // owner holds everything, so this is never blocked by assertCanGrant).
  const roleResult = await authCall(
    "/organization/create-role",
    { organizationId, role: RESTRICTED_ROLE, permission: RESTRICTED_PERMISSION },
    ownerCookie,
  );
  if (roleResult.status !== 200) {
    throw new Error(`create-role failed for org ${label}: ${JSON.stringify(roleResult.body)}`);
  }

  // Org B only: a second custom role under a name org A never defines at
  // all (see ORG_B_ONLY_ROLE's doc comment above) — distinct from
  // RESTRICTED_ROLE, which both orgs define under the SAME name and so
  // can't exercise the "name doesn't exist in my org" cross-tenant case.
  if (label === "B") {
    const extraRoleResult = await authCall(
      "/organization/create-role",
      { organizationId, role: ORG_B_ONLY_ROLE, permission: RESTRICTED_PERMISSION },
      ownerCookie,
    );
    if (extraRoleResult.status !== 200) {
      throw new Error(`create-role (org-B-only) failed for org ${label}: ${JSON.stringify(extraRoleResult.body)}`);
    }
  }

  const restrictedUser = await createUser(`member${label}`);
  // addMember's type only lists the static roles ("owner"/"admin"/"member"),
  // but at runtime it stores any role string; dynamic roles resolve from
  // organizationRole on use — same cast grant-ceiling.integration.test.ts
  // uses for its own dynamic-role actors.
  const member = await auth.api.addMember({
    body: { userId: restrictedUser.userId, role: RESTRICTED_ROLE as "admin", organizationId },
  });
  if (!member) throw new Error(`addMember failed for org ${label}`);
  let memberCookie = await signIn(restrictedUser.email, restrictedUser.password);
  await enableTwoFactor(restrictedUser.userId);
  memberCookie = dropSessionDataCookie(memberCookie);
  memberCookie = await setActiveOrganization(memberCookie, organizationId);

  // Seed one Supplier, one Ingredient, one Recipe via the real POST routes,
  // as the owner. No x-branch-id needed: none of these three are branch-scoped.
  const supplierRes = await callRoute(suppliersPost as RouteHandler, {
    method: "POST",
    path: "/api/v1/suppliers",
    cookie: ownerCookie,
    body: { name: `Supplier ${label} ${runId}` },
  });
  if (supplierRes.status !== 201) {
    throw new Error(`seeding supplier failed for org ${label}: ${JSON.stringify(supplierRes.body)}`);
  }
  const supplierId = supplierRes.body!.id as string;

  const ingredientRes = await callRoute(ingredientsPost as RouteHandler, {
    method: "POST",
    path: "/api/v1/ingredients",
    cookie: ownerCookie,
    body: { name: `Ingredient ${label} ${runId}`, unit: "kg", supplierId },
  });
  if (ingredientRes.status !== 201) {
    throw new Error(`seeding ingredient failed for org ${label}: ${JSON.stringify(ingredientRes.body)}`);
  }
  const ingredientId = ingredientRes.body!.id as string;

  const recipeRes = await callRoute(recipesPost as RouteHandler, {
    method: "POST",
    path: "/api/v1/recipes",
    cookie: ownerCookie,
    body: {
      name: `Recipe ${label} ${runId}`,
      yieldQuantity: 1,
      yieldUnit: "batch",
      ingredients: [{ ingredientId, quantity: 1 }],
    },
  });
  if (recipeRes.status !== 201) {
    throw new Error(`seeding recipe failed for org ${label}: ${JSON.stringify(recipeRes.body)}`);
  }
  const recipeId = recipeRes.body!.id as string;

  // A second branch/team, via the real POST route — needed for a
  // tenant-isolation case on `branches/[id]` that must target a REAL (not
  // made-up) cross-org id, same "seeding IS a smoke test" rationale as the
  // Supplier/Ingredient/Recipe seeding above.
  const secondBranchRes = await callRoute(branchesPost as RouteHandler, {
    method: "POST",
    path: "/api/v1/branches",
    cookie: ownerCookie,
    body: { name: `Second Branch ${label} ${runId}` },
  });
  if (secondBranchRes.status !== 201) {
    throw new Error(`seeding second branch failed for org ${label}: ${JSON.stringify(secondBranchRes.body)}`);
  }
  const secondBranchId = secondBranchRes.body!.id as string;

  // One pending invitation, via the real POST route — needed for a
  // permission-matrix case on `invitations/[id]` cancel and a
  // tenant-isolation case on the same route. `role: "member"` (a static
  // role) keeps this independent of RESTRICTED_ROLE/ORG_B_ONLY_ROLE, and is
  // well within the owner's own grant ceiling (owner holds everything).
  const invitationRes = await callRoute(invitationsPost as RouteHandler, {
    method: "POST",
    path: "/api/v1/invitations",
    cookie: ownerCookie,
    body: { email: `invitee${label}-${runId}@${EMAIL_DOMAIN}`, role: "member" },
  });
  if (invitationRes.status !== 200) {
    throw new Error(`seeding invitation failed for org ${label}: ${JSON.stringify(invitationRes.body)}`);
  }
  const invitationId = invitationRes.body!.id as string;

  // The owner's own Member ROW id — needed by the members/[id] tenant-
  // isolation case, which targets a member row id, not a user id.
  // `createOrganization` doesn't return it, so it's fetched the same way
  // `MembersTable` (the real client) does: a real `GET /api/v1/members`
  // call, as the owner.
  const membersRes = await callRoute(membersGet as RouteHandler, {
    method: "GET",
    path: "/api/v1/members",
    cookie: ownerCookie,
  });
  if (membersRes.status !== 200) {
    throw new Error(`listing members failed for org ${label}: ${JSON.stringify(membersRes.body)}`);
  }
  const ownerMemberRow = (membersRes.body as unknown as Array<{ id: string; userId: string }>).find(
    (m) => m.userId === owner.userId,
  );
  if (!ownerMemberRow) throw new Error(`owner's own member row not found for org ${label}`);
  const ownerMemberId = ownerMemberRow.id;

  return {
    organizationId,
    branchId,
    secondBranchId,
    owner: { userId: owner.userId, cookie: ownerCookie },
    member: { userId: restrictedUser.userId, cookie: memberCookie },
    supplierId,
    ingredientId,
    recipeId,
    invitationId,
    ownerMemberId,
  };
}

// ---------------------------------------------------------------------------
// cleanup
// ---------------------------------------------------------------------------

/**
 * Domain tables (Supplier/Ingredient/StockMovement/Recipe/RecipeIngredient/
 * AuditLog) carry `organizationId` but have NO foreign key to Organization
 * (`AuditLog`'s doc comment: "No relations to Better Auth's tables on
 * purpose: audit rows must survive user/org deletion" — the others simply
 * don't declare one either), so deleting an Organization does NOT cascade
 * to them. They must be deleted explicitly, in FK-safe order: RecipeIngredient
 * cascades from Recipe, so deleting Recipe first covers it; StockMovement and
 * RecipeIngredient both have a required (Restrict-by-default) relation to
 * Ingredient, so Recipe and StockMovement must go before Ingredient.
 */
export async function cleanupTwoOrgs(): Promise<void> {
  // A plain SELECT: app_user has SELECT on every table (the RLS migrations
  // only ever revoke UPDATE/DELETE), so this is fine on the app's own `db`.
  const orgs = await db.organization.findMany({
    where: { slug: { startsWith: SLUG_PREFIX } },
    select: { id: true },
  });
  const organizationId = { in: orgs.map((o) => o.id) };
  if (orgs.length > 0) {
    // These five are the ones app_user cannot delete (see `ownerDb`'s doc
    // comment above), so they go through the owner-role client.
    await ownerDb.recipe.deleteMany({ where: { organizationId } });
    await ownerDb.stockMovement.deleteMany({ where: { organizationId } });
    await ownerDb.ingredient.deleteMany({ where: { organizationId } });
    await ownerDb.supplier.deleteMany({ where: { organizationId } });
    await ownerDb.auditLog.deleteMany({ where: { organizationId } });
  }
  // Better Auth tables: app_user keeps full DML on these (never revoked),
  // so the app's own `db` is correct here, not ownerDb.
  await db.organization.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } }); // cascades members, roles, teams, invitations
  await db.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } }); // cascades sessions, accounts, teamMembers
  await db.rateLimit.deleteMany({ where: { key: { startsWith: IP_PREFIX } } });
}

/** `beforeAll`: clean up any aborted prior run, then build both organizations. */
export async function setupTwoOrgs(): Promise<TwoOrgsFixture> {
  await cleanupTwoOrgs();
  // Sequential, not Promise.all: both orgs share one clientIp (for the A7
  // rate-limit buckets to stay identifiable per run), and interleaving two
  // sign-in/role-creation flows on it adds nothing but risk of a flaky
  // ordering assumption somewhere in Better Auth's own state.
  const orgA = await buildOrg("A");
  const orgB = await buildOrg("B");
  return { orgA, orgB };
}

/**
 * `afterAll`: delete everything this fixture created, then release both
 * database connections (the app's own `db` and the owner-role `ownerDb`
 * created above) — matching `grant-ceiling.integration.test.ts`'s /
 * `db.integration.test.ts`'s own teardown convention. This is the one place
 * both `tenant-isolation.integration.test.ts` and `permission-matrix.
 * integration.test.ts` call as the last step of their own `afterAll`, so
 * disconnecting here covers both.
 */
export async function teardownTwoOrgs(): Promise<void> {
  await cleanupTwoOrgs();
  await ownerDb.$disconnect();
  await db.$disconnect();
}
