import "server-only";
import { ForbiddenError } from "@/server/errors";

type Perms = Record<string, readonly string[]>;

/**
 * Pure privilege-escalation guard used by the A6 hook (src/server/auth/
 * grant-ceiling-hook.ts) across the organization plugin's role create/update
 * and member/invite endpoints. better-auth 1.7.6's own create-role/
 * update-role already reject permissions the caller lacks, so this is
 * defense in depth there; on invite-member and update-member-role it's the
 * ONLY thing stopping a caller from handing out a role that carries more than
 * they hold. It also blocks editing the `owner` role and modifying one's own
 * membership. Kept pure and DB-free here so it can be unit tested in
 * isolation. See .claude/plans/2026-09-29-security.md, control A6, and
 * src/server/auth/grant-ceiling.integration.test.ts for the real-endpoint
 * proof of which paths actually need this vs. get it as a backstop.
 */
export function assertCanGrant(
  caller: Perms,
  requested: Perms,
  opts: { targetRole?: string; callerIsOwner?: boolean; targetUserId?: string; callerUserId?: string } = {},
) {
  if (opts.targetUserId && opts.targetUserId === opts.callerUserId) {
    throw new ForbiddenError("CANNOT_MODIFY_SELF");
  }
  if (opts.targetRole === "owner" && !opts.callerIsOwner) {
    throw new ForbiddenError("OWNER_ONLY");
  }
  for (const [resource, actions] of Object.entries(requested)) {
    const allowed = new Set(caller[resource] ?? []);
    if (actions.some((a) => !allowed.has(a))) {
      throw new ForbiddenError("GRANT_EXCEEDS_OWN");
    }
  }
}
