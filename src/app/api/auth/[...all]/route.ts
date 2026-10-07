import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/auth";

// Better Auth's catch-all handler for /api/auth/*. This is the one API
// surface not wrapped in withAuth: it IS the authentication layer.
export const { GET, POST } = toNextJsHandler(auth);
