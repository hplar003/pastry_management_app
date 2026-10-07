import { z } from "zod";

export const createSupplierSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactName: z.string().trim().min(1).max(200).optional(),
    email: z.email().optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    address: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const updateSupplierSchema = createSupplierSchema.partial().strict();

export const listSuppliersQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
