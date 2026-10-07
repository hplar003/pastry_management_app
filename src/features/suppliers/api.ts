import { apiFetch } from "@/lib/api-client";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "@/features/suppliers/schemas";

/**
 * Client-side mirror of `SUPPLIER_SELECT` in
 * `src/features/suppliers/server/repository.ts` — the exact fields every
 * route in `src/app/api/v1/suppliers/**` returns. Dates cross JSON as
 * strings, not `Date` instances.
 */
export type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListSuppliersResult = {
  items: Supplier[];
  total: number;
  limit: number;
  offset: number;
};

export async function listSuppliers(params: ListSuppliersQuery): Promise<ListSuppliersResult> {
  return apiFetch("/suppliers", { query: params });
}

export async function getSupplier(id: string): Promise<Supplier> {
  return apiFetch(`/suppliers/${id}`);
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  return apiFetch("/suppliers", { method: "POST", body: input });
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  return apiFetch(`/suppliers/${id}`, { method: "PATCH", body: input });
}

export async function deleteSupplier(id: string): Promise<void> {
  return apiFetch(`/suppliers/${id}`, { method: "DELETE" });
}
