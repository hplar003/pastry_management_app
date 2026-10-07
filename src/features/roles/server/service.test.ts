import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listOrgRolesMock,
  createOrgRoleMock,
  updateOrgRoleMock,
  deleteOrgRoleMock,
  getOrgRoleMock,
  getActiveMemberRoleMock,
  effectivePermissionsMock,
} = vi.hoisted(() => ({
  listOrgRolesMock: vi.fn(),
  createOrgRoleMock: vi.fn(),
  updateOrgRoleMock: vi.fn(),
  deleteOrgRoleMock: vi.fn(),
  getOrgRoleMock: vi.fn(),
  getActiveMemberRoleMock: vi.fn(),
  effectivePermissionsMock: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      listOrgRoles: listOrgRolesMock,
      createOrgRole: createOrgRoleMock,
      updateOrgRole: updateOrgRoleMock,
      deleteOrgRole: deleteOrgRoleMock,
      getOrgRole: getOrgRoleMock,
      getActiveMemberRole: getActiveMemberRoleMock,
    },
    $context: Promise.resolve({ fake: "auth-context" }),
  },
  organizationOptions: { fake: "org-options" },
}));

vi.mock("@/server/auth/grant-ceiling-hook", () => ({
  effectivePermissions: effectivePermissionsMock,
}));

import { APIError } from "better-auth/api";
import * as service from "./service";

const headers = new Headers();
const ctx = {
  userId: "u1",
  organizationId: "org1",
  branchId: "branch1",
  requestId: "req1",
  db: {} as never,
};

describe("roles service: listRoleNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges the static roles with the dynamic roles, never exposing a `permission` payload", async () => {
    listOrgRolesMock.mockResolvedValue([
      { id: "r1", organizationId: "org1", role: "cashier", permission: { order: ["create"] } },
    ]);

    const result = await service.listRoleNames(ctx, headers);

    expect(listOrgRolesMock).toHaveBeenCalledWith({ headers, query: { organizationId: "org1" } });
    expect(result).toEqual([
      { role: "owner", isStatic: true },
      { role: "admin", isStatic: true },
      { role: "cashier", isStatic: false },
    ]);
    for (const entry of result) {
      expect(entry).not.toHaveProperty("permission");
    }
  });

  it("falls back to just the static roles when the caller lacks ac:read, instead of 403ing the whole route", async () => {
    listOrgRolesMock.mockRejectedValue(
      new APIError("FORBIDDEN", {
        code: "YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE",
        message: "not allowed",
      }),
    );

    const result = await service.listRoleNames(ctx, headers);

    expect(result).toEqual([
      { role: "owner", isStatic: true },
      { role: "admin", isStatic: true },
    ]);
  });

  it("re-throws a non-403 failure instead of silently swallowing it", async () => {
    listOrgRolesMock.mockRejectedValue(new Error("boom"));

    await expect(service.listRoleNames(ctx, headers)).rejects.toThrow("boom");
  });
});

const fakeAuditLog = { create: vi.fn() };
const ctxWithDb = { ...ctx, db: { auditLog: fakeAuditLog } as never };

