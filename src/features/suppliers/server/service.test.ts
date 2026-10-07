import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/server/errors";

vi.mock("./repository", () => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
}));

import * as repository from "./repository";
import * as service from "./service";

const ctx = {
  userId: "u1",
  organizationId: "org1",
  branchId: null,
  requestId: "req1",
  db: {} as never,
};

describe("suppliers service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSupplier", () => {
    it("passes straight through to the repository", async () => {
      const input = { name: "Acme" };
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1", ...input });

      const result = await service.createSupplier(ctx, input);

      expect(repository.create).toHaveBeenCalledWith(ctx.db, input);
      expect(result).toEqual({ id: "s1", ...input });
    });
  });

  describe("listSuppliers", () => {
    it("builds the pagination envelope from the repository result", async () => {
      (repository.findMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [{ id: "s1" }, { id: "s2" }],
        total: 2,
      });

      const result = await service.listSuppliers(ctx, { limit: 10, offset: 0 });

      expect(repository.findMany).toHaveBeenCalledWith(ctx.db, { limit: 10, offset: 0 });
      expect(result).toEqual({
        items: [{ id: "s1" }, { id: "s2" }],
        total: 2,
        limit: 10,
        offset: 0,
      });
    });
  });

  describe("getSupplier", () => {
    it("returns the supplier when found", async () => {
      (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1" });

      const result = await service.getSupplier(ctx, "s1");

      expect(repository.findById).toHaveBeenCalledWith(ctx.db, "s1");
      expect(result).toEqual({ id: "s1" });
    });

    it("throws NotFoundError when not found", async () => {
      (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.getSupplier(ctx, "missing")).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateSupplier", () => {
    it("throws NotFoundError when findById returns null, without calling update", async () => {
      (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.updateSupplier(ctx, "missing", { name: "New" })).rejects.toThrow(
        NotFoundError,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("updates when the row exists", async () => {
      (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1" });
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1", name: "New" });

      const result = await service.updateSupplier(ctx, "s1", { name: "New" });

      expect(repository.findById).toHaveBeenCalledWith(ctx.db, "s1");
      expect(repository.update).toHaveBeenCalledWith(ctx.db, "s1", { name: "New" });
      expect(result).toEqual({ id: "s1", name: "New" });
    });
  });

  describe("deleteSupplier", () => {
    it("throws NotFoundError when findById returns null, without calling softDelete", async () => {
      (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.deleteSupplier(ctx, "missing")).rejects.toThrow(NotFoundError);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it("soft-deletes when the row exists", async () => {
      (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1" });
      (repository.softDelete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1" });

      await service.deleteSupplier(ctx, "s1");

      expect(repository.findById).toHaveBeenCalledWith(ctx.db, "s1");
      expect(repository.softDelete).toHaveBeenCalledWith(ctx.db, "s1");
    });
  });
});
