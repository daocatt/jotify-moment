import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { accounts, users, sessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSetting } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth";
import {
  getDalaoOAuthConfig,
  exchangeDalaoCode,
  fetchDalaoUserInfo,
  signPendingPayload,
} from "@/lib/oauth-dalao";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isEnabled = (await getSetting("dalao_oauth_enabled")) === "true";
  if (!isEnabled) {
    return new NextResponse("大佬论坛登录功能暂未开启", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    console.error("[Dalao OAuth Error]:", errorParam, searchParams.get("error_description"));
    return NextResponse.redirect(new URL(`/?error=oauth_${encodeURIComponent(errorParam)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=missing_code_or_state", request.url));
  }

  const stateCookie = request.cookies.get("dalao_oauth_state")?.value;
  if (!stateCookie) {
    return NextResponse.redirect(new URL("/?error=state_expired", request.url));
  }

  let stateData: { csrf: string; action: string; bindUserId?: string };
  try {
    stateData = JSON.parse(Buffer.from(stateCookie, "base64url").toString("utf8"));
  } catch {
    return NextResponse.redirect(new URL("/?error=invalid_state", request.url));
  }

  if (stateData.csrf !== state) {
    return NextResponse.redirect(new URL("/?error=csrf_detected", request.url));
  }

  const config = getDalaoOAuthConfig(request.url);

  let tokenData: { access_token: string; scope?: string };
  let userInfo: { sub?: string | number; id?: string | number; username?: string; email?: string };

  try {
    tokenData = await exchangeDalaoCode(code, config.redirectUri);
    userInfo = await fetchDalaoUserInfo(tokenData.access_token);
  } catch (err: unknown) {
    console.error("[Dalao OAuth Exchange Error]:", err);
    return NextResponse.redirect(new URL("/?error=token_exchange_failed", request.url));
  }

  const accountId = String(userInfo.sub ?? userInfo.id ?? "").trim();
  if (!accountId) {
    return NextResponse.redirect(new URL("/?error=invalid_user_id", request.url));
  }

  // Handle Account Binding from /settings
  if (stateData.action === "bind" && stateData.bindUserId) {
    const currentUser = await getSessionUser();
    if (!currentUser || currentUser.id !== stateData.bindUserId) {
      return NextResponse.redirect(new URL("/settings?error=auth_required", request.url));
    }

    const existingBind = await db.query.accounts.findFirst({
      where: and(eq(accounts.providerId, "dalao"), eq(accounts.accountId, accountId)),
    });

    if (existingBind) {
      if (existingBind.userId === currentUser.id) {
        const res = NextResponse.redirect(new URL("/settings?tab=password&info=already_bound", request.url));
        res.cookies.delete("dalao_oauth_state");
        return res;
      }
      const res = NextResponse.redirect(new URL("/settings?tab=password&error=bound_to_other", request.url));
      res.cookies.delete("dalao_oauth_state");
      return res;
    }

    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId,
      providerId: "dalao",
      userId: currentUser.id,
      accessToken: tokenData.access_token,
      scope: tokenData.scope || "basic email",
    });

    const res = NextResponse.redirect(new URL("/settings?tab=password&success=dalao_bound", request.url));
    res.cookies.delete("dalao_oauth_state");
    return res;
  }

  // Normal Login Flow
  const existingAccount = await db.query.accounts.findFirst({
    where: and(eq(accounts.providerId, "dalao"), eq(accounts.accountId, accountId)),
  });

  if (existingAccount) {
    const boundUser = await db.query.users.findFirst({
      where: eq(users.id, existingAccount.userId),
    });

    if (!boundUser || boundUser.status === "suspended") {
      return NextResponse.redirect(new URL("/?error=account_disabled", request.url));
    }

    // Update access token opportunistically
    try {
      await db.update(accounts).set({
        accessToken: tokenData.access_token,
        scope: tokenData.scope || "basic email",
        updatedAt: new Date(),
      }).where(eq(accounts.id, existingAccount.id));
    } catch {
      // Non-critical
    }

    // Issue session token
    const sessionToken = crypto.randomUUID().replace(/-/g, "");
    const sessionExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await db.insert(sessions).values({
      id: crypto.randomUUID(),
      userId: boundUser.id,
      token: sessionToken,
      expiresAt: sessionExpiresAt,
    });

    const res = NextResponse.redirect(new URL("/", request.url));
    res.cookies.set("better-auth.session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: sessionExpiresAt,
      path: "/",
    });
    res.cookies.delete("dalao_oauth_state");
    return res;
  }

  // First time login - redirect to intermediate confirmation page
  const pendingToken = signPendingPayload({
    accountId,
    username: userInfo.username || `dalao_${accountId}`,
    email: userInfo.email,
    timestamp: Date.now(),
  });

  const res = NextResponse.redirect(new URL("/auth/oauth-connect", request.url));
  res.cookies.set("dalao_pending_auth", pendingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes
  });
  res.cookies.delete("dalao_oauth_state");

  return res;
}
