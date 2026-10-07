import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/server/errors";

const {
  listMembersMock,
  updateMemberRoleMock,
  removeMemberMock,
  deleteUserSessionsMock,
} = vi.hoisted(() => ({
  listMembersMock: vi.fn(),
  updateMemberRoleMock: vi.fn(),
  removeMemberMock: vi.fn(),
  deleteUserSessionsMock: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      listMembers: listMembersMock,
      updateMemberRole: updateMemberRoleMock,
      removeMember: removeMemberMock,
    },
    $context: Promise.resolve({
      internalAdapter: { deleteUserSessions: deleteUserSessionsMock },
    }),
  },
}));

import { APIError } from "better-auth/api";
import * as service from "./service";

const auditLogCreate = vi.fn();
const headers = new Headers();

const ctx = {
  userId: "caller1",
  organizationId: "org1",
  branchId: "branch1",
  requestId: "req1",
  db: {
    auditLog: { create: auditLogCreate },
  } as never,
};

const member1 = {
  id: "member1",
  userId: "user1",
  organizationId: "org1",
  role: "member",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  user: { id: "user1", name: "Alex Rivera", email: "alex@example.com", image: null },
};

describe("members service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listMembers", () => {
    it("lists members via auth.api.listMembers, scoped to ctx.organizationId, mapped to the DTO", async () => {
      listMembersMock.mockResolvedValue({ members: [member1], total: 1 });

      const result = await service.listMembers(ctx, headers);

      expect(listMembersMock).toHaveBeenCalledWith({
        headers,
        query: { organizationId: "org1" },
      });
      expect(result).toEqual([
        {
          id: "member1",
          userId: "user1",
          role: "member",
          createdAt: member1.createdAt,
          user: { name: "Alex Rivera", email: "alex@example.com" },
        },
      ]);
    });
  });

  describe("updateMemberRole", () => {
    it("updates the role, revokes the target's sessions, and records an AuditLog row", async () => {
      listMembersMock.mockResolvedValue({ members: [member1], total: 1 });
      updateMemberRoleMock.mockResolvedValue({ ...member1, role: "admin" });

      const result = await service.updateMemberRole(ctx, headers, "member1", "admin");

      expect(updateMemberRoleMock).toHaveBeenCalledWith({
        headers,
        body: { memberId: "member1", role: "admin", organizationId: "org1" },
      });

      expect(deleteUserSessionsMock).toHaveBeenCalledWith("user1");

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: "branch1",
        actorId: "caller1",
        action: "member.role_update",
        entity: "Member",
        entityId: "member1",
        requestId: "req1",
      });
      expect(call.data.before).toEqual({ role: "member" });
      expect(call.data.after).toEqual({ role: "admin" });

      expect(result.role).toBe("admin");
    });

    it("throws NotFoundError, never calls updateMemberRole, and never revokes sessions when the member doesn't exist", async () => {
      listMembersMock.mockResolvedValue({ members: [], total: 0 });

      await expect(service.updateMemberRole(ctx, headers, "missing", "admin")).rejects.toThrow(
        NotFoundError,
      );
      expect(updateMemberRoleMock).not.toHaveBeenCalled();
      expect(deleteUserSessionsMock).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    it("re-throws a Better Auth APIError (e.g. CANNOT_MODIFY_SELF from the A6 hook) as a clean AppError, and never revokes sessions or writes an AuditLog row", async () => {
      listMembersMock.mockResolvedValue({ members: [member1], total: 1 });
      updateMemberRoleMock.mockRejectedValue(
        new APIError("FORBIDDEN", { code: "CANNOT_MODIFY_SELF", message: "CANNOT_MODIFY_SELF" }),
      );

      await expect(service.updateMemberRole(ctx, headers, "member1", "admin")).rejects.toMatchObject({
        code: "CANNOT_MODIFY_SELF",
        status: 403,
      });
      expect(deleteUserSessionsMock).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    it("re-throws Better Auth's 'cannot leave without an owner' rejection as a clean AppError", async () => {
      listMembersMock.mockResolvedValue({ members: [member1], total: 1 });
      updateMemberRoleMock.mockRejectedValue(
        new APIError("BAD_REQUEST", {
          code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
          message: "You cannot leave the organization without an owner.",
        }),
      );

      await expect(service.updateMemberRole(ctx, headers, "member1", "member")).rejects.toMatchObject({
        code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
        status: 400,
      });
      expect(deleteUserSessionsMock).not.toHaveBeenCalled();
    });
  });

  describe("removeMember", () => {
    it("removes the member, revokes their sessions, and records an AuditLog row with the pre-read member as `before`", async () => {
      listMembersMock.mockResolvedValue({ members: [member1], total: 1 });
      removeMemberMock.mockResolvedValue({ member: member1 });

      await service.removeMember(ctx, headers, "member1");

      expect(removeMemberMock).toHaveBeenCalledWith({
        headers,
        body: { memberIdOrEmail: "member1", organizationId: "org1" },
      });

      expect(deleteUserSessionsMock).toHaveBeenCalledWith("user1");

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: "branch1",
        actorId: "caller1",
        action: "member.remove",
        entity: "Member",
        entityId: "member1",
        requestId: "req1",
      });
      expect(call.data.before).toEqual({
        id: "member1",
        userId: "user1",
        role: "member",
        createdAt: member1.createdAt,
        user: { name: "Alex Rivera", email: "alex@example.com" },
      });
    });

    it("throws NotFoundError and never calls removeMember when the member doesn't exist", async () => {
      listMembersMock.mockResolvedValue({ members: [], total: 0 });

      await expect(service.removeMember(ctx, headers, "missing")).rejects.toThrow(NotFoundError);
      expect(removeMemberMock).not.toHaveBeenCalled();
      expect(deleteUserSessionsMock).not.toHaveBeenCalled();
    });

    it("re-throws Better Auth's 'cannot remove last owner' rejection as a clean AppError, and never revokes sessions or writes an AuditLog row", async () => {
      listMembersMock.mockResolvedValue({ members: [member1], total: 1 });
      removeMemberMock.mockRejectedValue(
        new APIError("BAD_REQUEST", {
          code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
          message: "You cannot leave the organization as the only owner.",
        }),
      );

      await expect(service.removeMember(ctx, headers, "member1")).rejects.toMatchObject({
        code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
        status: 400,
      });
      expect(deleteUserSessionsMock).not.toHaveBeenCalled();
      expect(auditLogCreate).not.toHaveBeenCalled();
    });
  });
});
