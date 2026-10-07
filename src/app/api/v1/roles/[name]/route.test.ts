// @vitest-environment node
/**
 * Route-level test (real handler + real `withAuth` + real `toErrorResponse`),
 * following `src/app/api/v1/members/[id]/route.test.ts`'s pattern.
 */
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
      updateOrgRole: vi.fn(),
      deleteOrgRole: vi.fn(),
      getOrgRole: vi.fn(),
    },
    options: { session: { freshAge: 60 * 10 } },
  },
  organizationOptions: {},
}));

const fakeDb = { auditLog: { create: vi.fn() } };
vi.mock("@/server/db", () => ({
  forTenant: vi.fn(() => fakeDb),
}));

import { APIError } from "better-auth/api";
import { auth } from "@/server/auth/auth";
import { DELETE, GET, PATCH } from "./route";

const getSession = vi.mocked(auth.api.getSession);
const hasPermission = vi.mocked(auth.api.hasPermission);
const updateOrgRole = vi.mocked(auth.api.updateOrgRole);
const deleteOrgRole = vi.mocked(auth.api.deleteOrgRole);
const getOrgRole = vi.mocked(auth.api.getOrgRole);

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

const ORG = "org-1";

function validSession(): NonNullable<SessionResult> {
  return {
    session: { id: "sess-1", createdAt: new Date(), activeOrganizationId: ORG },
    user: { id: "caller-1", twoFactorEnabled: true },
  } as unknown as NonNullable<SessionResult>;
}

function patchRequest(name: string, body: unknown): Request {
  return new Request(`https://app.example.com/api/v1/roles/${name}`, {
    method: "PATCH",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(name: string): Request {
  return new Request(`https://app.example.com/api/v1/roles/${name}`, {
    method: "DELETE",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
  });
}

async function statusAndBody(res: Response) {
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(validSession());
  hasPermission.mockResolvedValue({ error: null, success: true } as unknown as Awaited<
    ReturnType<typeof auth.api.hasPermission>
  >);
  getOrgRole.mockResolvedValue({ role: "cashier", permission: {} } as never);
});

describe("GET /api/v1/roles/[name]", () => {
  it("returns 200 with the role's permission payload", async () => {
    getOrgRole.mockResolvedValue({ id: "role1", role: "cashier", permission: { order: ["create"] } } as never);

    const res = await GET(new Request("https://app.example.com/api/v1/roles/cashier"), {
      params: Promise.resolve({ name: "cashier" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(200);
    expect(body).toEqual({ id: "role1", role: "cashier", permission: { order: ["create"] } });
  });
});

describe("PATCH /api/v1/roles/[name]", () => {
  it("returns a clean 4xx, not a 500, when Better Auth's A6 hook rejects a ceiling-exceeding permission payload", async () => {
    updateOrgRole.mockRejectedValue(
      new APIError("FORBIDDEN", { code: "GRANT_EXCEEDS_OWN", message: "exceeds ceiling" }),
    );

    const res = await PATCH(patchRequest("cashier", { permission: { order: ["create"] } }), {
      params: Promise.resolve({ name: "cashier" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("GRANT_EXCEEDS_OWN");
  });

  it("returns 200 with the updated role on success", async () => {
    updateOrgRole.mockResolvedValue({
      roleData: { id: "role1", role: "cashier", permission: { order: ["create", "read"] } },
    } as never);

    const res = await PATCH(patchRequest("cashier", { permission: { order: ["create", "read"] } }), {
      params: Promise.resolve({ name: "cashier" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(200);
    expect(body.permission).toEqual({ order: ["create", "read"] });
  });

  it("returns 403 SESSION_NOT_FRESH before ever calling updateOrgRole", async () => {
    getSession.mockResolvedValue({
      ...validSession(),
      session: { ...validSession().session, createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    } as unknown as NonNullable<SessionResult>);

    const res = await PATCH(patchRequest("cashier", { permission: { order: ["create"] } }), {
      params: Promise.resolve({ name: "cashier" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("SESSION_NOT_FRESH");
    expect(updateOrgRole).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/roles/[name]", () => {
  it("returns a clean 4xx, not a 500, when Better Auth rejects deleting a role still assigned to a member", async () => {
    deleteOrgRole.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "ROLE_IS_ASSIGNED_TO_MEMBERS", message: "in use" }),
    );

    const res = await DELETE(deleteRequest("cashier"), {
      params: Promise.resolve({ name: "cashier" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("ROLE_IS_ASSIGNED_TO_MEMBERS");
  });

  it("returns a clean 4xx, not a 500, when Better Auth rejects deleting a predefined role", async () => {
    deleteOrgRole.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "CANNOT_DELETE_A_PRE_DEFINED_ROLE", message: "predefined" }),
    );

    const res = await DELETE(deleteRequest("owner"), {
      params: Promise.resolve({ name: "owner" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("CANNOT_DELETE_A_PRE_DEFINED_ROLE");
  });

  it("returns 204 on a successful deletion", async () => {
    deleteOrgRole.mockResolvedValue(undefined as never);

    const res = await DELETE(deleteRequest("cashier"), {
      params: Promise.resolve({ name: "cashier" }),
    });

    expect(res.status).toBe(204);
  });
});
