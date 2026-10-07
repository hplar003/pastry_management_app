import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { updateMemberRoleSchema } from "@/features/members/schemas";
import * as service from "@/features/members/server/service";

// `fresh: true` (security plan A5): changing a member's role is sensitive
// enough to require a session established by a real sign-in within the
// last `FRESH_AGE_SECONDS`, not just any valid session — same reasoning as
// `DELETE` below. A stale session gets a clean `403 SESSION_NOT_FRESH`,
// which `ReauthDialog` (`src/components/ReauthDialog.tsx`) knows how to
// recover from.
export const PATCH = withAuth<{ id: string }>(
  { permission: { member: ["update"] }, fresh: true },
  async (req, ctx, { id }) => {
    const body = await req.json();
    const parsed = updateMemberRoleSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const member = await service.updateMemberRole(ctx, req.headers, id, parsed.data.role);
    return Response.json(member);
  },
);

// `fresh: true`: removing a member also revokes every one of their active
// sessions (A5) — sensitive enough to demand a freshly-confirmed caller.
export const DELETE = withAuth<{ id: string }>(
  { permission: { member: ["delete"] }, fresh: true },
  async (req, ctx, { id }) => {
    await service.removeMember(ctx, req.headers, id);
    return new Response(null, { status: 204 });
  },
);
