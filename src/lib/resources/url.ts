// Server-only resource URL normalization validates allowed schemes and strips unsafe input.
import "server-only";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeResourceUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Resource URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Resource URL is invalid");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Resource URL must use http or https");
  }

  // URL.toString() returns a canonicalized URL string without surrounding whitespace.
  return parsed.toString();
}
