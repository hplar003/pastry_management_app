import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { updateBranchSchema } from "@/features/branches/schemas";
import * as service from "@/features/branches/server/service";

export const PATCH = withAuth<{ id: string }>(
  { permission: { team: ["update"] } },
  async (req, ctx, { id }) => {
    const body = await req.json();
    const parsed = updateBranchSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const branch = await service.updateBranch(ctx, req.headers, id, parsed.data);
    return Response.json(branch);
  },
);

export const DELETE = withAuth<{ id: string }>(
  { permission: { team: ["delete"] } },
  async (req, ctx, { id }) => {
    await service.deleteBranch(ctx, req.headers, id);
    return new Response(null, { status: 204 });
  },
);
