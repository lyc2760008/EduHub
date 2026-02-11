/**
 * @state.route /api/health
 * @state.area api
 * @state.capabilities view:list
 * @state.notes Auto-seeded capability annotation for snapshot v2; refine when workflows change.
 */
// Minimal health endpoint for deployment checks (returns 200 OK or 503 if DB is unreachable).
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Keep the DB probe lightweight; this endpoint is for deploy sanity checks only.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, status: "ok" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("GET /api/health failed", { message });
    return NextResponse.json({ ok: false, status: "degraded" }, { status: 503 });
  }
}
