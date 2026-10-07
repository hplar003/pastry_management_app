"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recipesKeys } from "@/features/recipes/query-keys";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  updateRecipe,
} from "@/features/recipes/api";
import type { CreateRecipeInput, ListRecipesQuery, UpdateRecipeInput } from "@/features/recipes/schemas";

/** Recipe CRUD hooks — same shape as `src/features/suppliers/hooks/use-suppliers.ts`. */
export function useRecipesQuery(params: ListRecipesQuery) {
  return useQuery({
    queryKey: recipesKeys.list(params),
    queryFn: () => listRecipes(params),
  });
}

export function useRecipeQuery(id: string) {
  return useQuery({
    queryKey: recipesKeys.detail(id),
    queryFn: () => getRecipe(id),
    enabled: !!id,
  });
}

export function useCreateRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecipeInput) => createRecipe(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipesKeys.all });
    },
  });
}

export function useUpdateRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRecipeInput }) => updateRecipe(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipesKeys.all });
    },
  });
}

export function useDeleteRecipeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecipe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipesKeys.all });
    },
  });
}
