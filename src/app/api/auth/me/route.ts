import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      const response = NextResponse.json({ user: null }, { status: 401 });
      const cookieStore = await cookies();
      if (cookieStore.has("better-auth.session_token")) {
        // Mirror the attributes the cookie was set with (Secure in
        // production, HttpOnly, SameSite). Without them, per RFC 6265bis
        // "leave secure cookies alone", browsers silently reject clearing
        // the cookie.
        response.cookies.set("better-auth.session_token", "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
      }
      return response;
    }
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        slug: user.slug,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        bio: user.bio,
        coverImage: user.coverImage,
        wechat: user.wechat,
        telegram: user.telegram,
        telegramBound: !!user.telegramChatId,
        github: user.github,
        x: user.x,
        otherLink: user.otherLink,
        customDomain: user.customDomain,
        allowCustomDomain: user.allowCustomDomain,
        publishToFeed: user.publishToFeed,
        displayPermission: user.displayPermission,
        publicHomepage: user.publicHomepage,
      },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
