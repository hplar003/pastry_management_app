import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/server/errors";

// Trailing slash deliberately included: `createInvitation`'s acceptUrl
// join must strip it (minor fix, settings-task5 review) — every acceptUrl
// assertion below expects a single slash, so this doubles as that test.
vi.mock("@/env", () => ({
  env: { BETTER_AUTH_URL: "https://app.example.com/", NODE_ENV: "production" },
}));

const { listInvitationsMock, createInvitationMock, cancelInvitationMock } = vi.hoisted(() => ({
  listInvitationsMock: vi.fn(),
  createInvitationMock: vi.fn(),
  cancelInvitationMock: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      listInvitations: listInvitationsMock,
      createInvitation: createInvitationMock,
      cancelInvitation: cancelInvitationMock,
    },
  },
}));

const { findUniqueUserMock, deleteUserMock } = vi.hoisted(() => ({
  findUniqueUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
}));

// `cancelInvitation`'s Important-4 orphaned-account cleanup reads/deletes
// the raw `User` table directly (there is no RLS on Better Auth's own
// tables — see `public-service.ts`'s doc comment).
vi.mock("@/server/db", () => ({
  db: {
    user: { findUnique: findUniqueUserMock, delete: deleteUserMock },
  },
}));

import { APIError } from "better-auth/api";
import * as service from "./service";

const auditLogCreate = vi.fn();
const auditLogCount = vi.fn().mockResolvedValue(0);
const headers = new Headers();

const ctx = {
  userId: "caller1",
  organizationId: "org1",
  branchId: "branch1",
  requestId: "req1",
  db: {
    auditLog: { create: auditLogCreate, count: auditLogCount },
  } as never,
};

const invitation1 = {
  id: "inv1",
  email: "new-hire@example.com",
  role: "member",
  organizationId: "org1",
  status: "pending",
  expiresAt: new Date("2026-02-01T00:00:00.000Z"),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  inviterId: "caller1",
};

