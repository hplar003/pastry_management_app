import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@/server/errors";

vi.mock("./repository", () => ({
  createIngredient: vi.fn(),
  findManyIngredients: vi.fn(),
  findIngredientById: vi.fn(),
  updateIngredient: vi.fn(),
  softDeleteIngredient: vi.fn(),
  listCurrentStock: vi.fn(),
  listMovements: vi.fn(),
}));

const { teamFindFirst, withTenantTxMock } = vi.hoisted(() => ({
  teamFindFirst: vi.fn(),
  withTenantTxMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: { team: { findFirst: teamFindFirst } },
  withTenantTx: withTenantTxMock,
}));

import * as repository from "./repository";
import * as service from "./service";

const supplierFindFirst = vi.fn();

const ctx = {
  userId: "u1",
  organizationId: "org1",
  branchId: "branch1",
  requestId: "req1",
  db: {
    supplier: { findFirst: supplierFindFirst },
  } as never,
};

describe("inventory service — ingredients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createIngredient", () => {
    it("creates without checking a supplier when supplierId is omitted", async () => {
      const input = { name: "Flour", unit: "kg" };
      (repository.createIngredient as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "i1",
        ...input,
      });

      const result = await service.createIngredient(ctx, input);

      expect(supplierFindFirst).not.toHaveBeenCalled();
      expect(repository.createIngredient).toHaveBeenCalledWith(ctx.db, input);
      expect(result).toEqual({ id: "i1", ...input });
    });

    it("verifies supplierId resolves to a real, non-deleted supplier before creating", async () => {
      const input = { name: "Flour", unit: "kg", supplierId: "s1" };
      supplierFindFirst.mockResolvedValue({ id: "s1" });
      (repository.createIngredient as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "i1",
        ...input,
      });

      await service.createIngredient(ctx, input);

      expect(supplierFindFirst).toHaveBeenCalledWith({
        where: { id: "s1", deletedAt: null },
        select: { id: true },
      });
      expect(repository.createIngredient).toHaveBeenCalledWith(ctx.db, input);
    });

    it("throws ValidationError when supplierId does not resolve, without creating", async () => {
      const input = { name: "Flour", unit: "kg", supplierId: "missing" };
      supplierFindFirst.mockResolvedValue(null);

      await expect(service.createIngredient(ctx, input)).rejects.toThrow(ValidationError);
      expect(repository.createIngredient).not.toHaveBeenCalled();
    });
  });

  describe("listIngredients", () => {
    it("builds the pagination envelope from the repository result", async () => {
      (repository.findManyIngredients as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [{ id: "i1" }, { id: "i2" }],
        total: 2,
      });

      const result = await service.listIngredients(ctx, { limit: 10, offset: 0 });

      expect(repository.findManyIngredients).toHaveBeenCalledWith(ctx.db, {
        limit: 10,
        offset: 0,
      });
      expect(result).toEqual({
        items: [{ id: "i1" }, { id: "i2" }],
        total: 2,
        limit: 10,
        offset: 0,
      });
    });
  });

  describe("getIngredient", () => {
    it("returns the ingredient when found", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });

      const result = await service.getIngredient(ctx, "i1");

      expect(result).toEqual({ id: "i1" });
    });

    it("throws NotFoundError when not found", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.getIngredient(ctx, "missing")).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateIngredient", () => {
    it("throws NotFoundError when the ingredient doesn't exist, without checking supplier or updating", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.updateIngredient(ctx, "missing", { name: "New" }),
      ).rejects.toThrow(NotFoundError);
      expect(supplierFindFirst).not.toHaveBeenCalled();
      expect(repository.updateIngredient).not.toHaveBeenCalled();
    });

    it("throws ValidationError when supplierId doesn't resolve, without updating", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });
      supplierFindFirst.mockResolvedValue(null);

      await expect(
        service.updateIngredient(ctx, "i1", { supplierId: "missing" }),
      ).rejects.toThrow(ValidationError);
      expect(repository.updateIngredient).not.toHaveBeenCalled();
    });

    it("updates when the row exists and supplierId (if given) resolves", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });
      (repository.updateIngredient as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "i1",
        name: "New",
      });

      const result = await service.updateIngredient(ctx, "i1", { name: "New" });

      expect(repository.updateIngredient).toHaveBeenCalledWith(ctx.db, "i1", { name: "New" });
      expect(result).toEqual({ id: "i1", name: "New" });
    });
  });

  describe("deleteIngredient", () => {
    it("throws NotFoundError when the ingredient doesn't exist, without deleting", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.deleteIngredient(ctx, "missing")).rejects.toThrow(NotFoundError);
      expect(repository.softDeleteIngredient).not.toHaveBeenCalled();
    });

    it("soft-deletes when the row exists", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });

      await service.deleteIngredient(ctx, "i1");

      expect(repository.softDeleteIngredient).toHaveBeenCalledWith(ctx.db, "i1");
    });
  });
});

