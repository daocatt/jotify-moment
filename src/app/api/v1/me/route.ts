import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);

  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or expired API token / session" },
      { status: 401 }
    );
  }

  const { user, token, authType } = auth;

  return NextResponse.json({
    success: true,
    authType,
    user: {
      id: user.id,
      name: user.name,
      slug: user.slug,
      role: user.role,
      avatar: user.avatar,
      bio: user.bio,
    },
    token: token
      ? {
          name: token.name,
          scopes: token.scopes,
        }
      : null,
  });
}
