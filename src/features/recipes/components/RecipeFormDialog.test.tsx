import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecipeFormDialog } from "./RecipeFormDialog";
import * as recipesHooks from "@/features/recipes/hooks/use-recipes";
import * as ingredientsHooks from "@/features/inventory/hooks/use-ingredients";
import type { RecipeWithIngredients } from "@/features/recipes/api";

vi.mock("@/features/recipes/hooks/use-recipes");
vi.mock("@/features/inventory/hooks/use-ingredients");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function mockMutation<T>(): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ id: "r1" }),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
  } as unknown as T;
}

const flour = {
  id: "i1",
  name: "Flour",
  unit: "kg",
  reorderThreshold: null,
  supplierId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sugar = {
  id: "i2",
  name: "Sugar",
  unit: "kg",
  reorderThreshold: null,
  supplierId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const existingRecipe: RecipeWithIngredients = {
  id: "r1",
  name: "Croissant",
  description: null,
  yieldQuantity: "12",
  yieldUnit: "pcs",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ingredients: [
    { id: "ri1", ingredientId: "i1", quantity: "0.5", ingredient: { name: "Flour", unit: "kg" } },
    { id: "ri2", ingredientId: "i2", quantity: "0.2", ingredient: { name: "Sugar", unit: "kg" } },
  ],
};

describe("RecipeFormDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ingredientsHooks.useIngredientsQuery).mockReturnValue({
      data: { items: [flour, sugar], total: 2, limit: 100, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof ingredientsHooks.useIngredientsQuery>);
    vi.mocked(recipesHooks.useRecipeQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof recipesHooks.useRecipeQuery>);
  });

  it("create mode: submits one ingredient row by default", async () => {
    const createMutation = mockMutation<ReturnType<typeof recipesHooks.useCreateRecipeMutation>>();
    vi.mocked(recipesHooks.useCreateRecipeMutation).mockReturnValue(createMutation);
    vi.mocked(recipesHooks.useUpdateRecipeMutation).mockReturnValue(
      mockMutation<ReturnType<typeof recipesHooks.useUpdateRecipeMutation>>(),
    );

    const onClose = vi.fn();
    render(<RecipeFormDialog open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Croissant" } });
    fireEvent.change(screen.getByLabelText(/yield quantity/i), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/yield unit/i), { target: { value: "pcs" } });

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Ingredient 1" }));
    fireEvent.click(await screen.findByRole("option", { name: "Flour" }));
    fireEvent.change(screen.getByLabelText(/^quantity/i), { target: { value: "0.5" } });

    fireEvent.click(screen.getByRole("button", { name: /create recipe/i }));

    await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalled());
    expect(createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Croissant",
        yieldQuantity: 12,
        yieldUnit: "pcs",
        ingredients: [{ ingredientId: "i1", quantity: 0.5 }],
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("create mode: adding and removing ingredient rows", async () => {
    const createMutation = mockMutation<ReturnType<typeof recipesHooks.useCreateRecipeMutation>>();
    vi.mocked(recipesHooks.useCreateRecipeMutation).mockReturnValue(createMutation);
    vi.mocked(recipesHooks.useUpdateRecipeMutation).mockReturnValue(
      mockMutation<ReturnType<typeof recipesHooks.useUpdateRecipeMutation>>(),
    );

    render(<RecipeFormDialog open onClose={vi.fn()} />);

    // Only one row initially — its remove button is disabled (can't go to zero rows).
    expect(screen.getByRole("button", { name: /remove ingredient row 1/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /add ingredient/i }));
    expect(screen.getByRole("combobox", { name: "Ingredient 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove ingredient row 1/i })).toBeEnabled();

    // Fill both rows with distinct ingredients.
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Ingredient 1" }));
    fireEvent.click(await screen.findByRole("option", { name: "Flour" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Ingredient 2" }));
    fireEvent.click(await screen.findByRole("option", { name: "Sugar" }));

    const quantityInputs = screen.getAllByLabelText(/^quantity/i);
    fireEvent.change(quantityInputs[0], { target: { value: "1" } });
    fireEvent.change(quantityInputs[1], { target: { value: "2" } });

    // Now remove row 2, leaving only Flour.
    fireEvent.click(screen.getByRole("button", { name: /remove ingredient row 2/i }));
    expect(screen.queryByRole("combobox", { name: "Ingredient 2" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Croissant" } });
    fireEvent.change(screen.getByLabelText(/yield quantity/i), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/yield unit/i), { target: { value: "pcs" } });
    fireEvent.click(screen.getByRole("button", { name: /create recipe/i }));

    await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalled());
    expect(createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ ingredients: [{ ingredientId: "i1", quantity: 1 }] }),
    );
  });

  it("rejects submitting the same ingredient in two rows", async () => {
    const createMutation = mockMutation<ReturnType<typeof recipesHooks.useCreateRecipeMutation>>();
    vi.mocked(recipesHooks.useCreateRecipeMutation).mockReturnValue(createMutation);
    vi.mocked(recipesHooks.useUpdateRecipeMutation).mockReturnValue(
      mockMutation<ReturnType<typeof recipesHooks.useUpdateRecipeMutation>>(),
    );

    render(<RecipeFormDialog open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /add ingredient/i }));

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Ingredient 1" }));
    fireEvent.click(await screen.findByRole("option", { name: "Flour" }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Ingredient 2" }));
    fireEvent.click(await screen.findByRole("option", { name: "Flour" }));

    const quantityInputs = screen.getAllByLabelText(/^quantity/i);
    fireEvent.change(quantityInputs[0], { target: { value: "1" } });
    fireEvent.change(quantityInputs[1], { target: { value: "2" } });

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Croissant" } });
    fireEvent.change(screen.getByLabelText(/yield quantity/i), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/yield unit/i), { target: { value: "pcs" } });
    fireEvent.click(screen.getByRole("button", { name: /create recipe/i }));

    expect(await screen.findByText(/each ingredient can only appear once/i)).toBeInTheDocument();
    expect(createMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("edit mode: pre-populates the full current ingredient list and resends every row on save", async () => {
    vi.mocked(recipesHooks.useRecipeQuery).mockReturnValue({
      data: existingRecipe,
      isLoading: false,
    } as unknown as ReturnType<typeof recipesHooks.useRecipeQuery>);

    const updateMutation = mockMutation<ReturnType<typeof recipesHooks.useUpdateRecipeMutation>>();
    vi.mocked(recipesHooks.useUpdateRecipeMutation).mockReturnValue(updateMutation);
    vi.mocked(recipesHooks.useCreateRecipeMutation).mockReturnValue(
      mockMutation<ReturnType<typeof recipesHooks.useCreateRecipeMutation>>(),
    );

    const onClose = vi.fn();
    render(<RecipeFormDialog open onClose={onClose} recipeId="r1" />);

    // Both existing rows are pre-populated.
    await waitFor(() => expect(screen.getByDisplayValue("Flour")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Sugar")).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toHaveValue("Croissant");

    // User only touches the recipe name — never touches the ingredient rows.
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Croissant (updated)" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalled());
    // The FULL current set of rows must be resent — not just the touched field — because
    // `updateRecipeSchema`'s `ingredients` REPLACES the entire line-item list server-side.
    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
      id: "r1",
      input: expect.objectContaining({
        name: "Croissant (updated)",
        ingredients: [
          { ingredientId: "i1", quantity: 0.5 },
          { ingredientId: "i2", quantity: 0.2 },
        ],
      }),
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("edit mode: shows a loading state until the full recipe (with ingredients) has loaded", () => {
    vi.mocked(recipesHooks.useRecipeQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof recipesHooks.useRecipeQuery>);
    vi.mocked(recipesHooks.useCreateRecipeMutation).mockReturnValue(
      mockMutation<ReturnType<typeof recipesHooks.useCreateRecipeMutation>>(),
    );
    vi.mocked(recipesHooks.useUpdateRecipeMutation).mockReturnValue(
      mockMutation<ReturnType<typeof recipesHooks.useUpdateRecipeMutation>>(),
    );

    render(<RecipeFormDialog open onClose={vi.fn()} recipeId="r1" />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
  });
});
