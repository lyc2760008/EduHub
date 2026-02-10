import bcrypt from "bcryptjs";
import { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextRequest } from "next/server";

import { hashMagicLinkToken } from "@/lib/auth/magicLink";
import { prisma } from "@/lib/db/prisma";
import { resolveTenant } from "@/lib/tenant/resolveTenant";
import type { Role } from "@/generated/prisma/client";

type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  tenantId: string;
  role: Role;
  // Parent sessions store parentId explicitly for portal route guards.
  parentId?: string;
  // Parent magic link sessions carry rememberMe for per-session TTL handling.
  rememberMe?: boolean;
};

// Minimal shape we return from authorize so callbacks can enrich JWT/session.
// This keeps all tenant-aware fields server-side and avoids extra lookups later.
type AuthResult = AuthUser;

// Explicit magic link errors let the UI render expired vs invalid states.
class ParentMagicLinkExpiredError extends CredentialsSignin {
  constructor() {
    super();
    this.code = "PARENT_MAGIC_LINK_EXPIRED";
  }
}

class ParentMagicLinkInvalidError extends CredentialsSignin {
  constructor() {
    super();
    this.code = "PARENT_MAGIC_LINK_INVALID";
  }
}

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
    // Keep global maxAge at the long-session ceiling; per-session TTL is enforced in callbacks.
    maxAge: 90 * 24 * 60 * 60,
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
    Credentials({
      id: "parent-magic-link",
      name: "Parent Magic Link",
      credentials: {
        token: { label: "Token", type: "text" },
        tenantSlug: { label: "Tenant", type: "text" },
      },
      async authorize(credentials, req) {
        const rawToken = credentials?.token?.toString().trim();
        const tenantSlug = credentials?.tenantSlug?.toString().trim().toLowerCase();

        if (!rawToken) return null;

        // Resolve tenant from headers/host so magic links remain tenant-scoped.
        const tenantRequest = buildTenantRequest(req, tenantSlug);
        if (!tenantRequest) return null;

        const tenantResult = await resolveTenant(tenantRequest);
        if (!("tenantId" in tenantResult)) return null;
        const tenantId = tenantResult.tenantId;

        const tokenHash = hashMagicLinkToken(rawToken);
        const now = new Date();

        const result = await prisma.$transaction(async (tx) => {
          const token = await tx.parentMagicLinkToken.findFirst({
            where: { tenantId, tokenHash },
            select: {
              id: true,
              parentUserId: true,
              rememberMe: true,
              expiresAt: true,
              consumedAt: true,
            },
          });

          if (!token) return { status: "invalid" as const };
          if (token.consumedAt) return { status: "invalid" as const };
          if (token.expiresAt <= now) return { status: "expired" as const };

          const parent = await tx.parent.findFirst({
            where: { tenantId, id: token.parentUserId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          });

          const linkedStudent = await tx.studentParent.findFirst({
            where: { tenantId, parentId: token.parentUserId },
            select: { id: true },
          });

          // Mark tokens as consumed atomically, even if eligibility fails.
          await tx.parentMagicLinkToken.update({
            where: { id: token.id },
            data: { consumedAt: now },
          });

          if (!parent || !linkedStudent) {
            return { status: "ineligible" as const };
          }

          return {
            status: "ok" as const,
            parent,
            rememberMe: token.rememberMe,
          };
        });

        if (result.status === "expired") {
          throw new ParentMagicLinkExpiredError();
        }
        if (result.status === "invalid") {
          throw new ParentMagicLinkInvalidError();
        }
        if (result.status !== "ok") {
          return null;
        }

        const displayName = [result.parent.firstName, result.parent.lastName]
          .filter(Boolean)
          .join(" ");

        return {
          id: result.parent.id,
          parentId: result.parent.id,
          email: result.parent.email,
          name: displayName || null,
          tenantId,
          role: "Parent",
          rememberMe: result.rememberMe,
        } satisfies AuthResult;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Enforce per-session expiration for short and long-lived sessions.
      const sessionExpiresAt =
        typeof token.sessionExpiresAt === "number"
          ? token.sessionExpiresAt
          : null;
      if (sessionExpiresAt && Date.now() > sessionExpiresAt) {
        return null;
      }

      if (user) {
        const authUser = user as AuthUser;
        const rememberMe =
          authUser.role === "Parent" ? authUser.rememberMe ?? true : undefined;
        const defaultDays = authUser.role === "Parent" ? (rememberMe ? 90 : 7) : 30;
        const maxAgeSeconds = defaultDays * 24 * 60 * 60;

        // Persist tenant-aware fields in the JWT for session hydration.
        token.userId = authUser.id;
        token.tenantId = authUser.tenantId;
        token.role = authUser.role;
        // Parent sessions include parentId for route guards and APIs.
        token.parentId = authUser.parentId;
        token.sessionExpiresAt = Date.now() + maxAgeSeconds * 1000;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Expose tenant-aware fields on the session user.
        session.user.id = token.userId as string;
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as Role;
        // Parent ID is optional and only set for parent credentials.
        session.user.parentId = token.parentId as string | undefined;
        // Align session.expires with the per-session expiration policy.
        const sessionExpiresAt =
          typeof token.sessionExpiresAt === "number"
            ? token.sessionExpiresAt
            : null;
        if (sessionExpiresAt) {
          const expiresIso = new Date(sessionExpiresAt).toISOString();
          session.expires = expiresIso as typeof session.expires;
        }
      }
      return session;
    },
  },
};
