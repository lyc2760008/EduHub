// Response normalizer for list endpoints that may return either:
// - a legacy JSON array, or
// - the Step 21.3 admin table contract shape: { rows, totalCount, ... }.
//
// This keeps client code resilient while endpoints are incrementally upgraded.
export function unwrapListResponse<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const rows = record.rows;
    if (Array.isArray(rows)) {
      return rows as T[];
    }
    const items = record.items;
    if (Array.isArray(items)) {
      return items as T[];
    }
  }

  return [];
}

