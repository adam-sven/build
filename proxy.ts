import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isProtectedPath(pathname: string): boolean {
  const exact = new Set([
    "/api/discover",
    "/api/token",
    "/api/docs",
    "/api/search/log",
  ]);
  const prefixes = ["/api/vote/", "/api/submit/"];
  if (exact.has(pathname)) return true;
  return prefixes.some((p) => pathname.startsWith(p));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const validKeys = (process.env.API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const key = request.headers.get("x-api-key") || "";
  const internal = request.headers.get("x-internal-api-key") || "";

  if (validKeys.length === 0 && !internal) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "api_key_missing", message: "API keys are not configured." },
      },
      { status: 503 },
    );
  }

  if (!key && !internal) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "api_key_missing", message: "X-API-Key header is required." },
      },
      { status: 401 },
    );
  }

  if (key && validKeys.length > 0 && validKeys.includes(key)) {
    return NextResponse.next();
  }

  if (internal && process.env.INTERNAL_API_KEY && internal === process.env.INTERNAL_API_KEY) {
    return NextResponse.next();
  }

  return NextResponse.json(
    {
      ok: false,
      error: { code: "api_key_invalid", message: "API key is invalid." },
    },
    { status: 401 },
  );
}

export const config = {
  matcher: ["/api/:path*"],
};
