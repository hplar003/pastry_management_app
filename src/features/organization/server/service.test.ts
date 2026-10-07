import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
import { AppError, NotFoundError } from "@/server/errors";

const {
  getFullOrganizationMock,
  updateOrganizationMock,
  listOrganizationsMock,
  createOrganizationMock,
  setActiveOrganizationMock,
  forTenantAuditLogCreate,
} = vi.hoisted(() => ({
  getFullOrganizationMock: vi.fn(),
  updateOrganizationMock: vi.fn(),
  listOrganizationsMock: vi.fn(),
  createOrganizationMock: vi.fn(),
  setActiveOrganizationMock: vi.fn(),
  forTenantAuditLogCreate: vi.fn(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: {
    api: {
      getFullOrganization: getFullOrganizationMock,
      updateOrganization: updateOrganizationMock,
      listOrganizations: listOrganizationsMock,
      createOrganization: createOrganizationMock,
      setActiveOrganization: setActiveOrganizationMock,
    },
  },
}));

vi.mock("@/server/db", () => ({
  forTenant: vi.fn(() => ({ auditLog: { create: forTenantAuditLogCreate } })),
}));

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

const fullOrg = {
  id: "org1",
  name: "Sweet Salad",
  slug: "sweet-salad",
  logo: null,
  address: "123 Main St",
  phone: "555-0100",
  description: "A cozy neighborhood bakery.",
};

describe("organization service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrganization", () => {
    it("fetches the full organization via auth.api.getFullOrganization, scoped to ctx.organizationId", async () => {
      getFullOrganizationMock.mockResolvedValue(fullOrg);

      const result = await service.getOrganization(ctx, headers);

      expect(getFullOrganizationMock).toHaveBeenCalledWith({
        headers,
        query: { organizationId: "org1" },
      });
      expect(result).toEqual({
        id: "org1",
        name: "Sweet Salad",
        slug: "sweet-salad",
        logo: null,
        address: "123 Main St",
        phone: "555-0100",
        description: "A cozy neighborhood bakery.",
      });
    });

    it("throws NotFoundError when the org isn't found", async () => {
      getFullOrganizationMock.mockResolvedValue(null);

      await expect(service.getOrganization(ctx, headers)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateOrganization", () => {
    it("calls auth.api.updateOrganization with headers and the scoped body, then records an AuditLog row", async () => {
      getFullOrganizationMock.mockResolvedValue(fullOrg);
      const updated = { ...fullOrg, name: "Sweet Salad Bakery" };
      updateOrganizationMock.mockResolvedValue(updated);

      const result = await service.updateOrganization(ctx, headers, { name: "Sweet Salad Bakery" });

      expect(updateOrganizationMock).toHaveBeenCalledWith({
        headers,
        body: { organizationId: "org1", data: { name: "Sweet Salad Bakery" } },
      });

      expect(auditLogCreate).toHaveBeenCalledTimes(1);
      const call = auditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: "branch1",
        actorId: "u1",
        action: "organization.update",
        entity: "Organization",
        entityId: "org1",
        requestId: "req1",
      });
      expect(call.data.before).toEqual(
        expect.objectContaining({ id: "org1", name: "Sweet Salad" }),
      );
      expect(call.data.after).toEqual(
        expect.objectContaining({ id: "org1", name: "Sweet Salad Bakery" }),
      );

      expect(result).toEqual({
        id: "org1",
        name: "Sweet Salad Bakery",
        slug: "sweet-salad",
        logo: null,
        address: "123 Main St",
        phone: "555-0100",
        description: "A cozy neighborhood bakery.",
      });
    });

    it("throws AppError and never writes an AuditLog row when the update fails", async () => {
      getFullOrganizationMock.mockResolvedValue(fullOrg);
      updateOrganizationMock.mockResolvedValue(null);

      await expect(
        service.updateOrganization(ctx, headers, { name: "Sweet Salad Bakery" }),
      ).rejects.toThrow(AppError);
      expect(auditLogCreate).not.toHaveBeenCalled();
    });
  });

  describe("createOrganizationForSession", () => {
    it("throws ALREADY_HAS_ORGANIZATION when the caller already belongs to one", async () => {
      listOrganizationsMock.mockResolvedValue([{ id: "existing-org" }]);

      await expect(
        service.createOrganizationForSession(headers, "u1", "req1", { name: "Sweet Salad" }),
      ).rejects.toMatchObject({ code: "ALREADY_HAS_ORGANIZATION", status: 409 });

      expect(createOrganizationMock).not.toHaveBeenCalled();
    });

    it("creates the organization as a system action, activates it, and records an AuditLog row", async () => {
      listOrganizationsMock.mockResolvedValue([]);
      createOrganizationMock.mockResolvedValue(fullOrg);
      setActiveOrganizationMock.mockResolvedValue({});

      const result = await service.createOrganizationForSession(headers, "u1", "req1", {
        name: "Sweet Salad",
      });

      expect(createOrganizationMock).toHaveBeenCalledWith({
        body: { name: "Sweet Salad", slug: "sweet-salad", userId: "u1" },
      });
      expect(setActiveOrganizationMock).toHaveBeenCalledWith({
        headers,
        body: { organizationId: "org1" },
      });

      expect(forTenantAuditLogCreate).toHaveBeenCalledTimes(1);
      const call = forTenantAuditLogCreate.mock.calls[0][0];
      expect(call.data).toMatchObject({
        branchId: null,
        actorId: "u1",
        action: "organization.create",
        entity: "Organization",
        entityId: "org1",
        requestId: "req1",
      });

      expect(result).toEqual({
        id: "org1",
        name: "Sweet Salad",
        slug: "sweet-salad",
        logo: null,
        address: "123 Main St",
        phone: "555-0100",
        description: "A cozy neighborhood bakery.",
      });
    });

    it("retries with a suffixed slug on a slug collision, then succeeds", async () => {
      listOrganizationsMock.mockResolvedValue([]);
      const collision = new APIError("BAD_REQUEST", { code: "ORGANIZATION_ALREADY_EXISTS" });
      createOrganizationMock.mockRejectedValueOnce(collision).mockResolvedValueOnce(fullOrg);
      setActiveOrganizationMock.mockResolvedValue({});

      const result = await service.createOrganizationForSession(headers, "u1", "req1", {
        name: "Sweet Salad",
      });

      expect(createOrganizationMock).toHaveBeenCalledTimes(2);
      expect(createOrganizationMock.mock.calls[0][0].body.slug).toBe("sweet-salad");
      expect(createOrganizationMock.mock.calls[1][0].body.slug).not.toBe("sweet-salad");
      expect(result.id).toBe("org1");
    });

    it("rethrows a non-slug-collision APIError from auth.api.createOrganization", async () => {
      listOrganizationsMock.mockResolvedValue([]);
      const forbidden = new APIError("FORBIDDEN", { code: "SOME_OTHER_ERROR" });
      createOrganizationMock.mockRejectedValue(forbidden);

      await expect(
        service.createOrganizationForSession(headers, "u1", "req1", { name: "Sweet Salad" }),
      ).rejects.toMatchObject({ code: "SOME_OTHER_ERROR" });
    });
  });
});
