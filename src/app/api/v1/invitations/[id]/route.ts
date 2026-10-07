import { withAuth } from "@/server/http/with-auth";
import * as service from "@/features/invitations/server/service";

export const DELETE = withAuth<{ id: string }>(
  { permission: { invitation: ["cancel"] } },
  async (req, ctx, { id }) => {
    await service.cancelInvitation(ctx, req.headers, id);
    return new Response(null, { status: 204 });
  },
);
