import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, verificationCodes, sessions } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import crypto from "crypto";

const CODE_EXPIRY_MS = 60_000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  return crypto.timingSafeEqual(bufA, bufB);
}

async function validateClient(clientId: string): Promise<boolean> {
  const mainHostEnv = process.env.MAIN_HOST || "";
  const mainHosts = mainHostEnv.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  if (mainHosts.includes(clientId.toLowerCase())) return false;

  const domainUser = await db.query.users.findFirst({
    where: and(
      eq(users.customDomain, clientId.toLowerCase()),
      eq(users.allowCustomDomain, true),
    ),
    columns: { id: true },
  });
  return !!domainUser;
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let code: string | null = null;
  let clientId: string | null = null;
  let clientSecret: string | null = null;
  let redirectUri: string | null = null;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    code = params.get("code");
    clientId = params.get("client_id");
    clientSecret = params.get("client_secret");
    redirectUri = params.get("redirect_uri");
  } else if (contentType.includes("application/json")) {
    const body = await request.json();
    code = body.code || null;
    clientId = body.client_id || null;
    clientSecret = body.client_secret || null;
    redirectUri = body.redirect_uri || null;
  }

  if (!code || !clientId || !clientSecret) {
    return NextResponse.json({ error: "invalid_request", error_description: "Missing required parameters" }, { status: 400 });
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    console.error("BETTER_AUTH_SECRET is not set");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!timingSafeEqual(clientSecret, secret)) {
    return NextResponse.json({ error: "invalid_client", error_description: "Invalid client_secret" }, { status: 401 });
  }

  const isValidClient = await validateClient(clientId);
  if (!isValidClient) {
    return NextResponse.json({ error: "invalid_client", error_description: "Invalid client_id" }, { status: 401 });
  }

  if (redirectUri) {
    let redirectHost: string;
    try {
      redirectHost = new URL(redirectUri).hostname.toLowerCase();
    } catch {
      return NextResponse.json({ error: "invalid_request", error_description: "Invalid redirect_uri" }, { status: 400 });
    }
    if (redirectHost !== clientId.toLowerCase()) {
      return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri host does not match client_id" }, { status: 400 });
    }
  }

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  const deleted = await db.delete(verificationCodes).where(
    and(
      eq(verificationCodes.code, codeHash),
      eq(verificationCodes.type, "oauth2_code"),
      gt(verificationCodes.expiresAt, new Date())
    )
  ).returning();

  if (deleted.length === 0) {
    return NextResponse.json({ error: "invalid_grant", error_description: "Authorization code has already been used or expired" }, { status: 400 });
  }

  const userEmail = deleted[0].email;
  const tokenUser = await db.query.users.findFirst({
    where: eq(users.email, userEmail),
    columns: { id: true },
  });

  if (!tokenUser) {
    return NextResponse.json({ error: "invalid_grant", error_description: "User not found" }, { status: 400 });
  }

  const sessionToken = crypto.randomUUID();
  const now = new Date();
  const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || null;
  const ua = request.headers.get("user-agent") || null;

  await db.insert(sessions).values({
    id: sessionToken,
    token: sessionToken,
    userId: tokenUser.id,
    expiresAt: sessionExpiry,
    ipAddress: ip,
    userAgent: ua,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({
    access_token: sessionToken,
    token_type: "Bearer",
    expires_in: 7 * 24 * 60 * 60,
  });
}
