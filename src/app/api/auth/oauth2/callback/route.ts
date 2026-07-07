import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state") || "/";

  if (!code) {
    return new NextResponse("Missing authorization code", { status: 400 });
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    console.error("BETTER_AUTH_SECRET is not set");
    return new NextResponse("Server configuration error", { status: 500 });
  }

  const mainHostEnv = process.env.MAIN_HOST || "";
  const mainHosts = mainHostEnv.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  const primaryHost = mainHosts[0];
  if (!primaryHost) {
    return new NextResponse("MAIN_HOST not configured", { status: 500 });
  }

  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const requestProto = request.headers.get("x-forwarded-proto") || "https";
  const clientId = requestHost.split(":")[0].toLowerCase();

  try {
    const tokenRes = await fetch(`${requestProto}://${primaryHost}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: clientId,
        client_secret: secret,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("OAuth2 token exchange failed:", tokenData);
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(state);
      } catch {
        redirectUrl = new URL("/", `${requestProto}://${requestHost}`);
      }
      redirectUrl.searchParams.delete("code");
      redirectUrl.searchParams.delete("state");
      return NextResponse.redirect(redirectUrl);
    }

    let redirectUrl: URL;
    if (state.startsWith("http://") || state.startsWith("https://")) {
      try {
        redirectUrl = new URL(state);
      } catch {
        redirectUrl = new URL("/", `${requestProto}://${requestHost}`);
      }

      const callbackHost = redirectUrl.hostname.toLowerCase();
      const isAllowed = mainHosts.includes(callbackHost) || !!(await db.query.users.findFirst({
        where: and(
          eq(users.customDomain, callbackHost),
          eq(users.allowCustomDomain, true),
        ),
        columns: { id: true },
      }));

      if (!isAllowed) {
        return new NextResponse("Forbidden redirect domain", { status: 400 });
      }
    } else {
      if (!state.startsWith("/") || state.startsWith("//")) {
        return new NextResponse("Invalid state parameter", { status: 400 });
      }
      redirectUrl = new URL(state, `${requestProto}://${requestHost}`);
    }

    redirectUrl.searchParams.delete("code");
    redirectUrl.searchParams.delete("state");

    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set("better-auth.session_token", tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[OAuth2 Callback Error]:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
