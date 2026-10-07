/**
 * End-to-end test of security plan control A6 (role-grant ceiling) against a
 * REAL Better Auth instance on a REAL Neon branch (see
 * vitest.integration.config.mts). Run with `npm run test:integration`.
 *
 * grant-ceiling-hook.test.ts proves the hook's decision logic with a faked
 * session and a fake adapter. This file proves the WIRING: requests go
 * through the app's actual /api/auth route handler (`POST` from
 * src/app/api/auth/[...all]/route.ts) with a real session cookie obtained by
 * a real sign-in, so the hook registration in auth.ts, createAuthMiddleware,
 * the real session lookup, real dynamic roles stored in `organizationRole`,
 * and the plugin endpoint behind it are all exercised.
 *
 * The scenario is a gap the hook closes that Better Auth 1.7.6 does NOT close
 * itself: `invite-member` and `update-member-role` only check that the caller
 * may invite/update members, not that the role being handed out is within the
 * caller's own permissions. An admin (no `ac:create`) could otherwise hand
 * out a custom role that carries `ac:create`. A canary test below runs the
 * same invite against a hook-less instance to prove the gap is real (so the
 * 403 here is the hook's, not the plugin's).
 *
 * (The security plan's original example, admin create-role with
 * organization:delete, is stopped by the plugin's own `ac:create` check, and
 * 1.7.6's create-role also rejects permissions the caller lacks. The
 * create-role case below still asserts the HOOK's error code, proving it
 * runs first on that path.)
 *
 * Isolation: every row belongs to a per-run organization/users with a unique
 * prefix, requests carry a per-run client IP so rate-limit buckets are fresh
 * and identifiable, and everything is deleted in afterAll (and leftovers from
 * an aborted run in beforeAll).
 */
import { randomBytes } from "node:crypto";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { organization } from "better-auth/plugins/organization";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/auth/[...all]/route";
import { auth } from "@/server/auth/auth";
import { ac, roles } from "@/server/auth/permissions";
import { db } from "@/server/db";

const EMAIL_DOMAIN = "a6.integration.test";
const SLUG_PREFIX = "itest-a6-";
const IP_PREFIX = "198.18."; // RFC 2544 benchmarking range: never a real client

