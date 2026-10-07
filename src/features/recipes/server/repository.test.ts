import { describe, expect, it, vi } from "vitest";
import * as repository from "./repository";

const RECIPE_SELECT = {
  id: true,
  name: true,
  description: true,
  yieldQuantity: true,
  yieldUnit: true,
  createdAt: true,
  updatedAt: true,
};

const RECIPE_INGREDIENT_SELECT = {
  id: true,
  ingredientId: true,
  quantity: true,
  ingredient: {
    select: { name: true, unit: true },
  },
};

function makeDb() {
  return {
    recipe: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    // Cast through unknown — only the models exercised by these tests exist.
  } as unknown as Parameters<typeof repository.createRecipe>[0];
}

describe("recipes repository", () => {
  it("createRecipe() passes data straight through with the DTO select", async () => {
    const db = makeDb();
    const data = { name: "Croissant", yieldQuantity: 12, yieldUnit: "pcs" };
    await repository.createRecipe(db, data);

    expect(db.recipe.create).toHaveBeenCalledOnce();
    expect(db.recipe.create).toHaveBeenCalledWith({
      data,
      select: RECIPE_SELECT,
    });
  });

  it("findManyRecipes() queries non-deleted rows newest-first with pagination, scalar fields only, plus a matching count", async () => {
    const db = makeDb();
    (db.recipe.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "r1" }]);
    (db.recipe.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const result = await repository.findManyRecipes(db, { limit: 20, offset: 0 });

    expect(db.recipe.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 0,
      select: RECIPE_SELECT,
    });
    expect(db.recipe.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(result).toEqual({ items: [{ id: "r1" }], total: 1 });
  });

  it("findRecipeById() uses findFirst scoped to id + deletedAt: null, including nested line items", async () => {
    const db = makeDb();
    (db.recipe.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "r1" });

    const result = await repository.findRecipeById(db, "r1");

    expect(db.recipe.findFirst).toHaveBeenCalledWith({
      where: { id: "r1", deletedAt: null },
      select: {
        ...RECIPE_SELECT,
        recipeIngredients: { select: RECIPE_INGREDIENT_SELECT },
      },
    });
    expect(result).toEqual({ id: "r1" });
  });

  it("findRecipeById() returns null when no row matches", async () => {
    const db = makeDb();
    (db.recipe.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await repository.findRecipeById(db, "missing");

    expect(result).toBeNull();
  });

  it("softDeleteRecipe() sets deletedAt via update with a bare id where", async () => {
    const db = makeDb();
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    await repository.softDeleteRecipe(db, "r1");

    expect(db.recipe.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { deletedAt: now },
      select: RECIPE_SELECT,
    });

    vi.useRealTimers();
  });
});
