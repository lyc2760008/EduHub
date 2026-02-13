// Server-side zoom link normalization keeps URL handling consistent across session endpoints.
import "server-only";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeZoomLink(
  input: string | null | undefined,
): string | null {
  const trimmed = input?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid zoom link");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Zoom link must use http or https");
  }

  // URL.toString() returns a normalized URL string without surrounding whitespace.
  return parsed.toString();
}

export function getZoomLinkHostname(
  input: string | null | undefined,
): string | null {
  const normalized = normalizeZoomLink(input);
  if (!normalized) {
    return null;
  }

  return new URL(normalized).hostname || null;
}
