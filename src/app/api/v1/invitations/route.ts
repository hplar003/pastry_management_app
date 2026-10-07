import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { createInvitationSchema } from "@/features/invitations/schemas";
import * as service from "@/features/invitations/server/service";

// Any authenticated member of the org may view the invitation list — no
// resource-level permission restriction on GET (matches the
// `/api/v1/members`, `/api/v1/branches` GET precedent).
export const GET = withAuth({}, async (req, ctx) => {
  const invitations = await service.listInvitations(ctx, req.headers);
  return Response.json(invitations);
});

// `fresh: true` (security plan A5): inviting a new member is sensitive
// enough to require a session established by a real sign-in within the
// last `FRESH_AGE_SECONDS`, not just any valid session — same reasoning as
// `PATCH /api/v1/members/[id]`. A stale session gets a clean
// `403 SESSION_NOT_FRESH`, which `ReauthDialog`
// (`src/components/ReauthDialog.tsx`) knows how to recover from.
export const POST = withAuth(
  { permission: { invitation: ["create"] }, fresh: true },
  async (req, ctx) => {
    const body = await req.json();
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const invitation = await service.createInvitation(ctx, req.headers, parsed.data);
    return Response.json(invitation);
  },
);
