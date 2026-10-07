import { describe, expect, it, vi } from "vitest";
import * as repository from "./repository";

const AUDIT_LOG_SELECT = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  actorId: true,
  branchId: true,
  before: true,
  after: true,
  createdAt: true,
};

function makeDb() {
  return {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    // Cast through unknown — only `auditLog` is exercised by these tests.
  } as unknown as Parameters<typeof repository.findMany>[0];
}

describe("audit-log repository", () => {
  describe("findMany", () => {
    it("queries newest-first with pagination and no filters, plus a matching count", async () => {
      const db = makeDb();
      (db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "a1" }]);
      (db.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await repository.findMany(db, { limit: 20, offset: 0 });

      expect(db.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: 0,
        select: AUDIT_LOG_SELECT,
      });
      expect(db.auditLog.count).toHaveBeenCalledWith({ where: {} });
      expect(result).toEqual({ items: [{ id: "a1" }], total: 1 });
    });

    it("filters by action when provided", async () => {
      const db = makeDb();
      (db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (db.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await repository.findMany(db, { limit: 20, offset: 0, action: "branch.create" });

      expect(db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { action: "branch.create" } }),
      );
      expect(db.auditLog.count).toHaveBeenCalledWith({ where: { action: "branch.create" } });
    });

    it("filters by entity when provided", async () => {
      const db = makeDb();
      (db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (db.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await repository.findMany(db, { limit: 20, offset: 0, entity: "Branch" });

      expect(db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entity: "Branch" } }),
      );
      expect(db.auditLog.count).toHaveBeenCalledWith({ where: { entity: "Branch" } });
    });

    it("combines action and entity filters", async () => {
      const db = makeDb();
      (db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (db.auditLog.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      await repository.findMany(db, {
        limit: 20,
        offset: 0,
        action: "branch.create",
        entity: "Branch",
      });

      expect(db.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { action: "branch.create", entity: "Branch" } }),
      );
    });
  });

  describe("listActions", () => {
    it("queries distinct action values, ordered ascending", async () => {
      const db = makeDb();
      (db.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { action: "branch.create" },
        { action: "branch.delete" },
      ]);

      const result = await repository.listActions(db);

      expect(db.auditLog.findMany).toHaveBeenCalledWith({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      });
      expect(result).toEqual(["branch.create", "branch.delete"]);
    });
  });
});
