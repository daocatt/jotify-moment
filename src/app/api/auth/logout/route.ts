import { NextResponse } from "next/server";
import { clearSessionCookie, revokeUserSessionsByToken } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("better-auth.session_token")?.value;

    if (token) {
      await revokeUserSessionsByToken(token);
    }

    const response = NextResponse.json({ success: true });
    await clearSessionCookie(response);
    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Failed to logout" }, { status: 500 });
  }
}
