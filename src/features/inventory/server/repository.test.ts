import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import * as repository from "./repository";

const INGREDIENT_SELECT = {
  id: true,
  name: true,
  unit: true,
  reorderThreshold: true,
  supplierId: true,
  createdAt: true,
  updatedAt: true,
};

const MOVEMENT_SELECT = {
  id: true,
  ingredientId: true,
  type: true,
  qty: true,
  reason: true,
  actorId: true,
  createdAt: true,
};

function makeDb() {
  return {
    ingredient: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    stockMovement: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    // Cast through unknown — only the models exercised by these tests exist.
  } as unknown as Parameters<typeof repository.createIngredient>[0];
}

describe("inventory repository — ingredients", () => {
  it("createIngredient() passes data straight through with the DTO select", async () => {
    const db = makeDb();
    const data = { name: "Flour", unit: "kg" };
    await repository.createIngredient(db, data);

    expect(db.ingredient.create).toHaveBeenCalledOnce();
    expect(db.ingredient.create).toHaveBeenCalledWith({
      data,
      select: INGREDIENT_SELECT,
    });
  });

  it("findManyIngredients() queries non-deleted rows newest-first with pagination, plus a matching count", async () => {
    const db = makeDb();
    (db.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "i1" }]);
    (db.ingredient.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await repository.findManyIngredients(db, { limit: 20, offset: 0 });

    expect(db.ingredient.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
      select: INGREDIENT_SELECT,
    });
    expect(db.ingredient.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(result).toEqual({ items: [{ id: "i1" }], total: 1 });
  });

  it("findIngredientById() uses findFirst (not findUnique) scoped to id + deletedAt: null", async () => {
    const db = makeDb();
    (db.ingredient.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "i1" });

    const result = await repository.findIngredientById(db, "i1");

    expect(db.ingredient.findFirst).toHaveBeenCalledWith({
      where: { id: "i1", deletedAt: null },
      select: INGREDIENT_SELECT,
    });
    expect(result).toEqual({ id: "i1" });
  });

  it("findIngredientById() returns null when no row matches", async () => {
    const db = makeDb();
    (db.ingredient.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await repository.findIngredientById(db, "missing");

    expect(result).toBeNull();
  });

  it("updateIngredient() uses a bare id where (no deletedAt in where)", async () => {
    const db = makeDb();
    const data = { name: "New Name" };
    await repository.updateIngredient(db, "i1", data);

    expect(db.ingredient.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data,
      select: INGREDIENT_SELECT,
    });
  });

  it("softDeleteIngredient() sets deletedAt via update with a bare id where", async () => {
    const db = makeDb();
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await repository.softDeleteIngredient(db, "i1");

    expect(db.ingredient.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { deletedAt: now },
      select: INGREDIENT_SELECT,
    });

    vi.useRealTimers();
  });
});

describe("inventory repository — stock ledger", () => {
  it("listCurrentStock() merges every non-deleted ingredient with its per-branch sum, defaulting to zero", async () => {
    const db = makeDb();
    (db.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "i1", name: "Flour", unit: "kg" },
      { id: "i2", name: "Sugar", unit: "kg" },
    ]);
    (db.stockMovement.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ingredientId: "i1", _sum: { qty: new Prisma.Decimal(12.5) } },
    ]);

    const result = await repository.listCurrentStock(db, "branch1");

    expect(db.ingredient.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    });
    expect(db.stockMovement.groupBy).toHaveBeenCalledWith({
      by: ["ingredientId"],
      where: { branchId: "branch1" },
      _sum: { qty: true },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "i1",
      name: "Flour",
      unit: "kg",
      quantity: new Prisma.Decimal(12.5),
    });
    // i2 has no movements — falls back to a Decimal zero, not plain 0.
    expect(result[1].id).toBe("i2");
    expect(result[1].quantity).toBeInstanceOf(Prisma.Decimal);
    expect((result[1].quantity as Prisma.Decimal).toNumber()).toBe(0);
  });

  it("listMovements() filters by branch, optionally by ingredient, newest-first with pagination", async () => {
    const db = makeDb();
    (db.stockMovement.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "m1" }]);
    (db.stockMovement.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await repository.listMovements(db, {
      branchId: "branch1",
      ingredientId: "i1",
      limit: 20,
      offset: 0,
    });

    expect(db.stockMovement.findMany).toHaveBeenCalledWith({
      where: { branchId: "branch1", ingredientId: "i1" },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
      select: MOVEMENT_SELECT,
    });
    expect(db.stockMovement.count).toHaveBeenCalledWith({
      where: { branchId: "branch1", ingredientId: "i1" },
    });
    expect(result).toEqual({ items: [{ id: "m1" }], total: 1 });
  });

  it("listMovements() omits the ingredientId filter when not given", async () => {
    const db = makeDb();
    (db.stockMovement.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.stockMovement.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await repository.listMovements(db, { branchId: "branch1", limit: 20, offset: 0 });

    expect(db.stockMovement.findMany).toHaveBeenCalledWith({
      where: { branchId: "branch1" },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
      select: MOVEMENT_SELECT,
    });
  });
});
