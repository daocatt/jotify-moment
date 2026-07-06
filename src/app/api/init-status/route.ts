import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const INIT_STATUS_LIMITS = new Map<string, { count: number; resetAt: number }>();
const MAX_INIT_STATUS_REQUESTS = 10;
const INIT_STATUS_WINDOW = 60_000;

function checkInitStatusRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = INIT_STATUS_LIMITS.get(ip);
  if (!entry || now > entry.resetAt) {
    INIT_STATUS_LIMITS.set(ip, { count: 1, resetAt: now + INIT_STATUS_WINDOW });
    return true;
  }
  entry.count++;
  if (now - entry.resetAt + INIT_STATUS_WINDOW > INIT_STATUS_WINDOW * 10) {
    INIT_STATUS_LIMITS.delete(ip);
  }
  return entry.count <= MAX_INIT_STATUS_REQUESTS;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || "unknown";

  if (!checkInitStatusRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "super_admin"),
    });
    return NextResponse.json({ hasAdmin: !!adminUser });
  } catch {
    return NextResponse.json({ hasAdmin: false }, { status: 500 });
  }
}