const runId = randomBytes(4).toString("hex");
const clientIp = `${IP_PREFIX}${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const origin = new URL(process.env.BETTER_AUTH_URL!).origin;

/** Dynamic roles stored in organizationRole (not in permissions.ts). */
const CASHIER = { order: ["create", "read"] };
const ROLE_EDITOR = { ac: ["read", "create"], product: ["read"] };

type Actor = { userId: string; memberId: string; cookie: string };
let organizationId: string;
let ownerA: Actor;
let adminA: Actor;
let editorA: Actor;
let staffA: Actor;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function call(
  path: string,
  body: unknown,
  cookie?: string,
  handler: (req: Request) => Promise<Response> = POST,
) {
  const res = await handler(
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
    { method: "admin" }, // operator provisioning, as in prisma/seed.ts
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await hashPassword(password),
  });
  return { userId: user.id, email, password };
}

/** Real sign-in through the route handler; returns the Cookie header to send back. */
async function signIn(email: string, password: string) {
  const { status, res } = await call("/sign-in/email", { email, password });
  expect(status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token=");
  return cookie;
}

async function addActor(label: string, role: string): Promise<Actor> {
  const u = await createUser(label);
  // addMember's type only lists the static roles, but at runtime it stores
  // any role string; dynamic roles resolve from organizationRole on use.
  const member = await auth.api.addMember({
    body: { userId: u.userId, role: role as "admin", organizationId },
  });
  if (!member) throw new Error(`addMember failed for ${label}`);
  return { userId: u.userId, memberId: member.id, cookie: await signIn(u.email, u.password) };
}

async function cleanup() {
  await db.organization.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } }); // cascades members, roles, teams, invitations
  await db.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } }); // cascades sessions, accounts
  await db.rateLimit.deleteMany({ where: { key: { startsWith: IP_PREFIX } } });
}

// ---------------------------------------------------------------------------
// setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await cleanup();

  const owner = await createUser("owner");
  // Server-side system action, exactly as prisma/seed.ts provisions an org.
  const org = await auth.api.createOrganization({
    body: { name: `A6 ${runId}`, slug: `${SLUG_PREFIX}${runId}`, userId: owner.userId },
  });
  if (!org) throw new Error("createOrganization failed");
  organizationId = org.id;
  const ownerMember = await db.member.findFirstOrThrow({
    where: { organizationId, userId: owner.userId },
    select: { id: true, role: true },
  });
  expect(ownerMember.role).toBe("owner");
  ownerA = { userId: owner.userId, memberId: ownerMember.id, cookie: await signIn(owner.email, owner.password) };

  // The owner defines the dynamic roles over HTTP: the hook lets an owner
  // through (control for the owner path).
  for (const [role, permission] of [
    ["cashier", CASHIER],
    ["role-editor", ROLE_EDITOR],
  ] as const) {
    const r = await call("/organization/create-role", { organizationId, role, permission }, ownerA.cookie);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }

  adminA = await addActor("admin", "admin");
  editorA = await addActor("editor", "role-editor");
  staffA = await addActor("staff", "cashier");
});

afterAll(async () => {
  await cleanup();
  expect(await db.organization.count({ where: { slug: { startsWith: SLUG_PREFIX } } })).toBe(0);
  expect(await db.user.count({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } })).toBe(0);
  expect(await db.rateLimit.count({ where: { key: { startsWith: IP_PREFIX } } })).toBe(0);
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("A6 grant ceiling, end to end through /api/auth", () => {
  it("canary: WITHOUT the hook, Better Auth lets an admin invite with a role carrying ac:create", async () => {
    // Same database, secret and organization config as auth.ts, minus the A6
    // hook. If Better Auth ever closes this gap itself, this test fails and
    // tells us the hook's invite-member guard is now defence in depth only.
    const hookless = betterAuth({
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL,
      database: prismaAdapter(db, { provider: "postgresql" }),
      emailAndPassword: { enabled: true, disableSignUp: true },
      rateLimit: { enabled: false },
      plugins: [
        organization({
          ac,
          roles,
          creatorRole: "owner",
          teams: { enabled: true },
          dynamicAccessControl: { enabled: true },
        }),
      ],
    });
    const email = `canary-invitee-${runId}@${EMAIL_DOMAIN}`;
    const r = await call(
      "/organization/invite-member",
      { organizationId, email, role: "role-editor" },
      adminA.cookie,
      (req) => hookless.handler(req),
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await db.invitation.count({ where: { organizationId, email } })).toBe(1);
  });

  it("blocks an admin inviting someone with a role carrying ac:create (GRANT_EXCEEDS_OWN)", async () => {
    const email = `invitee-escalate-${runId}@${EMAIL_DOMAIN}`;
    const r = await call("/organization/invite-member", { organizationId, email, role: "role-editor" }, adminA.cookie);
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe("GRANT_EXCEEDS_OWN");
    expect(await db.invitation.count({ where: { organizationId, email } })).toBe(0);
  });

  it("control: lets the same admin invite with a dynamic role within their permissions", async () => {
    const email = `invitee-ok-${runId}@${EMAIL_DOMAIN}`;
    const r = await call("/organization/invite-member", { organizationId, email, role: "cashier" }, adminA.cookie);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await db.invitation.count({ where: { organizationId, email } })).toBe(1);
  });

  it("blocks an admin promoting a member to a role carrying ac:create (GRANT_EXCEEDS_OWN)", async () => {
    const r = await call(
      "/organization/update-member-role",
      { organizationId, memberId: staffA.memberId, role: "role-editor" },
      adminA.cookie,
    );
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe("GRANT_EXCEEDS_OWN");
    const staff = await db.member.findUniqueOrThrow({ where: { id: staffA.memberId }, select: { role: true } });
    expect(staff.role).toBe("cashier");
  });

  it("blocks an admin changing their own membership (CANNOT_MODIFY_SELF)", async () => {
    const r = await call(
      "/organization/update-member-role",
      { organizationId, memberId: adminA.memberId, role: "cashier" },
      adminA.cookie,
    );
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe("CANNOT_MODIFY_SELF");
    const admin = await db.member.findUniqueOrThrow({ where: { id: adminA.memberId }, select: { role: true } });
    expect(admin.role).toBe("admin");
  });

  it("blocks a role-editor (holds ac:create) creating a role beyond their own permissions, with the hook's code", async () => {
    // The caller's permissions come from a DB-only dynamic role, loaded by the
    // real adapter. GRANT_EXCEEDS_OWN is the hook's code (the plugin's own
    // check would say YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE), so the hook ran.
    const r = await call(
      "/organization/create-role",
      { organizationId, role: `escalated-${runId}`, permission: { product: ["read", "delete"] } },
      editorA.cookie,
    );
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe("GRANT_EXCEEDS_OWN");
    expect(await db.organizationRole.count({ where: { organizationId, role: `escalated-${runId}` } })).toBe(0);
  });

  it("control: lets the role-editor create a role within their own permissions", async () => {
    const role = `reader-${runId}`;
    const r = await call(
      "/organization/create-role",
      { organizationId, role, permission: { product: ["read"] } },
      editorA.cookie,
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await db.organizationRole.count({ where: { organizationId, role } })).toBe(1);
  });

  it("rejects a guarded call with no session (401)", async () => {
    const r = await call("/organization/invite-member", {
      organizationId,
      email: `anon-${runId}@${EMAIL_DOMAIN}`,
      role: "cashier",
    });
    expect(r.status).toBe(401);
  });
});
