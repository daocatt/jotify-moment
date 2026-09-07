import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth";
import { getDalaoOAuthConfig, generateRandomState } from "@/lib/oauth-dalao";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isEnabled = (await getSetting("dalao_oauth_enabled")) === "true";
  if (!isEnabled) {
    return new NextResponse("大佬论坛登录功能暂未开启", { status: 403 });
  }

  const config = getDalaoOAuthConfig(request.url);
  if (!config.clientId || !config.clientSecret) {
    return new NextResponse("大佬论坛 OAuth 凭据未在服务端配置 (DALAO_OAUTH_CLIENT_ID / DALAO_OAUTH_CLIENT_SECRET)", { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action"); // 'bind' or undefined

  let bindUserId: string | undefined;
  if (action === "bind") {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.redirect(new URL("/?error=auth_required", request.url));
    }
    bindUserId = user.id;
  }

  const stateRandom = generateRandomState();
  const stateData = {
    csrf: stateRandom,
    action: action === "bind" ? "bind" : "login",
    bindUserId,
  };

  const stateCookieValue = Buffer.from(JSON.stringify(stateData)).toString("base64url");

  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", "basic email");
  authorizeUrl.searchParams.set("state", stateRandom);

  const response = NextResponse.redirect(authorizeUrl.toString());

  response.cookies.set("dalao_oauth_state", stateCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return response;
}
