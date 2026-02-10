// Magic link helpers for parent passwordless auth (hashing, tokens, and config).
import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const DEFAULT_TTL_MINUTES = 15;
const DEFAULT_EMAIL_MAX = 3;
const DEFAULT_EMAIL_WINDOW_MINUTES = 15;
const DEFAULT_IP_MAX = 10;
const DEFAULT_IP_WINDOW_MINUTES = 60;

function readNumberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function getPepper() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
}

// Hash identifiers with an optional secret pepper to avoid reversible lookups.
export function hashIdentifier(value: string) {
  const pepper = getPepper();
  const input = pepper ? `${pepper}:${value}` : value;
  return createHash("sha256").update(input).digest("hex");
}

// Normalize emails for consistent matching and hashing.
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

// Generate a random token and its hashed representation for storage.
export function generateMagicLinkToken() {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashIdentifier(rawToken);
  return { rawToken, tokenHash };
}

// Hash an incoming token using the same peppered SHA-256 strategy.
export function hashMagicLinkToken(rawToken: string) {
  return hashIdentifier(rawToken);
}

// Resolve the request origin for absolute magic-link URLs.
export function getRequestOrigin(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host) return `${proto}://${host}`;

  const fallback = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  if (!fallback) return null;
  return fallback.startsWith("http") ? fallback : `https://${fallback}`;
}

// Read the best-effort client IP (never persist raw IPs; hash upstream).
export function getRequestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.headers.get("x-real-ip");
}

// Resolve magic link configuration from env with secure defaults.
export function getMagicLinkConfig() {
  return {
    ttlMinutes: readNumberEnv(
      process.env.MAGIC_LINK_TTL_MINUTES,
      DEFAULT_TTL_MINUTES,
    ),
    emailMax: readNumberEnv(
      process.env.AUTH_RATE_LIMIT_EMAIL_MAX,
      DEFAULT_EMAIL_MAX,
    ),
    emailWindowMinutes: readNumberEnv(
      process.env.AUTH_RATE_LIMIT_EMAIL_WINDOW_MINUTES,
      DEFAULT_EMAIL_WINDOW_MINUTES,
    ),
    ipMax: readNumberEnv(
      process.env.AUTH_RATE_LIMIT_IP_MAX,
      DEFAULT_IP_MAX,
    ),
    ipWindowMinutes: readNumberEnv(
      process.env.AUTH_RATE_LIMIT_IP_WINDOW_MINUTES,
      DEFAULT_IP_WINDOW_MINUTES,
    ),
  };
}
