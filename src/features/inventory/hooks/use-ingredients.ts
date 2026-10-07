"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ingredientsKeys } from "@/features/inventory/query-keys";
import {
  createIngredient,
  deleteIngredient,
  getIngredient,
  listIngredients,
  updateIngredient,
} from "@/features/inventory/api";
import type {
  CreateIngredientInput,
  ListIngredientsQuery,
  UpdateIngredientInput,
} from "@/features/inventory/schemas";

/**
 * Ingredient catalog CRUD hooks — same shape as
 * `src/features/suppliers/hooks/use-suppliers.ts`. `useIngredientsQuery`'s
 * name and return shape are depended on by Task 4 (Recipes' ingredient-line-
 * item `Autocomplete`), so keep both stable.
 */
export function useIngredientsQuery(params: ListIngredientsQuery) {
  return useQuery({
    queryKey: ingredientsKeys.list(params),
    queryFn: () => listIngredients(params),
  });
}

export function useIngredientQuery(id: string) {
  return useQuery({
    queryKey: ingredientsKeys.detail(id),
    queryFn: () => getIngredient(id),
    enabled: !!id,
  });
}

export function useCreateIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIngredientInput) => createIngredient(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientsKeys.all });
    },
  });
}

export function useUpdateIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIngredientInput }) => updateIngredient(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientsKeys.all });
    },
  });
}

export function useDeleteIngredientMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteIngredient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientsKeys.all });
    },
  });
}
