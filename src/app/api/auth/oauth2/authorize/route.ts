import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, verificationCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";

const CODE_EXPIRY_MS = 60_000;
const CODE_LENGTH = 32;

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");
  const responseType = searchParams.get("response_type");

  if (!clientId || !redirectUri) {
    return new NextResponse("Missing client_id or redirect_uri", { status: 400 });
  }

  if (responseType !== "code") {
    return new NextResponse("Unsupported response_type", { status: 400 });
  }

  let redirectHost: string;
  try {
    redirectHost = new URL(redirectUri).hostname.toLowerCase();
  } catch {
    return new NextResponse("Invalid redirect_uri", { status: 400 });
  }

  if (redirectHost !== clientId.toLowerCase()) {
    return new NextResponse("redirect_uri host does not match client_id", { status: 400 });
  }

  const isValidClient = await validateClient(clientId);
  if (!isValidClient) {
    return new NextResponse("Invalid client_id", { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) {
    const returnTo = `/api/auth/oauth2/authorize?${searchParams.toString()}`;
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("oauth_action", "authorize");
    loginUrl.searchParams.set("oauth_return", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  const code = crypto.randomBytes(CODE_LENGTH).toString("hex");
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  await db.insert(verificationCodes).values({
    email: user.email || "",
    code: codeHash,
    type: "oauth2_code",
    expiresAt,
  });

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);

  return NextResponse.redirect(callbackUrl);
}
