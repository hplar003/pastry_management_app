// @vitest-environment node
/**
 * Route-level test (real handler + real `withAuth` + real `toErrorResponse`),
 * not just a service-level mock test — closes the gap Task 3's review
 * flagged: a Better-Auth-rejected mutation (here, "can't remove the last
 * owner") must surface as a clean 4xx `Response`, not an opaque 500. Follows
 * `src/server/http/with-auth.test.ts`'s own pattern: mock `@/server/auth/auth`
 * and `@/server/db`, then invoke the actual exported route handler with a
 * real `Request`.
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
      listMembers: vi.fn(),
      removeMember: vi.fn(),
      updateMemberRole: vi.fn(),
    },
    // Mirrors auth.ts's real `session.freshAge` (10m) — see with-auth.test.ts.
    options: { session: { freshAge: 60 * 10 } },
    $context: Promise.resolve({
      internalAdapter: { deleteUserSessions: vi.fn() },
    }),
  },
}));

const fakeDb = { auditLog: { create: vi.fn() } };
vi.mock("@/server/db", () => ({
  forTenant: vi.fn(() => fakeDb),
}));

import { APIError } from "better-auth/api";
import { auth } from "@/server/auth/auth";
import { DELETE, PATCH } from "./route";

const getSession = vi.mocked(auth.api.getSession);
const hasPermission = vi.mocked(auth.api.hasPermission);
const listMembers = vi.mocked(auth.api.listMembers);
const removeMember = vi.mocked(auth.api.removeMember);
const updateMemberRole = vi.mocked(auth.api.updateMemberRole);

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

const member1 = {
  id: "member1",
  userId: "user1",
  organizationId: ORG,
  role: "admin",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  user: { id: "user1", name: "Jamie Cruz", email: "jamie@example.com", image: null },
};

function deleteRequest(id: string): Request {
  return new Request(`https://app.example.com/api/v1/members/${id}`, {
    method: "DELETE",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
  });
}

function patchRequest(id: string, body: unknown): Request {
  return new Request(`https://app.example.com/api/v1/members/${id}`, {
    method: "PATCH",
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
  listMembers.mockResolvedValue({ members: [member1], total: 1 } as never);
});

describe("DELETE /api/v1/members/[id]", () => {
  it("returns a clean 4xx, not a 500, when Better Auth rejects removing the last owner", async () => {
    removeMember.mockRejectedValue(
      new APIError("BAD_REQUEST", {
        code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
        message: "You cannot leave the organization as the only owner.",
      }),
    );

    const res = await DELETE(deleteRequest("member1"), { params: Promise.resolve({ id: "member1" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER");
  });

  it("returns 204 on a successful removal", async () => {
    removeMember.mockResolvedValue({ member: member1 } as never);

    const res = await DELETE(deleteRequest("member1"), { params: Promise.resolve({ id: "member1" }) });

    expect(res.status).toBe(204);
  });

  it("returns 403 SESSION_NOT_FRESH when the session isn't fresh, before ever calling removeMember", async () => {
    getSession.mockResolvedValue({
      ...validSession(),
      session: { ...validSession().session, createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    } as unknown as NonNullable<SessionResult>);

    const res = await DELETE(deleteRequest("member1"), { params: Promise.resolve({ id: "member1" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("SESSION_NOT_FRESH");
    expect(removeMember).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/members/[id]", () => {
  it("returns a clean 4xx, not a 500, when Better Auth's A6 hook rejects a self-targeted role change", async () => {
    updateMemberRole.mockRejectedValue(
      new APIError("FORBIDDEN", { code: "CANNOT_MODIFY_SELF", message: "CANNOT_MODIFY_SELF" }),
    );

    const res = await PATCH(patchRequest("member1", { role: "admin" }), {
      params: Promise.resolve({ id: "member1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("CANNOT_MODIFY_SELF");
  });

  it("returns 200 with the updated member on success", async () => {
    updateMemberRole.mockResolvedValue({ ...member1, role: "admin" } as never);

    const res = await PATCH(patchRequest("member1", { role: "admin" }), {
      params: Promise.resolve({ id: "member1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(200);
    expect(body.role).toBe("admin");
  });
});
