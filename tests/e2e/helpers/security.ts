// Shared Step 22.7 security assertions keep payload leak checks consistent and non-verbose.
import { expect } from "@playwright/test";

import { findSensitiveMatch } from "./audit";

function toSafeString(payload: unknown) {
  // Convert payloads to a compact string without logging full response bodies in test output.
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload ?? "");
  }
}

export function expectNoSensitivePayloadContent(
  payload: unknown,
  options?: { internalSentinel?: string },
) {
  const serialized = toSafeString(payload);
  const sensitiveMatch = findSensitiveMatch(serialized);
  expect(
    sensitiveMatch,
    "Expected payload to omit secrets/cookies/tokens/password-like values.",
  ).toBeNull();
  if (options?.internalSentinel) {
    expect(serialized.includes(options.internalSentinel)).toBeFalsy();
  }
}

export function expectFieldAbsent(payload: unknown, fieldName: string) {
  const serialized = toSafeString(payload);
  // String scan is sufficient here because API payloads are JSON and field names are deterministic.
  expect(serialized.includes(`"${fieldName}"`)).toBeFalsy();
}
