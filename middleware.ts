import type { NextRequest } from "next/server";

import { proxy } from "./src/proxy";

export function middleware(req: NextRequest) {
  return proxy(req);
}

export const config = {
  matcher: ["/api/:path*", "/t/:path*"],
};
