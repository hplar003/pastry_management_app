import { toErrorResponse } from "@/server/errors";
import { generateRequestId } from "@/server/http/request-id";
import { previewInvitation } from "@/features/invitations/server/public-service";

/**
 * Public, unauthenticated — deliberately NOT wrapped in `withAuth` (see
 * `.superpowers/sdd/settings-task5-brief.md`'s "three separate endpoints"
 * design decision). A brand-new invitee, or an existing user invited to a
 * second org, has no session at all when they first open the accept-invite
 * link, so there is nothing for `withAuth` to gate on. Explicitly exempted
 * in `tests/security/route-inventory.test.ts`'s `KNOWN_PUBLIC_ROUTES`
 * allowlist (and its two siblings, `create-account`/`accept`) — these three
 * routes are structurally public by design, not an oversight.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = generateRequestId();
  try {
    const { id } = await params;
    const preview = await previewInvitation(id);
    return Response.json(preview);
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
