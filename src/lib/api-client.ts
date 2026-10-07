import { useBranchStore } from "@/stores/branch-store";

/**
 * Thrown by `apiFetch` for every non-2xx response (and for the client-side
 * `BRANCH_REQUIRED` short-circuit below). Mirrors the JSON body every route
 * returns on failure (`toErrorResponse` in `src/server/errors.ts`):
 * `{ error: <code string>, details?: unknown, requestId: string }`, with
 * the HTTP status carrying the category (400/401/403/404/415/500).
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public details: unknown,
    public requestId: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

type ApiFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /**
   * Attaches the active branch as `x-branch-id` (verified server-side
   * against team membership, B3 — this header is never trusted outright by
   * the server, only used to resolve `ctx.branchId`). Throws
   * `ApiError("BRANCH_REQUIRED", ...)` locally, without calling `fetch` at
   * all, if no branch is selected yet.
   */
  branchScoped?: boolean;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

/**
 * Thin wrapper around `fetch` for `/api/v1/**` routes. Callers pass the
 * path under `/api/v1` (e.g. `apiFetch("/suppliers")`); TanStack Query hooks
 * in each feature's `api.ts` are the only expected callers.
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.branchScoped) {
    const branchId = useBranchStore.getState().activeBranchId;
    if (!branchId) throw new ApiError("BRANCH_REQUIRED", 400, undefined, "client");
    headers["x-branch-id"] = branchId;
  }

  const qs = new URLSearchParams();
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) qs.set(key, String(value));
    }
  }
  const qsString = qs.size > 0 ? `?${qs.toString()}` : "";

  const res = await fetch(`/api/v1${path}${qsString}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // DELETE handlers (e.g. src/app/api/v1/suppliers/[id]/route.ts) return
  // `204` with no body; `res.json()` on an empty body throws, so this must
  // be special-cased before attempting to parse JSON.
  if (res.status === 204) return undefined as T;

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const body = (json ?? null) as { error?: string; details?: unknown; requestId?: string } | null;
    throw new ApiError(
      body?.error ?? "UNKNOWN",
      res.status,
      body?.details,
      body?.requestId ?? "",
    );
  }
  return json as T;
}

/**
 * Maps an `ApiError` to copy safe to show a user — never raw server text
 * (matching `getAuthErrorMessage`'s existing spirit in
 * `src/lib/auth-client.ts`). Codes come from `src/server/errors.ts`'s
 * `AppError` subclasses and the gates in `src/server/http/with-auth.ts`.
 */
export function getApiErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!(err instanceof ApiError)) return fallback;
  switch (err.code) {
    case "VALIDATION":
      return "Please check the highlighted fields.";
    case "NOT_FOUND":
      return "That item no longer exists.";
    case "BRANCH_REQUIRED":
      return "Select a branch first.";
    case "BRANCH_NOT_A_MEMBER":
      return "You don't have access to that branch.";
    case "UNAUTHORIZED":
      return "Your session has expired. Please sign in again.";
    case "TWO_FACTOR_REQUIRED":
      return "Two-factor authentication is required for your account.";
    case "NO_ACTIVE_ORGANIZATION":
      return "Select an organization first.";
    // src/features/organization/server/service.ts's `createOrganizationForSession`.
    case "ALREADY_HAS_ORGANIZATION":
      return "You already belong to an organization.";
    case "SESSION_NOT_FRESH":
      return "Please sign in again to confirm it's you.";
    case "FOREIGN_ORIGIN":
    case "UNSUPPORTED_MEDIA_TYPE":
      return "Your request couldn't be processed. Please refresh and try again.";
    // Better Auth's own team business-rule rejections, re-thrown as
    // `AppError` by `rethrowTeamApiError` in
    // `src/features/branches/server/service.ts`.
    case "UNABLE_TO_REMOVE_LAST_TEAM":
      return "You can't delete the last branch.";
    case "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM":
      return "You can't delete your current active branch. Switch branches first.";
    case "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS":
      return "You've reached the maximum number of branches.";
    case "TEAM_NOT_FOUND":
      return "That branch no longer exists.";
    // The public accept-invite flow (src/features/invitations/server/
    // public-service.ts, src/app/(auth)/accept-invite/[id]/page.tsx).
    case "PASSWORD_COMPROMISED":
      return "That password has appeared in a known data breach. Please choose a different one.";
    case "USER_ALREADY_EXISTS":
      return "An account for this email already exists. Please sign in instead.";
    case "INVITATION_NOT_PENDING":
      return "This invitation is no longer pending. Ask your bakery admin to send a new one.";
    case "INVITATION_NOT_FOUND":
      return "This invitation link isn't valid. Ask your bakery admin to send a new one.";
    case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
      return "This invitation was sent to a different email address.";
    case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
      return "This person already has a pending invitation to this organization.";
    case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
      return "This person is already a member of this organization.";
    case "INVITATION_LIMIT_REACHED":
      return "This organization has reached its limit of pending invitations.";
    // src/features/invitations/server/service.ts's `assertInviteRateLimitNotExceeded`.
    case "INVITE_RATE_LIMIT_EXCEEDED":
      return "Too many invitations sent recently. Please wait a bit and try again.";
    // Better Auth's own dynamic-access-control business-rule rejections
    // (`node_modules/better-auth/dist/plugins/organization/error-codes.mjs`),
    // re-thrown as `AppError` by `rethrowRoleApiError` in
    // `src/features/roles/server/service.ts`.
    case "ROLE_NOT_FOUND":
      return "That role no longer exists.";
    case "ROLE_NAME_IS_ALREADY_TAKEN":
      return "A role with that name already exists.";
    case "CANNOT_DELETE_A_PRE_DEFINED_ROLE":
      return "You can't delete a built-in role.";
    case "ROLE_IS_ASSIGNED_TO_MEMBERS":
      return "This role is still assigned to one or more members. Reassign them first.";
    case "TOO_MANY_ROLES":
      return "This organization has reached its limit of custom roles.";
    case "INVALID_RESOURCE":
      return "That permission refers to a resource that doesn't exist.";
    // The A6 grant-ceiling hook's own rejections (`src/server/auth/
    // grant-ceiling.ts`'s `assertCanGrant`, re-thrown by `src/server/auth/
    // grant-ceiling-hook.ts` as a Better Auth `FORBIDDEN` with these codes).
    case "GRANT_EXCEEDS_OWN":
      return "You can't grant a permission you don't hold yourself.";
    case "OWNER_ONLY":
      return "Only an owner can do that.";
    case "CANNOT_MODIFY_SELF":
      return "You can't change your own membership.";
    default:
      return fallback;
  }
}
