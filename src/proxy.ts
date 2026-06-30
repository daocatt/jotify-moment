import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static resources, images, and API routes to avoid loops and preserve speed
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)
  ) {
    return NextResponse.next();
  }

  try {
    // Check if system has a super_admin directly via DB query (Proxy defaults to Node.js runtime)
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "super_admin"),
      columns: { id: true },
    });
    const hasAdmin = !!adminUser;

    if (!hasAdmin && pathname !== "/init") {
      // Force redirect to system initialization page
      return NextResponse.redirect(new URL("/init", request.url));
    }

    if (hasAdmin && pathname === "/init") {
      // Prevent re-accessing /init if already configured
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch (err) {
    console.error("Proxy initialization check failed:", err);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Apply to all routes except API and assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};