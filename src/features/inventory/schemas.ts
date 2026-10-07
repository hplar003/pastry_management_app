import { z } from "zod";

// --- Ingredient catalog (org-wide) ---

export const createIngredientSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    unit: z.string().trim().min(1).max(20),
    reorderThreshold: z.number().positive().optional(),
    supplierId: z.string().min(1).optional(),
  })
  .strict();

export const updateIngredientSchema = createIngredientSchema.partial().strict();

export const listIngredientsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type ListIngredientsQuery = z.infer<typeof listIngredientsQuerySchema>;

// --- Stock ledger (branch-scoped) ---

export const adjustStockSchema = z
  .object({
    ingredientId: z.string().min(1),
    qty: z.number().refine((n) => n !== 0, "qty must not be zero"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const transferStockSchema = z
  .object({
    ingredientId: z.string().min(1),
    quantity: z.number().positive(),
    reason: z.string().trim().min(1).max(500),
    toBranchId: z.string().min(1),
  })
  .strict();

export const listMovementsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    ingredientId: z.string().min(1).optional(),
  })
  .strict();

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
