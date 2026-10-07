import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";

const { createTeamMock, updateTeamMock, removeTeamMock, listOrganizationTeamsMock } = vi.hoisted(() => ({
  createTeamMock: vi.fn(),
  updateTeamMock: vi.fn(),
  removeTeamMock: vi.fn(),
  listOrganizationTeamsMock: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      createTeam: createTeamMock,
      updateTeam: updateTeamMock,
      removeTeam: removeTeamMock,
      listOrganizationTeams: listOrganizationTeamsMock,
    },
  },
}));

import { APIError } from "better-auth/api";
import * as service from "./service";

const auditLogCreate = vi.fn();
const headers = new Headers();

const ctx = {
  userId: "u1",
  organizationId: "org1",
  branchId: "branch1",
  requestId: "req1",
  db: {
    auditLog: { create: auditLogCreate },
  } as never,
};

const team1 = {
  id: "team1",
  name: "Poblacion Branch",
  organizationId: "org1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("branches service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listBranches", () => {
    it("lists teams via auth.api.listOrganizationTeams, scoped to ctx.organizationId", async () => {
      listOrganizationTeamsMock.mockResolvedValue([team1]);

      const result = await service.listBranches(ctx, headers);

      expect(listOrganizationTeamsMock).toHaveBeenCalledWith({
        headers,
        query: { organizationId: "org1" },
      });
      expect(result).toEqual([
        {
          id: "team1",
          name: "Poblacion Branch",
          createdAt: team1.createdAt,
          updatedAt: team1.updatedAt,
        },
      ]);
    });
  });

  describe("createBranch", () => {
    it("calls auth.api.createTeam scoped to ctx.organizationId, then records an AuditLog row", async () => {
      createTeamMock.mockResolvedValue(team1);

      const result = await service.createBranch(ctx, headers, { name: "Poblacion Branch" });

      expect(createTeamMock).toHaveBeenCalledWith({
        headers,
        body: { name: "Poblacion Branch", organizationId: "org1" },
      });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: "branch1",
        actorId: "u1",
        action: "branch.create",
        entity: "Team",
        entityId: "team1",
        requestId: "req1",
      });
      expect(call.data.after).toEqual({
        id: "team1",
        name: "Poblacion Branch",
        createdAt: team1.createdAt,
        updatedAt: team1.updatedAt,
      });

      expect(result).toEqual({
        id: "team1",
        name: "Poblacion Branch",
        createdAt: team1.createdAt,
        updatedAt: team1.updatedAt,
      });
    });

    it("throws AppError and never writes an AuditLog row when the create fails", async () => {
      createTeamMock.mockResolvedValue(null);

      await expect(service.createBranch(ctx, headers, { name: "Poblacion Branch" })).rejects.toThrow(
        AppError,
      );
      expect(auditLogCreate).not.toHaveBeenCalled();
    });

    it("re-throws a Better Auth APIError (e.g. maximum teams reached) as a clean AppError", async () => {
      createTeamMock.mockRejectedValue(
        new APIError("BAD_REQUEST", {
          code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS",
          message: "You have reached the maximum number of teams",
        }),
      );

      await expect(service.createBranch(ctx, headers, { name: "New Branch" })).rejects.toMatchObject({
        code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS",
        status: 400,
      });
      expect(auditLogCreate).not.toHaveBeenCalled();
    });
  });

  describe("updateBranch", () => {
    it("calls auth.api.updateTeam and does not write an AuditLog row", async () => {
      const updated = { ...team1, name: "Downtown Branch" };
      updateTeamMock.mockResolvedValue(updated);

      const result = await service.updateBranch(ctx, headers, "team1", { name: "Downtown Branch" });

      expect(updateTeamMock).toHaveBeenCalledWith({
        headers,
        body: { teamId: "team1", data: { name: "Downtown Branch" } },
      });
      expect(auditLogCreate).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: "team1",
        name: "Downtown Branch",
        createdAt: team1.createdAt,
        updatedAt: team1.updatedAt,
      });
    });

    it("re-throws a Better Auth APIError as a clean AppError", async () => {
      updateTeamMock.mockRejectedValue(
        new APIError("FORBIDDEN", {
          code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM",
          message: "You are not allowed to update this team",
        }),
      );

      await expect(service.updateBranch(ctx, headers, "team1", { name: "X" })).rejects.toMatchObject({
        code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM",
        status: 403,
      });
    });
  });

  describe("deleteBranch", () => {
    it("calls auth.api.removeTeam, then records an AuditLog row with the pre-read team as `before`", async () => {
      listOrganizationTeamsMock.mockResolvedValue([team1]);
      removeTeamMock.mockResolvedValue({ message: "Team removed successfully." });

      await service.deleteBranch(ctx, headers, "team1");

      expect(removeTeamMock).toHaveBeenCalledWith({
        headers,
        body: { teamId: "team1", organizationId: "org1" },
      });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: "branch1",
        actorId: "u1",
        action: "branch.delete",
        entity: "Team",
        entityId: "team1",
        requestId: "req1",
      });
      expect(call.data.before).toEqual({
        id: "team1",
        name: "Poblacion Branch",
        createdAt: team1.createdAt,
        updatedAt: team1.updatedAt,
      });
    });

    it("falls back to `{ id }` as the `before` snapshot when the team isn't found in the pre-read", async () => {
      listOrganizationTeamsMock.mockResolvedValue([]);
      removeTeamMock.mockResolvedValue({ message: "Team removed successfully." });

      await service.deleteBranch(ctx, headers, "missing-team");

      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data.before).toEqual({ id: "missing-team" });
    });

    it("re-throws Better Auth's 'unable to remove last team' APIError as a clean AppError, and never writes an AuditLog row", async () => {
      listOrganizationTeamsMock.mockResolvedValue([team1]);
      removeTeamMock.mockRejectedValue(
        new APIError("BAD_REQUEST", {
          code: "UNABLE_TO_REMOVE_LAST_TEAM",
          message: "Unable to remove last team",
        }),
      );

      await expect(service.deleteBranch(ctx, headers, "team1")).rejects.toMatchObject({
        code: "UNABLE_TO_REMOVE_LAST_TEAM",
        status: 400,
      });
      expect(auditLogCreate).not.toHaveBeenCalled();
    });
  });
});
