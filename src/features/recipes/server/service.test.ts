import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@/server/errors";
import { createRecipeSchema } from "@/features/recipes/schemas";

vi.mock("./repository", () => ({
  createRecipe: vi.fn(),
  findManyRecipes: vi.fn(),
  findRecipeById: vi.fn(),
  softDeleteRecipe: vi.fn(),
}));

const { withTenantTxMock } = vi.hoisted(() => ({
  withTenantTxMock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  withTenantTx: withTenantTxMock,
}));

import * as repository from "./repository";
import * as service from "./service";

const ingredientFindMany = vi.fn();

const ctx = {
  userId: "u1",
  organizationId: "org1",
  branchId: "branch1",
  requestId: "req1",
  db: {
    ingredient: { findMany: ingredientFindMany },
  } as never,
};

function makeFakeTx() {
  return {
    recipe: { create: vi.fn(), update: vi.fn() },
    recipeIngredient: { createMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  };
}

describe("recipes schema — duplicate ingredientId rejection", () => {
  it("rejects a create payload that lists the same ingredientId twice", () => {
    const result = createRecipeSchema.safeParse({
      name: "Croissant",
      yieldQuantity: 12,
      yieldUnit: "pcs",
      ingredients: [
        { ingredientId: "i1", quantity: 1 },
        { ingredientId: "i1", quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a create payload with distinct ingredientIds", () => {
    const result = createRecipeSchema.safeParse({
      name: "Croissant",
      yieldQuantity: 12,
      yieldUnit: "pcs",
      ingredients: [
        { ingredientId: "i1", quantity: 1 },
        { ingredientId: "i2", quantity: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("recipes service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listRecipes", () => {
    it("builds the pagination envelope from the repository result", async () => {
      (repository.findManyRecipes as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [{ id: "r1" }, { id: "r2" }],
        total: 2,
      });

      const result = await service.listRecipes(ctx, { limit: 10, offset: 0 });

      expect(repository.findManyRecipes).toHaveBeenCalledWith(ctx.db, { limit: 10, offset: 0 });
      expect(result).toEqual({ items: [{ id: "r1" }, { id: "r2" }], total: 2, limit: 10, offset: 0 });
    });
  });

  describe("getRecipe", () => {
    it("returns the recipe, renaming recipeIngredients to ingredients", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "r1",
        recipeIngredients: [{ id: "ri1" }],
      });

      const result = await service.getRecipe(ctx, "r1");

      expect(result).toEqual({ id: "r1", ingredients: [{ id: "ri1" }] });
    });

    it("throws NotFoundError when not found", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.getRecipe(ctx, "missing")).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteRecipe", () => {
    it("throws NotFoundError when the recipe doesn't exist, without deleting", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.deleteRecipe(ctx, "missing")).rejects.toThrow(NotFoundError);
      expect(repository.softDeleteRecipe).not.toHaveBeenCalled();
    });

    it("soft-deletes when the row exists", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "r1" });

      await service.deleteRecipe(ctx, "r1");

      expect(repository.softDeleteRecipe).toHaveBeenCalledWith(ctx.db, "r1");
    });
  });

  describe("createRecipe", () => {
    const input = {
      name: "Croissant",
      yieldQuantity: 12,
      yieldUnit: "pcs",
      ingredients: [
        { ingredientId: "i1", quantity: 1.5 },
        { ingredientId: "i2", quantity: 2 },
      ],
    };

    it("throws ValidationError when an ingredientId doesn't exist, without opening a transaction", async () => {
      ingredientFindMany.mockResolvedValue([{ id: "i1" }]); // only one of two found

      await expect(service.createRecipe(ctx, input)).rejects.toThrow(ValidationError);
      expect(withTenantTxMock).not.toHaveBeenCalled();
    });

    it("creates the Recipe row and all RecipeIngredient rows, each with organizationId, inside one transaction", async () => {
      ingredientFindMany.mockResolvedValue([{ id: "i1" }, { id: "i2" }]);
      const tx = makeFakeTx();
      const recipe = {
        id: "r1",
        name: "Croissant",
        description: undefined,
        yieldQuantity: 12,
        yieldUnit: "pcs",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      };
      tx.recipe.create.mockResolvedValue(recipe);
      const lineItems = [
        { id: "ri1", ingredientId: "i1", quantity: 1.5, ingredient: { name: "Flour", unit: "kg" } },
        { id: "ri2", ingredientId: "i2", quantity: 2, ingredient: { name: "Butter", unit: "kg" } },
      ];
      tx.recipeIngredient.findMany.mockResolvedValue(lineItems);
      withTenantTxMock.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.createRecipe(ctx, input);

      expect(ingredientFindMany).toHaveBeenCalledWith({
        where: { id: { in: ["i1", "i2"] }, deletedAt: null },
        select: { id: true },
      });
      expect(tx.recipe.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org1",
          name: "Croissant",
          description: undefined,
          yieldQuantity: 12,
          yieldUnit: "pcs",
        },
        select: expect.any(Object),
      });
      expect(tx.recipeIngredient.createMany).toHaveBeenCalledWith({
        data: [
          { organizationId: "org1", recipeId: "r1", ingredientId: "i1", quantity: 1.5 },
          { organizationId: "org1", recipeId: "r1", ingredientId: "i2", quantity: 2 },
        ],
      });
      expect(tx.recipeIngredient.findMany).toHaveBeenCalledWith({
        where: { recipeId: "r1" },
        select: expect.any(Object),
      });
      expect(result).toEqual({ ...recipe, ingredients: lineItems });
    });
  });

  describe("updateRecipe", () => {
    it("throws NotFoundError when the recipe doesn't exist, without opening a transaction", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.updateRecipe(ctx, "missing", { name: "New" })).rejects.toThrow(
        NotFoundError,
      );
      expect(withTenantTxMock).not.toHaveBeenCalled();
    });

    it("throws ValidationError when a replacement ingredientId doesn't exist, without opening a transaction", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "r1" });
      ingredientFindMany.mockResolvedValue([]);

      await expect(
        service.updateRecipe(ctx, "r1", { ingredients: [{ ingredientId: "missing", quantity: 1 }] }),
      ).rejects.toThrow(ValidationError);
      expect(withTenantTxMock).not.toHaveBeenCalled();
    });

    it("leaves RecipeIngredient alone when ingredients isn't in the input", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "r1" });
      const tx = makeFakeTx();
      tx.recipe.update.mockResolvedValue({ id: "r1", name: "New" });
      const lineItems = [{ id: "ri1", ingredientId: "i1", quantity: 1, ingredient: { name: "Flour", unit: "kg" } }];
      tx.recipeIngredient.findMany.mockResolvedValue(lineItems);
      withTenantTxMock.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.updateRecipe(ctx, "r1", { name: "New" });

      expect(tx.recipe.update).toHaveBeenCalledWith({
        where: { id: "r1", organizationId: "org1" },
        data: { name: "New" },
        select: expect.any(Object),
      });
      expect(tx.recipeIngredient.deleteMany).not.toHaveBeenCalled();
      expect(tx.recipeIngredient.createMany).not.toHaveBeenCalled();
      expect(tx.recipeIngredient.findMany).toHaveBeenCalledWith({
        where: { recipeId: "r1" },
        select: expect.any(Object),
      });
      expect(result).toEqual({ id: "r1", name: "New", ingredients: lineItems });
    });

    it("replaces RecipeIngredient (delete then createMany, each row with organizationId) when ingredients is provided", async () => {
      (repository.findRecipeById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "r1" });
      ingredientFindMany.mockResolvedValue([{ id: "i3" }]);
      const tx = makeFakeTx();
      tx.recipe.update.mockResolvedValue({ id: "r1" });
      const lineItems = [{ id: "ri3", ingredientId: "i3", quantity: 4, ingredient: { name: "Sugar", unit: "kg" } }];
      tx.recipeIngredient.findMany.mockResolvedValue(lineItems);
      withTenantTxMock.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.updateRecipe(ctx, "r1", {
        ingredients: [{ ingredientId: "i3", quantity: 4 }],
      });

      expect(tx.recipeIngredient.deleteMany).toHaveBeenCalledWith({
        where: { recipeId: "r1", organizationId: "org1" },
      });
      expect(tx.recipeIngredient.createMany).toHaveBeenCalledWith({
        data: [{ organizationId: "org1", recipeId: "r1", ingredientId: "i3", quantity: 4 }],
      });
      expect(result).toEqual({ id: "r1", ingredients: lineItems });
    });
  });
});
