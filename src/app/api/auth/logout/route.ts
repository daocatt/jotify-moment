import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("better-auth.session_token")?.value;

    if (token) {
      const currentSession = await db.query.sessions.findFirst({
        where: eq(sessions.token, token),
        columns: { userId: true },
      });

      if (currentSession?.userId) {
        // Cascading session revocation: revoke all sessions belonging to this user
        // across main host and all custom domains (e.g. a.com, b.com).
        await db.delete(sessions).where(eq(sessions.userId, currentSession.userId));
      } else {
        await db.delete(sessions).where(eq(sessions.token, token));
      }
    }

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
