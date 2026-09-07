import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { cache } from "react";

export { MIN_PASSWORD_LENGTH };
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
  wechat: string | null;
  telegram: string | null;
  telegramChatId: string | null;
  telegramBindToken: string | null;
  github: string | null;
  x: string | null;
  otherLink: string | null;
  role: "super_admin" | "admin" | "user" | "guest";
  status: "active" | "suspended";
  theme: string | null;
  customDomain: string | null;
  allowCustomDomain: boolean;
  publishToFeed: boolean;
  displayPermission: boolean;
  publicHomepage: boolean;
  loginDisabledAt: Date | null;
}

// Generate a unique 8-digit numeric slug for a user.
async function generateUniqueUserSlug(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = Math.floor(10000000 + Math.random() * 90000000).toString();
    const conflict = await db.query.users.findFirst({ where: eq(users.slug, candidate) });
    if (!conflict || conflict.id === userId) return candidate;
  }
  throw new Error("Failed to generate unique user slug");
}

// Backfill a unique 8-digit numeric slug for a user when it is null.
export async function ensureUserSlug(userId: string, _name: string): Promise<string> {
  // If already has an 8-digit numeric slug, return it
  const existing = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { slug: true } });
  if (existing?.slug && /^\d{8}$/.test(existing.slug)) return existing.slug;

  const slug = await generateUniqueUserSlug(userId);
  await db.update(users).set({ slug }).where(eq(users.id, userId));
  return slug;
}

// Memoized per request: getSessionUser is called from many server actions/routes
// within a single request; this avoids repeated session+user DB lookups.
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("better-auth.session_token")?.value;
    
    if (!token) {
      return null;
    }

    // Direct local query to DB sessions table to find active token, 
    // completely avoiding localhost HTTP fetch loopbacks in Server Actions.
    const sessionRow = await db.query.sessions.findFirst({
      where: eq(sessions.token, token),
    });

    if (!sessionRow || new Date() > sessionRow.expiresAt) {
      return null;
    }

    // Find the associated user in users table
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, sessionRow.userId),
    });

    if (!dbUser || dbUser.status === "suspended") {
      return null;
    }

    let slug = dbUser.slug;
    if (!slug && dbUser.role !== "guest") {
      slug = await ensureUserSlug(dbUser.id, dbUser.name);
    }

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      slug,
      avatar: dbUser.avatar,
      bio: dbUser.bio,
      coverImage: dbUser.coverImage,
      wechat: dbUser.wechat,
      telegram: dbUser.telegram,
      telegramChatId: dbUser.telegramChatId,
      telegramBindToken: dbUser.telegramBindToken,
      github: dbUser.github,
      x: dbUser.x,
      otherLink: dbUser.otherLink,
      role: (dbUser.role as "super_admin" | "admin" | "user" | "guest") || "user",
      status: (dbUser.status as "active" | "suspended") || "active",
      theme: dbUser.theme,
      customDomain: dbUser.customDomain,
      allowCustomDomain: dbUser.allowCustomDomain,
      publishToFeed: dbUser.publishToFeed,
      displayPermission: dbUser.displayPermission,
      publicHomepage: dbUser.publicHomepage,
      loginDisabledAt: dbUser.loginDisabledAt,
    };
  } catch (error) {
    console.error("getSessionUser error:", error);
    throw new Error("Session lookup failed");
  }
});

/**
 * Cascading session revocation: revoke all sessions belonging to the owner
 * of the given token, across the main host and all custom domains (e.g.
 * a.com, b.com) — cookies cannot be shared across those domains, so each
 * domain may hold a separate session row for the same user.
 *
 * Intentional UX trade-off: because sessions cannot be scoped per-domain,
 * this logs the user out on ALL devices, not just the current one.
 *
 * Falls back to deleting just the single token row when the token no
 * longer resolves to a user.
 */
export async function revokeUserSessionsByToken(token: string): Promise<void> {
  const currentSession = await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
    columns: { userId: true },
  });

  if (currentSession?.userId) {
    await db.delete(sessions).where(eq(sessions.userId, currentSession.userId));
  } else {
    await db.delete(sessions).where(eq(sessions.token, token));
  }
}

export async function clearSessionCookie() {
  try {
    const cookieStore = await cookies();
    // Explicitly set an expired cookie instead of delete() so that the
    // attributes (Secure, HttpOnly, SameSite) mirror how the cookie was
    // originally set. Per RFC 6265bis "leave secure cookies alone", a
    // clearing Set-Cookie without the Secure attribute is silently
    // rejected by modern browsers (Chrome 89+, Firefox 104+) when the
    // stored cookie was set with Secure (i.e. in production).
    cookieStore.set("better-auth.session_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    });
  } catch {}
}
