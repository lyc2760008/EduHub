import type { Role } from "@/generated/prisma/client";
import type { DefaultSession } from "next-auth";

// Module augmentation to expose tenant-aware fields in session/user/jwt types.
// These mirror the values we set in auth callbacks and keep TS happy in API routes.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    tenantId: string;
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    // Stored in JWT so sessions can be hydrated without extra DB reads.
    userId?: string;
    tenantId?: string;
    role?: Role;
  }
}
