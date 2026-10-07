import { z } from "zod";

export const listAuditLogQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    action: z.string().min(1).max(200).optional(),
    entity: z.string().min(1).max(200).optional(),
  })
  .strict();

export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;
