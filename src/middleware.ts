import { NextResponse, type NextRequest } from "next/server";

/**
 * In-memory rate limiter (per Vercel serverless instance).
 * Not perfect for distributed deploys but adds a solid baseline defence.
 * For tighter control, use Vercel Edge Config / KV or Upstash Redis.
 */
const hits = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string, windowMs = 60_000, max = 60): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

// Clean up stale entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of hits) {
    if (now > val.reset) hits.delete(key);
  }
}, 300_000);

export function middleware(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate limit API routes (60 requests per minute per IP)
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // Stricter limit for admin routes
    const isAdmin = request.nextUrl.pathname.startsWith("/api/admin");
    const allowed = rateLimit(
      `${ip}:${isAdmin ? "admin" : "api"}`,
      60_000,
      isAdmin ? 30 : 60,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
