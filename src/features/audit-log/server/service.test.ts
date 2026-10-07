import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./repository", () => ({
  findMany: vi.fn(),
  listActions: vi.fn(),
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

describe("audit-log service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listAuditLog", () => {
    it("builds the pagination envelope from the repository result, with no filters", async () => {
      (repository.findMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [{ id: "a1" }, { id: "a2" }],
        total: 2,
      });

      const result = await service.listAuditLog(ctx, {
        limit: 10,
        offset: 0,
        action: undefined,
        entity: undefined,
      });

      expect(repository.findMany).toHaveBeenCalledWith(ctx.db, {
        limit: 10,
        offset: 0,
        action: undefined,
        entity: undefined,
      });
      expect(result).toEqual({
        items: [{ id: "a1" }, { id: "a2" }],
        total: 2,
        limit: 10,
        offset: 0,
      });
    });

    it("passes the action and entity filters through to the repository", async () => {
      (repository.findMany as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

      await service.listAuditLog(ctx, {
        limit: 20,
        offset: 0,
        action: "branch.create",
        entity: "Branch",
      });

      expect(repository.findMany).toHaveBeenCalledWith(ctx.db, {
        limit: 20,
        offset: 0,
        action: "branch.create",
        entity: "Branch",
      });
    });
  });

  describe("listAuditLogActions", () => {
    it("passes straight through to the repository", async () => {
      (repository.listActions as ReturnType<typeof vi.fn>).mockResolvedValue([
        "branch.create",
        "branch.delete",
      ]);

      const result = await service.listAuditLogActions(ctx);

      expect(repository.listActions).toHaveBeenCalledWith(ctx.db);
      expect(result).toEqual(["branch.create", "branch.delete"]);
    });
  });
});