describe("roles service: createRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unknown resource with a 400 ValidationError BEFORE calling auth.api.createOrgRole", async () => {
    await expect(
      service.createRole(ctxWithDb, headers, {
        role: "cashier",
        permission: { notARealResource: ["create"] },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });

    expect(createOrgRoleMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown action on a real resource with a 400 ValidationError BEFORE calling auth.api.createOrgRole", async () => {
    await expect(
      service.createRole(ctxWithDb, headers, {
        role: "cashier",
        permission: { order: ["teleport"] },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });

    expect(createOrgRoleMock).not.toHaveBeenCalled();
  });

  it("creates the role, returns its DTO, and writes an audit log row", async () => {
    createOrgRoleMock.mockResolvedValue({
      roleData: { id: "role1", role: "cashier", permission: { order: ["create"] } },
    });

    const result = await service.createRole(ctxWithDb, headers, {
      role: "cashier",
      permission: { order: ["create"] },
    });

    expect(createOrgRoleMock).toHaveBeenCalledWith({
      headers,
      body: { role: "cashier", permission: { order: ["create"] }, organizationId: "org1" },
    });
    expect(result).toEqual({ id: "role1", role: "cashier", permission: { order: ["create"] } });
    expect(fakeAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "role.create", entity: "OrganizationRole" }),
      }),
    );
  });

  it("re-throws a Better-Auth rejection (e.g. duplicate role name, TOO_MANY_ROLES) as a clean AppError", async () => {
    createOrgRoleMock.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "ROLE_NAME_IS_ALREADY_TAKEN", message: "already exists" }),
    );

    await expect(
      service.createRole(ctxWithDb, headers, { role: "cashier", permission: { order: ["create"] } }),
    ).rejects.toMatchObject({ code: "ROLE_NAME_IS_ALREADY_TAKEN" });
  });
});

describe("roles service: updateRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unknown resource/action with a 400 ValidationError BEFORE calling auth.api.updateOrgRole", async () => {
    await expect(
      service.updateRole(ctxWithDb, headers, "cashier", { permission: { order: ["teleport"] } }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });

    expect(updateOrgRoleMock).not.toHaveBeenCalled();
  });

  it("updates the role's permission and writes an audit log row with a real `before` snapshot (Finding 2)", async () => {
    // Pre-read: the role's permission BEFORE the update is applied.
    getOrgRoleMock.mockResolvedValue({ id: "role1", role: "cashier", permission: { order: ["create"] } });
    updateOrgRoleMock.mockResolvedValue({
      roleData: { id: "role1", role: "cashier", permission: { order: ["create", "read"] } },
    });

    const result = await service.updateRole(ctxWithDb, headers, "cashier", {
      permission: { order: ["create", "read"] },
    });

    // The pre-read happens BEFORE the mutating call.
    expect(getOrgRoleMock).toHaveBeenCalledWith({
      headers,
      query: { organizationId: "org1", roleName: "cashier" },
    });
    expect(updateOrgRoleMock).toHaveBeenCalledWith({
      headers,
      body: {
        organizationId: "org1",
        roleName: "cashier",
        data: { permission: { order: ["create", "read"] } },
      },
    });
    expect(result.permission).toEqual({ order: ["create", "read"] });
    expect(fakeAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "role.update",
          before: { id: "role1", role: "cashier", permission: { order: ["create"] } },
          after: { id: "role1", role: "cashier", permission: { order: ["create", "read"] } },
        }),
      }),
    );
  });

  it("re-throws a Better-Auth rejection (e.g. the A6 ceiling hook's GRANT_EXCEEDS_OWN) as a clean AppError", async () => {
    getOrgRoleMock.mockResolvedValue({ id: "role1", role: "cashier", permission: { order: ["create"] } });
    updateOrgRoleMock.mockRejectedValue(
      new APIError("FORBIDDEN", { code: "GRANT_EXCEEDS_OWN", message: "exceeds ceiling" }),
    );

    await expect(
      service.updateRole(ctxWithDb, headers, "cashier", { permission: { order: ["create"] } }),
    ).rejects.toMatchObject({ code: "GRANT_EXCEEDS_OWN" });
  });

  it("propagates the pre-read's own failure (e.g. the role no longer exists) instead of calling updateOrgRole", async () => {
    getOrgRoleMock.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "ROLE_NOT_FOUND", message: "not found" }),
    );

    await expect(
      service.updateRole(ctxWithDb, headers, "nope", { permission: { order: ["create"] } }),
    ).rejects.toMatchObject({ code: "ROLE_NOT_FOUND", status: 400 });

    expect(updateOrgRoleMock).not.toHaveBeenCalled();
  });
});

