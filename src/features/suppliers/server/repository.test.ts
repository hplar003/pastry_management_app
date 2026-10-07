import { describe, expect, it, vi } from "vitest";
import * as repository from "./repository";

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  contactName: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

function makeDb() {
  return {
    supplier: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    // Cast through unknown — only `supplier` is exercised by these tests.
  } as unknown as Parameters<typeof repository.create>[0];
}

describe("suppliers repository", () => {
  it("create() passes data straight through with the DTO select", async () => {
    const db = makeDb();
    const data = { name: "Acme Flour Co" };
    await repository.create(db, data);

    expect(db.supplier.create).toHaveBeenCalledOnce();
    expect(db.supplier.create).toHaveBeenCalledWith({
      data,
      select: SUPPLIER_SELECT,
    });
  });

  it("findMany() queries non-deleted rows newest-first with pagination, plus a matching count", async () => {
    const db = makeDb();
    (db.supplier.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "s1" }]);
    (db.supplier.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await repository.findMany(db, { limit: 20, offset: 0 });

    expect(db.supplier.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
      select: SUPPLIER_SELECT,
    });
    expect(db.supplier.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(result).toEqual({ items: [{ id: "s1" }], total: 1 });
  });

  it("findById() uses findFirst (not findUnique) scoped to id + deletedAt: null", async () => {
    const db = makeDb();
    (db.supplier.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "s1" });

    const result = await repository.findById(db, "s1");

    expect(db.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: "s1", deletedAt: null },
      select: SUPPLIER_SELECT,
    });
    expect(result).toEqual({ id: "s1" });
  });

  it("findById() returns null when no row matches", async () => {
    const db = makeDb();
    (db.supplier.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await repository.findById(db, "missing");

    expect(result).toBeNull();
  });

  it("update() uses a bare id where (no deletedAt in where)", async () => {
    const db = makeDb();
    const data = { name: "New Name" };
    await repository.update(db, "s1", data);

    expect(db.supplier.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data,
      select: SUPPLIER_SELECT,
    });
  });

  it("softDelete() sets deletedAt via update with a bare id where", async () => {
    const db = makeDb();
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await repository.softDelete(db, "s1");

    expect(db.supplier.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { deletedAt: now },
      select: SUPPLIER_SELECT,
    });

    vi.useRealTimers();
  });
});
