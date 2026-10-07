// @vitest-environment node
/**
 * Route-level test for the public accept route — authenticated, but
 * deliberately NOT `withAuth`-wrapped (a brand-new invitee has no active
 * organization yet; see the route's own doc comment and
 * `.superpowers/sdd/settings-task5-brief.md`). Proves the real-session-
 * required gate and the successful-accept path, plus that a Better Auth
 * rejection surfaces as a clean 4xx via the shared
 * `rethrowInvitationApiError`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { BETTER_AUTH_URL: "https://app.example.com", NODE_ENV: "production" },
}));

const { getSessionMock, acceptInvitationMock, auditLogCreateMock, forTenantMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  acceptInvitationMock: vi.fn(),
  auditLogCreateMock: vi.fn(),
  forTenantMock: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
      acceptInvitation: acceptInvitationMock,
    },
  },
}));

// `acceptInvitationForSession` (public-service.ts) writes the
// `invitation.accept` AuditLog row via `forTenant(...)`, not `db` directly
// (RLS on AuditLog requires `app.org_id` to be set — see that file's doc
// comment) — same mock shape as `with-auth.test.ts`/`route-inventory.test.ts`.
vi.mock("@/server/db", () => ({
  db: {},
  forTenant: forTenantMock.mockReturnValue({ auditLog: { create: auditLogCreateMock } }),
  withTenantTx: vi.fn(),
}));

import { APIError } from "better-auth/api";
import { POST } from "./route";

function acceptRequest(id: string): Request {
  return new Request(`https://app.example.com/api/v1/invitations/${id}/accept`, {
    method: "POST",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

async function statusAndBody(res: Response) {
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/invitations/[id]/accept", () => {
  it("returns 401 when there is no session, and never calls acceptInvitation", async () => {
    getSessionMock.mockResolvedValue(null);

    const res = await POST(acceptRequest("inv1"), { params: Promise.resolve({ id: "inv1" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(401);
    expect(body.error).toBe("UNAUTHORIZED");
    expect(acceptInvitationMock).not.toHaveBeenCalled();
  });

  it("returns a clean 4xx, not a 500, when Better Auth rejects the accept (e.g. wrong recipient)", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user1", email: "someone-else@example.com" } });
    acceptInvitationMock.mockRejectedValue(
      new APIError("FORBIDDEN", {
        code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
        message: "You are not the recipient of the invitation.",
      }),
    );

    const res = await POST(acceptRequest("inv1"), { params: Promise.resolve({ id: "inv1" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION");
  });

  it("accepts the invitation, writes an invitation.accept AuditLog row, and returns Better Auth's result on success", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user1", email: "invitee@example.com" } });
    acceptInvitationMock.mockResolvedValue({
      invitation: { id: "inv1" },
      member: { id: "member1", organizationId: "org1", userId: "user1", role: "member" },
    });

    const res = await POST(acceptRequest("inv1"), { params: Promise.resolve({ id: "inv1" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(200);
    expect(body).toEqual({
      invitation: { id: "inv1" },
      member: { id: "member1", organizationId: "org1", userId: "user1", role: "member" },
    });
    expect(acceptInvitationMock).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { invitationId: "inv1" },
    });

    expect(forTenantMock).toHaveBeenCalledWith({ organizationId: "org1", branchId: null, userId: "user1" });
    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const call = auditLogCreateMock.mock.calls[0][0];
    expect(call.data).toMatchObject({
      actorId: "user1",
      action: "invitation.accept",
      entity: "Member",
      entityId: "member1",
      after: { role: "member" },
    });
  });

  it("rejects a mutation from a foreign origin (CSRF, security plan E2) before ever checking the session", async () => {
    const req = new Request("https://app.example.com/api/v1/invitations/inv1/accept", {
      method: "POST",
      headers: { origin: "https://evil.example.com", "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "inv1" }) });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(403);
    expect(body.error).toBe("FOREIGN_ORIGIN");
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
