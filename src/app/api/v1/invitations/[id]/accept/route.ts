import { auth } from "@/server/auth/auth";
import { UnauthorizedError, toErrorResponse } from "@/server/errors";
import { assertTrustedMutation } from "@/server/http/csrf";
import { generateRequestId } from "@/server/http/request-id";
import { acceptInvitationForSession } from "@/features/invitations/server/public-service";

/**
 * Authenticated, but deliberately NOT wrapped in the standard `withAuth`
 * (see the brief's "three separate endpoints" design decision): a
 * brand-new invitee has no active organization yet — that's exactly what
 * this call grants them — so `withAuth`'s step 3 ("requires an active
 * organization") would always 403 here. Instead: load the session
 * directly and 401 if there isn't one, then call
 * `auth.api.acceptInvitation`, translated through the same
 * `rethrowInvitationApiError` pattern every other invitation mutation
 * uses. Deliberately does NOT require 2FA enrollment the way `withAuth`
 * does for every other route — the invitee hasn't set it up yet; they're
 * sent to `/setup-2fa` right after this succeeds. Still applies the
 * mutation CSRF/Content-Type check `withAuth`'s step 6 would
 * (`assertTrustedMutation`, `src/server/http/csrf.ts`). Explicitly exempted
 * in `tests/security/route-inventory.test.ts`'s `KNOWN_PUBLIC_ROUTES`
 * allowlist — see the preview route's comment.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = generateRequestId();
  try {
    assertTrustedMutation(req);
    const { id } = await params;

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) throw new UnauthorizedError();

    const result = await acceptInvitationForSession(req.headers, id, requestId);
    return Response.json(result);
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
