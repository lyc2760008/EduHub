// Simple deterministic unique string helper for E2E test data.
// Uses a timestamp + counter to avoid collisions without random data.

let counter = 0;

export function uniqueString(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}
