// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { BETTER_AUTH_URL: "https://app.example.com", NODE_ENV: "production" },
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
      hasPermission: vi.fn(),
      getActiveMemberRole: vi.fn(),
      listUserTeams: vi.fn(),
      listOrganizationTeams: vi.fn(),
    },
    // Mirrors auth.ts's real `session.freshAge` (10m) so withAuth's
    // FRESH_AGE_SECONDS — read off `auth.options.session?.freshAge` — sees
    // the same value it would in production instead of drifting silently.
    options: { session: { freshAge: 60 * 10 } },
  },
}));

const fakeDb = { __fakeTenantDb: true };
vi.mock("@/server/db", () => ({
  forTenant: vi.fn(() => fakeDb),
}));

import { auth } from "@/server/auth/auth";
import { forTenant } from "@/server/db";
import { isWithAuthHandler, withAuth, type RequestCtx } from "./with-auth";

const getSession = vi.mocked(auth.api.getSession);
const hasPermission = vi.mocked(auth.api.hasPermission);
const getActiveMemberRole = vi.mocked(auth.api.getActiveMemberRole);
const listUserTeams = vi.mocked(auth.api.listUserTeams);
const listOrganizationTeams = vi.mocked(auth.api.listOrganizationTeams);
const forTenantMock = vi.mocked(forTenant);

// Real return types of the (mocked) better-auth endpoints, so test fixtures
// below are typed without resorting to `any`.
type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;
type HasPermissionResult = Awaited<ReturnType<typeof auth.api.hasPermission>>;
type ActiveMemberRoleResult = Awaited<ReturnType<typeof auth.api.getActiveMemberRole>>;
type ListUserTeamsResult = Awaited<ReturnType<typeof auth.api.listUserTeams>>;

const ORG = "org-1";

/** A fully-valid session: 2FA enrolled, fresh, active org — the control every failing test deviates from. */
function validSession(
  overrides: {
    twoFactorEnabled?: boolean;
    activeOrganizationId?: string | null;
    createdAt?: Date;
  } = {},
): NonNullable<SessionResult> {
  return {
    session: {
      id: "sess-1",
      createdAt: overrides.createdAt ?? new Date(),
      activeOrganizationId:
        overrides.activeOrganizationId === undefined ? ORG : overrides.activeOrganizationId,
    },
    user: {
      id: "user-1",
      twoFactorEnabled: overrides.twoFactorEnabled ?? true,
    },
  } as unknown as NonNullable<SessionResult>;
}

function permissionResult(success: boolean): HasPermissionResult {
  return { error: null, success } as unknown as HasPermissionResult;
}

function roleResult(role: string): ActiveMemberRoleResult {
  return { role } as unknown as ActiveMemberRoleResult;
}

function teamsResult(ids: string[]): ListUserTeamsResult {
  return ids.map((id) => ({ id })) as unknown as ListUserTeamsResult;
}

/** A handler whose calls can be inspected with a real `ctx` type, instead of `vi.fn()`'s default `[]` args. */
function handlerSpy(impl: (req: Request, ctx: RequestCtx) => Promise<Response> = async () =>
  Response.json({ ok: true }),
) {
  return vi.fn(impl);
}

