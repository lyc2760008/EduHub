import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/options";

// NextAuth v5 helpers:
// - handlers: GET/POST handlers for /api/auth routes
// - auth: server-side session helper for route handlers and server actions
// - signIn/signOut: server actions you can wire to UI later
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
