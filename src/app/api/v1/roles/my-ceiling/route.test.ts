// @vitest-environment node
/**
 * Route-level test: proves `GET /api/v1/roles/my-ceiling` has no resource
 * permission gate (any authenticated member can read their own ceiling) and
 * reaches the real service, which reuses `effectivePermissions` rather than
 * reimplementing resolution logic (that part is proven in
 * `src/features/roles/server/service.test.ts`).
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
    },
    options: { session: { freshAge: 60 * 10 } },
    $context: Promise.resolve({ fake: "auth-context" }),
  },
  organizationOptions: {},
}));

vi.mock("@/server/auth/grant-ceiling-hook", () => ({
  effectivePermissions: vi.fn().mockResolvedValue({ order: ["create", "read"] }),
}));

const fakeDb = { auditLog: { create: vi.fn() } };
vi.mock("@/server/db", () => ({
  forTenant: vi.fn(() => fakeDb),
}));

import { auth } from "@/server/auth/auth";
import { GET } from "./route";

const getSession = vi.mocked(auth.api.getSession);
const hasPermission = vi.mocked(auth.api.hasPermission);
const getActiveMemberRole = vi.mocked(auth.api.getActiveMemberRole);

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

const ORG = "org-1";

function validSession(): NonNullable<SessionResult> {
  return {
    session: { id: "sess-1", createdAt: new Date(), activeOrganizationId: ORG },
    user: { id: "caller-1", twoFactorEnabled: true },
  } as unknown as NonNullable<SessionResult>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(validSession());
  hasPermission.mockResolvedValue({ error: null, success: true } as unknown as Awaited<
    ReturnType<typeof auth.api.hasPermission>
  >);
  getActiveMemberRole.mockResolvedValue({ role: "admin" } as never);
});

describe("GET /api/v1/roles/my-ceiling", () => {
  it("returns 200 with the caller's effective permissions, with no resource-permission gate", async () => {
    const res = await GET(new Request("https://app.example.com/api/v1/roles/my-ceiling"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ order: ["create", "read"] });
  });

  it("still requires a session (401) like every other withAuth route", async () => {
    getSession.mockResolvedValue(null);

    const res = await GET(new Request("https://app.example.com/api/v1/roles/my-ceiling"));

    expect(res.status).toBe(401);
  });
});
