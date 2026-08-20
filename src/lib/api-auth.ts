import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { getSessionUser, type SessionUser } from "@/lib/auth";

export interface AuthenticatedContext {
  user: SessionUser;
  token?: {
    id: string;
    name: string;
    scopes: string[];
  };
  authType: "session" | "token";
}

/**
 * Authenticate an incoming Request.
 * Supports:
 * 1. Authorization: Bearer jotify_pat_xxx (AI Agent / API Token)
 * 2. Next.js Session Cookie (Interactive user)
 */
export async function authenticateApiRequest(req: Request): Promise<AuthenticatedContext | null> {
  // 1. Check Bearer Token in Authorization Header
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const plainToken = authHeader.slice(7).trim();
    if (plainToken.startsWith("jotify_pat_")) {
      const tokenHash = crypto.createHash("sha256").update(plainToken).digest("hex");

      try {
        const tokenRecord = await db.query.apiTokens.findFirst({
          where: eq(apiTokens.tokenHash, tokenHash),
          with: {
            user: true,
          },
        });

        if (!tokenRecord || !tokenRecord.user) {
          return null;
        }

        // Check expiration
        if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
          return null;
        }

        const user = tokenRecord.user;
        if (user.status === "suspended") {
          return null;
        }

        // Update lastUsedAt asynchronously (do not block request)
        db.update(apiTokens)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiTokens.id, tokenRecord.id))
          .catch((err) => console.error("[ApiAuth] Failed to update lastUsedAt:", err));

        const sessionUser: SessionUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          slug: user.slug,
          avatar: user.avatar,
          bio: user.bio,
          coverImage: user.coverImage,
          wechat: user.wechat,
          telegram: user.telegram,
          telegramChatId: user.telegramChatId,
          telegramBindToken: user.telegramBindToken,
          github: user.github,
          x: user.x,
          otherLink: user.otherLink,
          role: user.role as any,
          status: user.status as any,
          theme: user.theme,
          customDomain: user.customDomain,
          allowCustomDomain: user.allowCustomDomain,
          publishToFeed: user.publishToFeed,
          displayPermission: user.displayPermission,
          publicHomepage: user.publicHomepage,
          loginDisabledAt: user.loginDisabledAt,
        };

        return {
          user: sessionUser,
          token: {
            id: tokenRecord.id,
            name: tokenRecord.name,
            scopes: (tokenRecord.scopes as string[]) || ["posts:write", "upload:write"],
          },
          authType: "token",
        };
      } catch (err) {
        console.error("[ApiAuth] Token verification failed:", err);
        return null;
      }
    }
  }

  // 2. Fallback to Session Cookie
  const sessionUser = await getSessionUser();
  if (sessionUser) {
    return {
      user: sessionUser,
      authType: "session",
    };
  }

  return null;
}
