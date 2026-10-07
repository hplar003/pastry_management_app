// @vitest-environment node
/**
 * Route-level test for the public, unauthenticated account-creation step —
 * no prior pattern to lean on, proved directly at the route level per
 * `.superpowers/sdd/settings-task5-brief.md`. Mocks the raw `db` export
 * (invitation/user reads), `auth.$context.internalAdapter` (seed.ts's
 * exact admin-provisioning pattern), and `isPasswordCompromised` (A2).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { BETTER_AUTH_URL: "https://app.example.com", NODE_ENV: "production" },
}));

const {
  findUniqueInvitationMock,
  findUniqueUserMock,
  deleteUserMock,
  createUserMock,
  linkAccountMock,
  isPasswordCompromisedMock,
  auditLogCreateMock,
  forTenantMock,
} = vi.hoisted(() => ({
  findUniqueInvitationMock: vi.fn(),
  findUniqueUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
  createUserMock: vi.fn(),
  linkAccountMock: vi.fn(),
  isPasswordCompromisedMock: vi.fn().mockResolvedValue(false),
  auditLogCreateMock: vi.fn(),
  forTenantMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    invitation: { findUnique: findUniqueInvitationMock },
    user: { findUnique: findUniqueUserMock, delete: deleteUserMock },
  },
  // `createAccountForInvitation` (public-service.ts) writes the
  // `invitation.account_created` AuditLog row via `forTenant(...)`, not
  // `db` directly (RLS on AuditLog requires `app.org_id` to be set).
  forTenant: forTenantMock.mockReturnValue({ auditLog: { create: auditLogCreateMock } }),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    $context: Promise.resolve({
      internalAdapter: { createUser: createUserMock, linkAccount: linkAccountMock },
    }),
  },
}));

vi.mock("better-auth/plugins", () => ({
  isPasswordCompromised: isPasswordCompromisedMock,
}));

vi.mock("better-auth/crypto", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
}));

import { POST } from "./route";

function createAccountRequest(id: string, body: unknown): Request {
  return new Request(`https://app.example.com/api/v1/invitations/${id}/create-account`, {
    method: "POST",
    headers: { origin: "https://app.example.com", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function statusAndBody(res: Response) {
  return { status: res.status, body: await res.json() };
}

const pendingInvitation = {
  email: "new-hire@example.com",
  status: "pending",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  organizationId: "org1",
};

beforeEach(() => {
  vi.clearAllMocks();
  isPasswordCompromisedMock.mockResolvedValue(false);
});

describe("POST /api/v1/invitations/[id]/create-account", () => {
  it("returns 404 when the invitation doesn't exist", async () => {
    findUniqueInvitationMock.mockResolvedValue(null);

    const res = await POST(createAccountRequest("missing", { password: "correct-horse-battery" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(404);
    expect(body.error).toBe("NOT_FOUND");
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation, never trusting a stale client-side preview", async () => {
    findUniqueInvitationMock.mockResolvedValue({
      ...pendingInvitation,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const res = await POST(createAccountRequest("inv1", { password: "correct-horse-battery" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("INVITATION_NOT_PENDING");
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("rejects a non-pending (e.g. already canceled) invitation", async () => {
    findUniqueInvitationMock.mockResolvedValue({ ...pendingInvitation, status: "canceled" });

    const res = await POST(createAccountRequest("inv1", { password: "correct-horse-battery" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("INVITATION_NOT_PENDING");
  });

  it("rejects when a User already exists for the invitation's email — the existing-user branch isn't this endpoint's job", async () => {
    findUniqueInvitationMock.mockResolvedValue(pendingInvitation);
    findUniqueUserMock.mockResolvedValue({ id: "user1" });

    const res = await POST(createAccountRequest("inv1", { password: "correct-horse-battery" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("USER_ALREADY_EXISTS");
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("rejects a compromised password (A2) before creating any account", async () => {
    findUniqueInvitationMock.mockResolvedValue(pendingInvitation);
    findUniqueUserMock.mockResolvedValue(null);
    isPasswordCompromisedMock.mockResolvedValue(true);

    const res = await POST(createAccountRequest("inv1", { password: "password12345" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("PASSWORD_COMPROMISED");
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it("creates the user and links the credential account on success, verified-email trusted the same way the seed owner is, and records an invitation.account_created AuditLog row", async () => {
    findUniqueInvitationMock.mockResolvedValue(pendingInvitation);
    findUniqueUserMock.mockResolvedValue(null);
    createUserMock.mockResolvedValue({ id: "new-user-1" });

    const res = await POST(createAccountRequest("inv1", { password: "correct-horse-battery" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });

    expect(createUserMock).toHaveBeenCalledWith(
      { email: "new-hire@example.com", name: "new-hire", emailVerified: true },
      { method: "admin" },
    );
    expect(linkAccountMock).toHaveBeenCalledWith({
      userId: "new-user-1",
      providerId: "credential",
      accountId: "new-user-1",
      password: "hashed-password",
    });

    expect(forTenantMock).toHaveBeenCalledWith({ organizationId: "org1", branchId: null, userId: "new-user-1" });
    expect(auditLogCreateMock).toHaveBeenCalledTimes(1);
    const call = auditLogCreateMock.mock.calls[0][0];
    expect(call.data).toMatchObject({
      actorId: "new-user-1",
      action: "invitation.account_created",
      entity: "User",
      entityId: "new-user-1",
      after: { email: "new-hire@example.com" },
    });
  });

  it("Important 1 (atomicity): rolls back the just-created user when linkAccount throws after createUser succeeded, instead of leaving a password-less, permanently-locked-out account", async () => {
    findUniqueInvitationMock.mockResolvedValue(pendingInvitation);
    findUniqueUserMock.mockResolvedValue(null);
    createUserMock.mockResolvedValue({ id: "new-user-1" });
    linkAccountMock.mockRejectedValue(new Error("connection reset"));
    deleteUserMock.mockResolvedValue(undefined);

    const res = await POST(createAccountRequest("inv1", { password: "correct-horse-battery" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(500);
    expect(body.error).toBe("INTERNAL");
    expect(deleteUserMock).toHaveBeenCalledWith({ where: { id: "new-user-1" } });
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("Important 1 (race): maps a concurrent create-account call's unique-constraint violation to a clean USER_ALREADY_EXISTS, not a 500, and never attempts a rollback delete", async () => {
    findUniqueInvitationMock.mockResolvedValue(pendingInvitation);
    findUniqueUserMock.mockResolvedValue(null);
    const { Prisma } = await import("@/generated/prisma/client");
    createUserMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`email`)", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await POST(createAccountRequest("inv1", { password: "correct-horse-battery" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("USER_ALREADY_EXISTS");
    expect(linkAccountMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION for a too-short password, never reaching the DB", async () => {
    const res = await POST(createAccountRequest("inv1", { password: "short" }), {
      params: Promise.resolve({ id: "inv1" }),
    });
    const { status, body } = await statusAndBody(res);

    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION");
    expect(findUniqueInvitationMock).not.toHaveBeenCalled();
  });
});