describe("invitations service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listInvitations", () => {
    it("lists invitations via auth.api.listInvitations, scoped to ctx.organizationId, mapped to the DTO", async () => {
      listInvitationsMock.mockResolvedValue([invitation1]);

      const result = await service.listInvitations(ctx, headers);

      expect(listInvitationsMock).toHaveBeenCalledWith({
        headers,
        query: { organizationId: "org1" },
      });
      expect(result).toEqual([
        {
          id: "inv1",
          email: "new-hire@example.com",
          role: "member",
          status: "pending",
          expiresAt: invitation1.expiresAt,
          createdAt: invitation1.createdAt,
          inviterId: "caller1",
        },
      ]);
    });
  });

  describe("createInvitation", () => {
    it("creates the invitation, records an AuditLog row, and returns the DTO plus a constructed acceptUrl", async () => {
      createInvitationMock.mockResolvedValue(invitation1);

      const result = await service.createInvitation(ctx, headers, {
        email: "new-hire@example.com",
        role: "member",
      });

      expect(createInvitationMock).toHaveBeenCalledWith({
        headers,
        body: { email: "new-hire@example.com", role: "member", organizationId: "org1" },
      });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: "branch1",
        actorId: "caller1",
        action: "invitation.create",
        entity: "Invitation",
        entityId: "inv1",
        requestId: "req1",
      });
      expect(call.data.after).toEqual({ email: "new-hire@example.com", role: "member" });

      expect(result.acceptUrl).toBe("https://app.example.com/accept-invite/inv1");
      expect(result.id).toBe("inv1");
    });

    it("re-throws a Better Auth APIError (e.g. GRANT_EXCEEDS_OWN from the A6 hook) as a clean AppError, and never writes an AuditLog row", async () => {
      createInvitationMock.mockRejectedValue(
        new APIError("FORBIDDEN", {
          code: "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
          message: "You are not allowed to invite users with this role.",
        }),
      );

      await expect(
        service.createInvitation(ctx, headers, { email: "x@example.com", role: "owner" }),
      ).rejects.toMatchObject({
        code: "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
        status: 403,
      });
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    it("Important 5: rejects with INVITE_RATE_LIMIT_EXCEEDED once 20 invites have been sent by this org in the trailing hour, never calling auth.api.createInvitation", async () => {
      auditLogCount.mockResolvedValue(20);

      await expect(
        service.createInvitation(ctx, headers, { email: "x@example.com", role: "member" }),
      ).rejects.toMatchObject({ code: "INVITE_RATE_LIMIT_EXCEEDED", status: 429 });

      expect(auditLogCount).toHaveBeenCalledWith({
        where: { action: "invitation.create", createdAt: { gte: expect.any(Date) } },
      });
      expect(createInvitationMock).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    it("Important 5: allows the invite when under the rate limit", async () => {
      auditLogCount.mockResolvedValue(19);
      createInvitationMock.mockResolvedValue(invitation1);

      await service.createInvitation(ctx, headers, { email: "new-hire@example.com", role: "member" });

      expect(createInvitationMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancelInvitation", () => {
    it("cancels the invitation and records an AuditLog row with the pre-read invitation as `before`", async () => {
      listInvitationsMock.mockResolvedValue([invitation1]);
      cancelInvitationMock.mockResolvedValue({ ...invitation1, status: "canceled" });

      await service.cancelInvitation(ctx, headers, "inv1");

      expect(cancelInvitationMock).toHaveBeenCalledWith({
        headers,
        body: { invitationId: "inv1" },
      });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: "branch1",
        actorId: "caller1",
        action: "invitation.cancel",
        entity: "Invitation",
        entityId: "inv1",
        requestId: "req1",
      });
      expect(call.data.before.status).toBe("pending");
    });

    it("throws NotFoundError, never calls cancelInvitation, when the invitation doesn't exist", async () => {
      listInvitationsMock.mockResolvedValue([]);

      await expect(service.cancelInvitation(ctx, headers, "missing")).rejects.toThrow(NotFoundError);
      expect(cancelInvitationMock).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    it("re-throws a Better Auth APIError as a clean AppError, and never writes an AuditLog row", async () => {
      listInvitationsMock.mockResolvedValue([invitation1]);
      cancelInvitationMock.mockRejectedValue(
        new APIError("BAD_REQUEST", { code: "INVITATION_NOT_FOUND", message: "Invitation not found." }),
      );

      await expect(service.cancelInvitation(ctx, headers, "inv1")).rejects.toMatchObject({
        code: "INVITATION_NOT_FOUND",
        status: 400,
      });
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    describe("Important 4: orphaned-account cleanup after cancel", () => {
      beforeEach(() => {
        listInvitationsMock.mockResolvedValue([invitation1]);
        cancelInvitationMock.mockResolvedValue({ ...invitation1, status: "canceled" });
      });

      it("deletes the User row when it has zero memberships anywhere and no 2FA enrolled", async () => {
        findUniqueUserMock.mockResolvedValue({ id: "orphan-1", twoFactorEnabled: false, members: [] });

        await service.cancelInvitation(ctx, headers, "inv1");

        expect(findUniqueUserMock).toHaveBeenCalledWith({
          where: { email: "new-hire@example.com" },
          select: { id: true, twoFactorEnabled: true, members: { select: { id: true }, take: 1 } },
        });
        expect(deleteUserMock).toHaveBeenCalledWith({ where: { id: "orphan-1" } });
      });

      it("never deletes when the user is a member of some organization, even if not this one", async () => {
        findUniqueUserMock.mockResolvedValue({
          id: "real-user-1",
          twoFactorEnabled: false,
          members: [{ id: "member-elsewhere" }],
        });

        await service.cancelInvitation(ctx, headers, "inv1");

        expect(deleteUserMock).not.toHaveBeenCalled();
      });

      it("never deletes when the user has 2FA enrolled", async () => {
        findUniqueUserMock.mockResolvedValue({ id: "real-user-2", twoFactorEnabled: true, members: [] });

        await service.cancelInvitation(ctx, headers, "inv1");

        expect(deleteUserMock).not.toHaveBeenCalled();
      });

      it("never deletes, and never throws, when no User row exists for the email at all", async () => {
        findUniqueUserMock.mockResolvedValue(null);

        await expect(service.cancelInvitation(ctx, headers, "inv1")).resolves.toBeUndefined();
        expect(deleteUserMock).not.toHaveBeenCalled();
      });

      it("is best-effort: a cleanup failure never fails the cancellation itself", async () => {
        findUniqueUserMock.mockRejectedValue(new Error("db unavailable"));

        await expect(service.cancelInvitation(ctx, headers, "inv1")).resolves.toBeUndefined();
        expect(auditLogCreate).toHaveBeenCalledTimes(1);
      });
    });
  });
});