describe("roles service: getRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the role's DTO including its permission payload", async () => {
    getOrgRoleMock.mockResolvedValue({ id: "role1", role: "cashier", permission: { order: ["create"] } });

    const result = await service.getRole(ctx, headers, "cashier");

    expect(getOrgRoleMock).toHaveBeenCalledWith({
      headers,
      query: { organizationId: "org1", roleName: "cashier" },
    });
    expect(result).toEqual({ id: "role1", role: "cashier", permission: { order: ["create"] } });
  });

  it("re-throws a Better-Auth rejection (e.g. role not found) as a clean AppError", async () => {
    // Better Auth's real `getOrgRole` raises `ROLE_NOT_FOUND` as a
    // `BAD_REQUEST` (400), never a 404 — see `node_modules/better-auth/dist/
    // plugins/organization/routes/crud-access-control.mjs`.
    getOrgRoleMock.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "ROLE_NOT_FOUND", message: "not found" }),
    );

    await expect(service.getRole(ctx, headers, "nope")).rejects.toMatchObject({
      code: "ROLE_NOT_FOUND",
      status: 400,
    });
  });
});

describe("roles service: deleteRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the role and writes an audit log row with a `before` snapshot", async () => {
    getOrgRoleMock.mockResolvedValue({ role: "cashier", permission: { order: ["create"] } });
    deleteOrgRoleMock.mockResolvedValue(undefined);

    await service.deleteRole(ctxWithDb, headers, "cashier");

    expect(deleteOrgRoleMock).toHaveBeenCalledWith({
      headers,
      body: { organizationId: "org1", roleName: "cashier" },
    });
    expect(fakeAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "role.delete",
          before: { role: "cashier", permission: { order: ["create"] } },
        }),
      }),
    );
  });

  it("falls back to a role-name-only `before` snapshot if the pre-read fails, without blocking the delete", async () => {
    getOrgRoleMock.mockRejectedValue(new Error("boom"));
    deleteOrgRoleMock.mockResolvedValue(undefined);

    await service.deleteRole(ctxWithDb, headers, "cashier");

    expect(deleteOrgRoleMock).toHaveBeenCalled();
    expect(fakeAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ before: { role: "cashier" } }) }),
    );
  });

  it("re-throws a Better-Auth rejection (predefined role, or still assigned to a member) as a clean AppError", async () => {
    getOrgRoleMock.mockResolvedValue({ role: "cashier", permission: {} });
    deleteOrgRoleMock.mockRejectedValue(
      new APIError("BAD_REQUEST", { code: "ROLE_IS_ASSIGNED_TO_MEMBERS", message: "in use" }),
    );

    await expect(service.deleteRole(ctxWithDb, headers, "cashier")).rejects.toMatchObject({
      code: "ROLE_IS_ASSIGNED_TO_MEMBERS",
    });
  });
});

describe("roles service: getMyCeiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses effectivePermissions with the caller's own org/role, rather than reimplementing resolution logic", async () => {
    getActiveMemberRoleMock.mockResolvedValue({ role: "admin" });
    effectivePermissionsMock.mockResolvedValue({ order: ["create", "read"] });

    const result = await service.getMyCeiling(ctx, headers);

    expect(getActiveMemberRoleMock).toHaveBeenCalledWith({
      headers,
      query: { organizationId: "org1" },
    });
    expect(effectivePermissionsMock).toHaveBeenCalledWith(
      expect.anything(),
      { fake: "org-options" },
      "org1",
      "admin",
    );
    expect(result).toEqual({ order: ["create", "read"] });
  });

  it("re-throws a Better-Auth APIError from getActiveMemberRole as a clean AppError, not a raw 500", async () => {
    getActiveMemberRoleMock.mockRejectedValue(
      new APIError("FORBIDDEN", { code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION", message: "not a member" }),
    );

    await expect(service.getMyCeiling(ctx, headers)).rejects.toMatchObject({
      code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
    });
  });
});
