import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
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
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
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

// Keeping this as a stub since Better Auth manages its own tokens
export async function generateToken(user: SessionUser): Promise<string> {
  return "";
}

export async function getSessionUser(): Promise<SessionUser | null> {
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
    };
  } catch (error) {
    console.error("getSessionUser error:", error);
    return null;
  }
}

// Stubs to avoid breaking compilation elsewhere
export async function setSessionCookie(token: string) {}

export async function clearSessionCookie() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("better-auth.session_token");
  } catch {}
}
