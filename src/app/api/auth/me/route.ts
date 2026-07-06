import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
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
      },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
