import { withAuth } from "@/server/http/with-auth";
import * as service from "@/features/roles/server/service";

/**
 * No resource-level permission restriction: any authenticated member may
 * read their OWN effective permission ceiling — that's the whole point
 * (the role editor uses this to only ever offer a checkbox the caller
 * could legally grant; Better Auth's own A6 hook still enforces the real
 * ceiling server-side on `createRole`/`updateRole` regardless of what the
 * client sends).
 *
 * A literal path segment (`my-ceiling`) is resolved by Next.js App Router
 * before the sibling dynamic segment (`roles/[name]`) for an exact-match
 * request to this path — verified by `npx tsc --noEmit` / `next build`
 * surfacing no route-conflict diagnostics for this directory.
 */
export const GET = withAuth({}, async (req, ctx) => {
  const ceiling = await service.getMyCeiling(ctx, req.headers);
  return Response.json(ceiling);
});
