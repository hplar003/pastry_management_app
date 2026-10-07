import { apiFetch } from "@/lib/api-client";
import type {
  AdjustStockInput,
  CreateIngredientInput,
  ListIngredientsQuery,
  ListMovementsQuery,
  TransferStockInput,
  UpdateIngredientInput,
} from "@/features/inventory/schemas";

/**
 * Client-side mirror of `INGREDIENT_SELECT` in
 * `src/features/inventory/server/repository.ts` — the exact fields every
 * route in `src/app/api/v1/ingredients/**` returns. Dates cross JSON as
 * strings, not `Date` instances. `reorderThreshold` is a Prisma `Decimal`
 * server-side, which serializes to a JSON string (decimal.js's
 * `toJSON`/`valueOf`), not a `number` — never parse it client-side for
 * display, only for round-tripping back into a form field.
 */
export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  reorderThreshold: string | null;
  supplierId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListIngredientsResult = {
  items: Ingredient[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * One row of `GET /inventory` (`repository.listCurrentStock`): every
 * non-deleted ingredient in the org, joined with its net signed quantity for
 * the active branch (derived from `StockMovement`, never stored — zero for
 * an ingredient with no movements yet). Note: this DTO does **not** include
 * `reorderThreshold` (the repository's `listCurrentStock` select is just
 * `{ id, name, unit }` plus the computed `quantity`) — a low-stock visual
 * flag would need that field added server-side first; out of scope for this
 * client-only task (see `StockTable`'s comment).
 */
export type StockRow = {
  id: string;
  name: string;
  unit: string;
  quantity: string;
};

/**
 * Client-side mirror of `MOVEMENT_SELECT` in
 * `src/features/inventory/server/repository.ts`. `type` is whichever
 * literal the server wrote (`"ADJUSTMENT" | "TRANSFER_OUT" | "TRANSFER_IN"`
 * per `service.ts`), stored as a plain `String` column in `prisma/schema.prisma`,
 * so it's typed as `string` here rather than redeclaring the union and
 * risking drift. `qty` is a Prisma `Decimal`, serialized as a JSON string —
 * same caveat as `Ingredient.reorderThreshold` above.
 */
export type Movement = {
  id: string;
  ingredientId: string;
  type: string;
  qty: string;
  reason: string;
  actorId: string;
  createdAt: string;
};

export type ListMovementsResult = {
  items: Movement[];
  total: number;
  limit: number;
  offset: number;
};

// --- Ingredient catalog (not branch-scoped) ---

export async function listIngredients(params: ListIngredientsQuery): Promise<ListIngredientsResult> {
  return apiFetch("/ingredients", { query: params });
}

export async function getIngredient(id: string): Promise<Ingredient> {
  return apiFetch(`/ingredients/${id}`);
}

export async function createIngredient(input: CreateIngredientInput): Promise<Ingredient> {
  return apiFetch("/ingredients", { method: "POST", body: input });
}

export async function updateIngredient(id: string, input: UpdateIngredientInput): Promise<Ingredient> {
  return apiFetch(`/ingredients/${id}`, { method: "PATCH", body: input });
}

export async function deleteIngredient(id: string): Promise<void> {
  return apiFetch(`/ingredients/${id}`, { method: "DELETE" });
}

// --- Stock ledger (branch-scoped — `x-branch-id` from the active branch) ---

export async function listCurrentStock(): Promise<StockRow[]> {
  return apiFetch("/inventory", { branchScoped: true });
}

export async function listMovements(params: ListMovementsQuery): Promise<ListMovementsResult> {
  return apiFetch("/inventory/movements", { branchScoped: true, query: params });
}

export async function adjustStock(input: AdjustStockInput): Promise<Movement> {
  return apiFetch("/inventory/adjust", { method: "POST", branchScoped: true, body: input });
}

/** Mirrors `service.transferStock`'s return value: the two opposite-signed movements it wrote. */
export async function transferStock(input: TransferStockInput): Promise<{ out: Movement; in: Movement }> {
  return apiFetch("/inventory/transfer", { method: "POST", branchScoped: true, body: input });
}
