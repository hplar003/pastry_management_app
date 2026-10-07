import { ValidationError, toErrorResponse } from "@/server/errors";
import { assertTrustedMutation } from "@/server/http/csrf";
import { generateRequestId } from "@/server/http/request-id";
import { createAccountSchema } from "@/features/invitations/schemas";
import { createAccountForInvitation } from "@/features/invitations/server/public-service";

/**
 * Public, unauthenticated — deliberately NOT wrapped in `withAuth` (see
 * the preview route's doc comment and the brief's "three separate
 * endpoints" design decision: this route exists precisely to create the
 * account a session would otherwise require). Still applies the mutation
 * CSRF/Content-Type check `withAuth`'s step 6 would (`assertTrustedMutation`,
 * `src/server/http/csrf.ts`) — that gate doesn't depend on a session
 * existing. Explicitly exempted in `tests/security/route-inventory.test.ts`'s
 * `KNOWN_PUBLIC_ROUTES` allowlist — see the preview route's comment.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = generateRequestId();
  try {
    assertTrustedMutation(req);
    const { id } = await params;
    const body = await req.json();
    const parsed = createAccountSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    await createAccountForInvitation(id, parsed.data.password, requestId);
    return Response.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, requestId);
  }
}
