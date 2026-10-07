"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { suppliersKeys } from "@/features/suppliers/query-keys";
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from "@/features/suppliers/api";
import type { CreateSupplierInput, ListSuppliersQuery, UpdateSupplierInput } from "@/features/suppliers/schemas";

export function useSuppliersQuery(params: ListSuppliersQuery) {
  return useQuery({
    queryKey: suppliersKeys.list(params),
    queryFn: () => listSuppliers(params),
  });
}

export function useSupplierQuery(id: string) {
  return useQuery({
    queryKey: suppliersKeys.detail(id),
    queryFn: () => getSupplier(id),
    enabled: !!id,
  });
}

export function useCreateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => createSupplier(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
    },
  });
}

export function useUpdateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSupplierInput }) => updateSupplier(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
    },
  });
}

export function useDeleteSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: suppliersKeys.all });
    },
  });
}
