/**
 * Shared `sessionStorage` helpers for carrying a pending invitation id
 * across the 2FA redirect in the accept-invite flow's "existing user"
 * branch (`src/app/(auth)/accept-invite/[id]/page.tsx` sets it right before
 * redirecting to `/two-factor`; `src/app/(auth)/two-factor/page.tsx` reads
 * and clears it after a successful verify). Not a React context/prop
 * because the only thing driving that redirect, better-auth's
 * `onTwoFactorRedirect` callback (`src/lib/auth-client.ts`), fires from a
 * module-level `better-fetch` hook with no component tree to pass one
 * through — `sessionStorage` is the simplest mechanism that survives the
 * full page's `useRouter().push()` navigation between the two pages.
 *
 * Minor fix (settings-task5 review): the key used to be a bare invitation
 * id with no expiry. If someone opened an accept-invite link, got
 * redirected to `/two-factor` (stashing the id), and then abandoned that
 * tab instead of finishing — the key stayed in `sessionStorage` for the
 * rest of that browser tab's life. The user's NEXT, completely unrelated
 * 2FA sign-in in the same tab would then read that stale id and silently
 * try to accept an invitation they weren't in the middle of. Storing a
 * timestamp alongside the id and ignoring anything older than
 * `MAX_AGE_MS` closes that window without needing to hook the normal
 * sign-in page at all.
 */
const PENDING_INVITATION_STORAGE_KEY = "pastry.pendingInvitationId";

/** Comfortably longer than a real 2FA app lookup, short enough that an abandoned tab can't surprise a later, unrelated sign-in. */
const MAX_AGE_MS = 10 * 60 * 1000;

type PendingInvitation = { id: string; ts: number };

/** Call right before redirecting to `/two-factor` with a pending invitation to accept afterward. */
export function setPendingInvitation(id: string): void {
  try {
    const payload: PendingInvitation = { id, ts: Date.now() };
    sessionStorage.setItem(PENDING_INVITATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage can throw (private browsing, blocked site data); the
    // invitee can still accept manually after signing in.
  }
}

/**
 * Reads and clears the pending invitation id, if any — always clears the
 * key regardless of staleness, so a stale entry is a one-time no-op, not a
 * standing problem. Returns `null` if there was none, it couldn't be
 * parsed, or it's older than `MAX_AGE_MS`.
 */
export function takePendingInvitation(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_INVITATION_STORAGE_KEY);
    sessionStorage.removeItem(PENDING_INVITATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingInvitation>;
    if (typeof parsed.id !== "string" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > MAX_AGE_MS) return null;
    return parsed.id;
  } catch {
    // sessionStorage can throw (private browsing, blocked site data) — treat as "no pending invitation".
    return null;
  }
}
