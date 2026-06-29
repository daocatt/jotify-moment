import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("JWT_SECRET environment variable is required in production");
}
const FALLBACK_SECRET = "jotify-moment-dev-only-secret-key";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "admin" | "user";
  status: "active" | "suspended";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function generateToken(user: SessionUser): Promise<string> {
  return jwt.sign(user, JWT_SECRET || FALLBACK_SECRET, { expiresIn: "7d" });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET || FALLBACK_SECRET) as SessionUser;
    // Verify user still exists and is active in DB
    const dbUser = await db.query.users.findFirst({
      where: eq(users.id, decoded.id),
    });
    if (!dbUser || dbUser.status === "suspended") {
      return null;
    }
    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      status: dbUser.status,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("token");
}