describe("inventory service — stock ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listCurrentStock", () => {
    it("throws when branchId is missing", async () => {
      const noBranchCtx = { ...ctx, branchId: null };
      await expect(service.listCurrentStock(noBranchCtx)).rejects.toThrow("BRANCH_REQUIRED");
      expect(repository.listCurrentStock).not.toHaveBeenCalled();
    });

    it("delegates to the repository with ctx.branchId", async () => {
      (repository.listCurrentStock as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "i1" }]);

      const result = await service.listCurrentStock(ctx);

      expect(repository.listCurrentStock).toHaveBeenCalledWith(ctx.db, "branch1");
      expect(result).toEqual([{ id: "i1" }]);
    });
  });

  describe("listMovements", () => {
    it("throws when branchId is missing", async () => {
      const noBranchCtx = { ...ctx, branchId: null };
      await expect(
        service.listMovements(noBranchCtx, { limit: 20, offset: 0 }),
      ).rejects.toThrow("BRANCH_REQUIRED");
      expect(repository.listMovements).not.toHaveBeenCalled();
    });

    it("builds the pagination envelope, forwarding the optional ingredientId filter", async () => {
      (repository.listMovements as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [{ id: "m1" }],
        total: 1,
      });

      const result = await service.listMovements(ctx, {
        limit: 20,
        offset: 0,
        ingredientId: "i1",
      });

      expect(repository.listMovements).toHaveBeenCalledWith(ctx.db, {
        branchId: "branch1",
        ingredientId: "i1",
        limit: 20,
        offset: 0,
      });
      expect(result).toEqual({ items: [{ id: "m1" }], total: 1, limit: 20, offset: 0 });
    });
  });

  describe("adjustStock", () => {
    function makeFakeTx() {
      return {
        stockMovement: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
    }

    it("throws when branchId is missing", async () => {
      const noBranchCtx = { ...ctx, branchId: null };
      await expect(
        service.adjustStock(noBranchCtx, { ingredientId: "i1", qty: 5, reason: "recount" }),
      ).rejects.toThrow("BRANCH_REQUIRED");
    });

    it("throws ValidationError when the ingredient doesn't exist, without opening a transaction", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        service.adjustStock(ctx, { ingredientId: "missing", qty: 5, reason: "recount" }),
      ).rejects.toThrow(ValidationError);
      expect(withTenantTxMock).not.toHaveBeenCalled();
    });

    it("creates one StockMovement and one AuditLog row inside the same transaction", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });
      const tx = makeFakeTx();
      const movement = {
        id: "m1",
        ingredientId: "i1",
        type: "ADJUSTMENT",
        qty: 5,
        reason: "recount",
        actorId: "u1",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
      tx.stockMovement.create.mockResolvedValue(movement);
      withTenantTxMock.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.adjustStock(ctx, {
        ingredientId: "i1",
        qty: 5,
        reason: "recount",
      });

      expect(withTenantTxMock).toHaveBeenCalledWith(ctx, expect.any(Function));
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org1",
          branchId: "branch1",
          ingredientId: "i1",
          type: "ADJUSTMENT",
          qty: 5,
          reason: "recount",
          actorId: "u1",
        },
        select: {
          id: true,
          ingredientId: true,
          type: true,
          qty: true,
          reason: true,
          actorId: true,
          createdAt: true,
        },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org1",
          branchId: "branch1",
          actorId: "u1",
          action: "inventory.adjust",
          entity: "StockMovement",
          entityId: "m1",
          after: movement,
          requestId: "req1",
        },
      });
      expect(result).toEqual(movement);
    });
  });

  describe("transferStock", () => {
    function makeFakeTx() {
      return {
        stockMovement: { create: vi.fn() },
        auditLog: { create: vi.fn() },
      };
    }

    const input = {
      ingredientId: "i1",
      quantity: 5,
      reason: "rebalance",
      toBranchId: "branch2",
    };

    it("throws when branchId is missing", async () => {
      const noBranchCtx = { ...ctx, branchId: null };
      await expect(service.transferStock(noBranchCtx, input)).rejects.toThrow("BRANCH_REQUIRED");
    });

    it("rejects a transfer to the same branch, without checking the ingredient or team", async () => {
      await expect(
        service.transferStock(ctx, { ...input, toBranchId: "branch1" }),
      ).rejects.toThrow(ValidationError);
      expect(repository.findIngredientById).not.toHaveBeenCalled();
      expect(teamFindFirst).not.toHaveBeenCalled();
    });

    it("throws ValidationError when the ingredient doesn't exist, without checking the team", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.transferStock(ctx, input)).rejects.toThrow(ValidationError);
      expect(teamFindFirst).not.toHaveBeenCalled();
      expect(withTenantTxMock).not.toHaveBeenCalled();
    });

    it("verifies toBranchId via the raw db export (not ctx.db) scoped to this org", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });
      teamFindFirst.mockResolvedValue(null);

      await expect(service.transferStock(ctx, input)).rejects.toThrow(ValidationError);
      expect(teamFindFirst).toHaveBeenCalledWith({
        where: { id: "branch2", organizationId: "org1" },
        select: { id: true },
      });
      expect(withTenantTxMock).not.toHaveBeenCalled();
    });

    it("creates two opposite-signed StockMovement rows and one AuditLog row in one transaction", async () => {
      (repository.findIngredientById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });
      teamFindFirst.mockResolvedValue({ id: "branch2" });
      const tx = makeFakeTx();
      const outMovement = { id: "out1", qty: -5, type: "TRANSFER_OUT" };
      const inMovement = { id: "in1", qty: 5, type: "TRANSFER_IN" };
      tx.stockMovement.create
        .mockResolvedValueOnce(outMovement)
        .mockResolvedValueOnce(inMovement);
      withTenantTxMock.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.transferStock(ctx, input);

      expect(tx.stockMovement.create).toHaveBeenNthCalledWith(1, {
        data: {
          organizationId: "org1",
          branchId: "branch1",
          ingredientId: "i1",
          type: "TRANSFER_OUT",
          qty: -5,
          reason: "rebalance",
          actorId: "u1",
        },
        select: expect.any(Object),
      });
      expect(tx.stockMovement.create).toHaveBeenNthCalledWith(2, {
        data: {
          organizationId: "org1",
          branchId: "branch2",
          ingredientId: "i1",
          type: "TRANSFER_IN",
          qty: 5,
          reason: "rebalance",
          actorId: "u1",
        },
        select: expect.any(Object),
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org1",
          branchId: "branch1",
          actorId: "u1",
          action: "inventory.transfer",
          entity: "StockMovement",
          entityId: "out1",
          after: { out: outMovement, in: inMovement },
          requestId: "req1",
        },
      });
      expect(result).toEqual({ out: outMovement, in: inMovement });
    });
  });
});
