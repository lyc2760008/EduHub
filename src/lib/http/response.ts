import { NextResponse } from "next/server";

export function jsonError(
  status: number,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { error: message, ...(extra ?? {}) },
    { status }
  );
}
