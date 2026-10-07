import { auth } from "@/server/auth/auth";
import { ForbiddenError, UnauthorizedError, ValidationError, toErrorResponse } from "@/server/errors";
import { assertTrustedMutation } from "@/server/http/csrf";
import { generateRequestId } from "@/server/http/request-id";
import { createOrganizationSchema } from "@/features/organization/schemas";
import * as service from "@/features/organization/server/service";

/**
 * Authenticated, but deliberately NOT wrapped in the standard `withAuth`:
 * its step 3 ("requires an active organization") would always 403 here,
 * since having no organization yet is exactly the state this route exists
 * to fix — same shape as `src/app/api/v1/invitations/[id]/accept/route.ts`,
 * whose doc comment this mirrors. Unlike that route, this one DOES require
 * mandatory 2FA enrollment (withAuth's step 2) — the caller already has a
 * real account (seeded or otherwise), so the normal policy still applies;
 * only the org requirement is what's missing here. Still runs
 * `assertTrustedMutation` by hand (withAuth's step 6). Explicitly exempted
 * in `tests/security/route-inventory.test.ts`'s `KNOWN_PUBLIC_ROUTES`
 * allowlist.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  try {
    assertTrustedMutation(req);

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) throw new UnauthorizedError();
    if (!session.user.twoFactorEnabled) throw new ForbiddenError("TWO_FACTOR_REQUIRED");

    const body = await req.json();
    const parsed = createOrganizationSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const organization = await service.createOrganizationForSession(
      req.headers,
      session.user.id,
      requestId,
      parsed.data,
    );
    return Response.json(organization, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