function req(method: string, headers: Record<string, string> = {}): Request {
  return new Request("https://app.example.com/api/v1/products", { method, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(validSession());
  hasPermission.mockResolvedValue(permissionResult(true));
  getActiveMemberRole.mockResolvedValue(roleResult("cashier"));
  listUserTeams.mockResolvedValue(teamsResult([]));
  listOrganizationTeams.mockResolvedValue(teamsResult([]));
});

async function statusAndBody(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("withAuth", () => {
  it("returns 401 when there is no session", async () => {
    getSession.mockResolvedValue(null);
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const res = await wrapped(req("GET"));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("UNAUTHORIZED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 TWO_FACTOR_REQUIRED when the user hasn't enrolled 2FA", async () => {
    getSession.mockResolvedValue(validSession({ twoFactorEnabled: false }));
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const { status, body } = await statusAndBody(await wrapped(req("GET")));

    expect(status).toBe(403);
    expect(body.error).toBe("TWO_FACTOR_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 NO_ACTIVE_ORGANIZATION when the session has no active org", async () => {
    getSession.mockResolvedValue(validSession({ activeOrganizationId: null }));
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const { status, body } = await statusAndBody(await wrapped(req("GET")));

    expect(status).toBe(403);
    expect(body.error).toBe("NO_ACTIVE_ORGANIZATION");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 PERMISSION_DENIED when hasPermission denies the declared permission", async () => {
    hasPermission.mockResolvedValue(permissionResult(false));
    const handler = handlerSpy();
    const wrapped = withAuth({ permission: { product: ["create"] } }, handler);

    const { status, body } = await statusAndBody(await wrapped(req("GET")));

    expect(status).toBe(403);
    expect(body.error).toBe("PERMISSION_DENIED");
    expect(handler).not.toHaveBeenCalled();
    expect(hasPermission).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { organizationId: ORG, permissions: { product: ["create"] } },
    });
  });

  it("returns 403 BRANCH_NOT_A_MEMBER when x-branch-id names a branch the caller isn't on", async () => {
    getActiveMemberRole.mockResolvedValue(roleResult("cashier"));
    listUserTeams.mockResolvedValue(teamsResult(["branch-2"]));
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const { status, body } = await statusAndBody(
      await wrapped(req("GET", { "x-branch-id": "branch-1" })),
    );

    expect(status).toBe(403);
    expect(body.error).toBe("BRANCH_NOT_A_MEMBER");
    expect(handler).not.toHaveBeenCalled();
  });

  it("scopes listUserTeams to the active organization, not a cross-org self-query", async () => {
    // Regression guard for B3: calling listUserTeams with no `query` returns
    // the caller's teams across *every* organization they belong to
    // (better-auth@1.7.6 crud-team.mjs), which would let a branch id from a
    // different org the caller also belongs to pass this check.
    getActiveMemberRole.mockResolvedValue(roleResult("cashier"));
    listUserTeams.mockResolvedValue(teamsResult(["branch-1"]));
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const res = await wrapped(req("GET", { "x-branch-id": "branch-1" }));

    expect(res.status).toBe(200);
    expect(listUserTeams).toHaveBeenCalledWith(
      expect.objectContaining({ query: { organizationId: ORG } }),
    );
  });

  it("allows an org-wide role (owner/admin) to use x-branch-id for a branch in their own org, without personal team membership", async () => {
    getActiveMemberRole.mockResolvedValue(roleResult("owner"));
    listUserTeams.mockResolvedValue(teamsResult([])); // not personally on this team
    listOrganizationTeams.mockResolvedValue(teamsResult(["branch-1"])); // but it's a real team in their org
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const res = await wrapped(req("GET", { "x-branch-id": "branch-1" }));

    expect(res.status).toBe(200);
    expect(listUserTeams).not.toHaveBeenCalled();
    expect(listOrganizationTeams).toHaveBeenCalledWith(
      expect.objectContaining({ query: { organizationId: ORG } }),
    );
    const ctx = handler.mock.calls[0][1];
    expect(ctx.branchId).toBe("branch-1");
  });

  it("returns 403 BRANCH_NOT_A_MEMBER for an org-wide role when x-branch-id names a team not in their own org", async () => {
    // Regression test for the bug: an org-wide caller used to get zero
    // verification on x-branch-id, so a team id from a different org (or a
    // nonexistent id) flowed straight through. listOrganizationTeams is
    // scoped to the active org, so a team that belongs to another org (or
    // doesn't exist at all) simply isn't in this list.
    getActiveMemberRole.mockResolvedValue(roleResult("owner"));
    listOrganizationTeams.mockResolvedValue(teamsResult(["branch-in-other-org"]));
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const { status, body } = await statusAndBody(
      await wrapped(req("GET", { "x-branch-id": "branch-1" })),
    );

    expect(status).toBe(403);
    expect(body.error).toBe("BRANCH_NOT_A_MEMBER");
    expect(handler).not.toHaveBeenCalled();
    expect(listUserTeams).not.toHaveBeenCalled();
  });

  it("returns 400 BRANCH_REQUIRED when branchScoped is true and x-branch-id is absent", async () => {
    const handler = handlerSpy();
    const wrapped = withAuth({ branchScoped: true }, handler);

    const { status, body } = await statusAndBody(await wrapped(req("GET")));

    expect(status).toBe(400);
    expect(body.error).toBe("BRANCH_REQUIRED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 FOREIGN_ORIGIN on a POST from an untrusted Origin", async () => {
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const { status, body } = await statusAndBody(
      await wrapped(
        req("POST", { origin: "https://evil.example.com", "content-type": "application/json" }),
      ),
    );

    expect(status).toBe(403);
    expect(body.error).toBe("FOREIGN_ORIGIN");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 415 on a POST with a non-JSON Content-Type", async () => {
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const { status, body } = await statusAndBody(
      await wrapped(req("POST", { origin: "https://app.example.com", "content-type": "text/plain" })),
    );

    expect(status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets a POST with a trusted Origin and JSON Content-Type through", async () => {
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const res = await wrapped(
      req("POST", { origin: "https://app.example.com", "content-type": "application/json" }),
    );

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns 403 SESSION_NOT_FRESH when fresh:true and the session is old", async () => {
    getSession.mockResolvedValue(
      validSession({ createdAt: new Date(Date.now() - 20 * 60 * 1000) }), // 20 min > 10 min freshAge
    );
    const handler = handlerSpy();
    const wrapped = withAuth({ fresh: true }, handler);

    const { status, body } = await statusAndBody(await wrapped(req("GET")));

    expect(status).toBe(403);
    expect(body.error).toBe("SESSION_NOT_FRESH");
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets fresh:true through when the session is recent", async () => {
    getSession.mockResolvedValue(
      validSession({ createdAt: new Date(Date.now() - 60 * 1000) }), // 1 min < 10 min freshAge
    );
    const handler = handlerSpy();
    const wrapped = withAuth({ fresh: true }, handler);

    const res = await wrapped(req("GET"));

    expect(res.status).toBe(200);
  });

  it("returns an opaque 500 with no leaked message when the handler throws an unknown error", async () => {
    const handler = handlerSpy(async () => {
      throw new Error("db password=hunter2");
    });
    const wrapped = withAuth({}, handler);

    const { status, body } = await statusAndBody(await wrapped(req("GET")));

    expect(status).toBe(500);
    expect(body).toEqual({ error: "INTERNAL", requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("builds ctx from the session and calls handler with it, tenant-scoped via forTenant", async () => {
    getActiveMemberRole.mockResolvedValue(roleResult("owner"));
    listOrganizationTeams.mockResolvedValue(teamsResult(["branch-1"]));
    const handler = handlerSpy();
    const wrapped = withAuth({ permission: { product: ["read"] } }, handler);

    await wrapped(req("GET", { "x-branch-id": "branch-1" }));

    expect(handler).toHaveBeenCalledTimes(1);
    const ctx = handler.mock.calls[0][1];
    expect(ctx.userId).toBe("user-1");
    expect(ctx.organizationId).toBe(ORG);
    expect(ctx.branchId).toBe("branch-1");
    expect(ctx.requestId).toBeTypeOf("string");
    expect(ctx.db).toBe(fakeDb);
    expect(forTenantMock).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: ORG,
      branchId: "branch-1",
    });
  });

  it("leaves branchId null when no x-branch-id header is sent and branchScoped isn't required", async () => {
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    await wrapped(req("GET"));

    const ctx = handler.mock.calls[0][1];
    expect(ctx.branchId).toBeNull();
    expect(getActiveMemberRole).not.toHaveBeenCalled();
    expect(listUserTeams).not.toHaveBeenCalled();
  });

  it("forwards resolved route params to the handler as a third argument", async () => {
    const handler = vi.fn(
      async (_req: Request, _ctx: RequestCtx, _params: { id: string }) =>
        Response.json({ ok: true }),
    );
    const wrapped = withAuth<{ id: string }>({}, handler);

    const res = await wrapped(req("GET"), { params: Promise.resolve({ id: "abc123" }) });

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][2]).toEqual({ id: "abc123" });
  });

  it("resolves params to {} when no routeContext is passed (non-parameterized route)", async () => {
    const handler = handlerSpy();
    const wrapped = withAuth({}, handler);

    const res = await wrapped(req("GET"));

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  describe("isWithAuthHandler", () => {
    it("returns true for a withAuth-wrapped handler", () => {
      const wrapped = withAuth({}, handlerSpy());
      expect(isWithAuthHandler(wrapped)).toBe(true);
    });

    it("returns false for a bare, unwrapped function", () => {
      expect(isWithAuthHandler(() => {})).toBe(false);
    });

    it("returns false (without throwing) for non-function values", () => {
      expect(isWithAuthHandler(undefined)).toBe(false);
      expect(isWithAuthHandler(42)).toBe(false);
    });
  });
});
