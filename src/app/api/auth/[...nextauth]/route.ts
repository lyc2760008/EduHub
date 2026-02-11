/**
 * @state.route /api/auth/[...nextauth]
 * @state.area api
 * @state.capabilities UNKNOWN
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
import { handlers } from "@/lib/auth";

// App Router route handlers for NextAuth (GET/POST).
// NextAuth v5 expects this catch-all route under /api/auth/[...nextauth].
export const { GET, POST } = handlers;
