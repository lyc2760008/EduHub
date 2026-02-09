// Public debug route maps to the staging-only handler behind /api/__debug.
import { GET as handleSentryTest } from "@/app/api/__debug/sentry-test/route";

export const runtime = "nodejs";
export const GET = handleSentryTest;
