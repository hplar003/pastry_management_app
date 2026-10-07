// @vitest-environment node
/**
 * Route-level test (real handler + real `withAuth` + real `toErrorResponse`),
 * following `src/app/api/v1/members/[id]/route.test.ts`'s pattern: a
 * Better-Auth-rejected role mutation must surface as a clean 4xx `Response`,
 * not an opaque 500.
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
      listOrgRoles: vi.fn(),
      createOrgRole: vi.fn(),
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
import { GET, POST } from "./route";

const getSession = vi.mocked(auth.api.getSession);
const hasPermission = vi.mocked(auth.api.hasPermission);
const createOrgRole = vi.mocked(auth.api.createOrgRole);

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

const ORG = "org-1";

function validSession(): NonNullable<SessionResult> {
  return {
    session: {
      id: "sess-1",
      createdAt: new Date(), // fresh
      activeOrganizationId: ORG,
    },
    user: {
      id: "caller-1",
      twoFactorEnabled: true,
    },
  } as unknown as NonNullable<SessionResult>;
}

function postRequest(body: unknown): Request {
  return new Request("https://app.example.com/api/v1/roles", {
    method: "POST",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
    body: JSON.stringify(body),
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
});

describe("GET /api/v1/roles", () => {
  it("is unaffected by this task's changes (still just role names)", async () => {
    vi.mocked(auth.api.listOrgRoles).mockResolvedValue([]);
    const res = await GET(new Request("https://app.example.com/api/v1/roles"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/roles", () => {
  it("returns a clean 4xx, not a 500, when Better Auth's A6 hook rejects a ceiling-exceeding permission payload", async () => {
    createOrgRole.mockRejectedValue(
      new APIError("FORBIDDEN", { code: "GRANT_EXCEEDS_OWN", message: "exceeds ceiling" }),
    );

    const res = await POST(postRequest({ role: "cashier", permission: { order: ["create"] } }));
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("GRANT_EXCEEDS_OWN");
  });

  it("returns a clean 400, not a 500, when the body's permission vocabulary is invalid (never reaching Better Auth)", async () => {
    const res = await POST(postRequest({ role: "cashier", permission: { notARealResource: ["x"] } }));
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION");
    expect(createOrgRole).not.toHaveBeenCalled();
  });

  it("returns 201 with the created role on success", async () => {
    createOrgRole.mockResolvedValue({
      roleData: { id: "role1", role: "cashier", permission: { order: ["create"] } },
    } as never);

    const res = await POST(postRequest({ role: "cashier", permission: { order: ["create"] } }));
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(201);
    expect(body.role).toBe("cashier");
  });

  it("returns 403 SESSION_NOT_FRESH when the session isn't fresh, before ever calling createOrgRole", async () => {
    getSession.mockResolvedValue({
      ...validSession(),
      session: { ...validSession().session, createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    } as unknown as NonNullable<SessionResult>);

    const res = await POST(postRequest({ role: "cashier", permission: { order: ["create"] } }));
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("SESSION_NOT_FRESH");
    expect(createOrgRole).not.toHaveBeenCalled();
  });
});
