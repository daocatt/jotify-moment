import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";

const SSO_TOKEN_EXPIRY_MS = 5 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const callback = searchParams.get("callback") || "/";

  if (!token) {
    return new NextResponse("Missing SSO token", { status: 400 });
  }

  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 3) {
      return new NextResponse("Invalid token structure", { status: 400 });
    }

    const [userId, expiresAtStr, hmac] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);

    if (isNaN(expiresAt) || expiresAt < Date.now()) {
      return new NextResponse("SSO token expired", { status: 400 });
    }

    if (expiresAt - Date.now() > SSO_TOKEN_EXPIRY_MS + 60_000) {
      return new NextResponse("Invalid token expiry", { status: 400 });
    }

    const secret = process.env.BETTER_AUTH_SECRET || "sso-secret";
    const payload = `${userId}:${expiresAtStr}`;
    const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (!timingSafeEqual(hmac, expectedHmac)) {
      return new NextResponse("Invalid SSO signature", { status: 400 });
    }

    const sessionToken = crypto.randomUUID();
    const now = new Date();
    const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || null;
    const ua = request.headers.get("user-agent") || null;

    await db.insert(sessions).values({
      id: sessionToken,
      token: sessionToken,
      userId: userId,
      expiresAt: sessionExpiry,
      ipAddress: ip,
      userAgent: ua,
      createdAt: now,
      updatedAt: now,
    });

    let redirectUrl: URL;
    if (callback.startsWith("http://") || callback.startsWith("https://")) {
      redirectUrl = new URL(callback);
      const callbackHost = redirectUrl.hostname.toLowerCase();
      const mainHostEnv = process.env.MAIN_HOST || "";
      const mainHosts = mainHostEnv.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);

      const isAllowed = mainHosts.includes(callbackHost) || !!(await db.query.users.findFirst({
        where: and(
          eq(users.customDomain, callbackHost),
          eq(users.allowCustomDomain, true)
        ),
        columns: { id: true },
      }));

      if (!isAllowed) {
        return new NextResponse("Forbidden redirect domain", { status: 400 });
      }
    } else {
      const proto = request.headers.get("x-forwarded-proto") || "https";
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
      redirectUrl = new URL(callback, `${proto}://${host}`);
    }
    redirectUrl.searchParams.delete("sso_token");

    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set("better-auth.session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: sessionExpiry,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[SSO Callback Error]:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
