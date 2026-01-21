import bcrypt from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { resolveTenant } from "@/lib/tenant/resolveTenant";
import type { Role } from "@/generated/prisma/client";

type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  tenantId: string;
  role: Role;
};

// Minimal shape we return from authorize so callbacks can enrich JWT/session.
// This keeps all tenant-aware fields server-side and avoids extra lookups later.
type AuthResult = AuthUser;

// Wrap the NextAuth request so we can reuse resolveTenant's NextRequest signature.
// We also ensure host/tenant headers exist so tenant resolution can parse subdomains.
function buildTenantRequest(
  request: Request | undefined,
  tenantSlug?: string,
): NextRequest | null {
  if (!request) return null;

  const headers = new Headers(request.headers);
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  // Ensure host headers exist so tenant resolution can parse subdomains.
  if (!headers.get("host") && authUrl) {
    const url = new URL(
      authUrl.startsWith("http") ? authUrl : `http://${authUrl}`,
    );
    headers.set("host", url.host);
    headers.set("x-forwarded-host", url.host);
  }
  // Allow the login page to pass a tenant slug when host/path don't include it.
  if (!headers.get("x-tenant-slug") && tenantSlug) {
    headers.set("x-tenant-slug", tenantSlug);
  }

  const url = new URL(request.url);
  return new NextRequest(url, { headers });
}

export const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
  },
  // Prefer AUTH_* envs (v5), but keep NEXTAUTH_* for compatibility.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  // Trust host headers so tenant resolution can use subdomains in dev/proxy setups.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantSlug: { label: "Tenant", type: "text" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString();
        const tenantSlug = credentials?.tenantSlug?.toString().trim().toLowerCase();

        if (!email || !password) return null;

        // 1) Find user by email.
        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user) return null;

        // 2) Verify password against stored hash.
        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

        // 3) Resolve tenant from headers/host and validate membership.
        const tenantRequest = buildTenantRequest(req, tenantSlug);
        if (!tenantRequest) return null;

        const tenantResult = await resolveTenant(tenantRequest);
        if (!("tenantId" in tenantResult)) return null;

        // Membership check is tenant-aware; only members can authenticate.
        const membership = await prisma.tenantMembership.findUnique({
          where: {
            tenantId_userId: {
              tenantId: tenantResult.tenantId,
              userId: user.id,
            },
          },
        });
        if (!membership) return null;

        // Return only what we need for JWT/session; avoid leaking extra fields.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: tenantResult.tenantId,
          role: membership.role,
        } satisfies AuthResult;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as AuthUser;
        // Persist tenant-aware fields in the JWT for session hydration.
        token.userId = authUser.id;
        token.tenantId = authUser.tenantId;
        token.role = authUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Expose tenant-aware fields on the session user.
        session.user.id = token.userId as string;
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
