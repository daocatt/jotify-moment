import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, settings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain")?.trim().toLowerCase();
  const token = searchParams.get("token");

  // 1. Authenticate check request using token
  const expectedToken = process.env.CADDY_ASK_TOKEN;
  if (!expectedToken || token !== expectedToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!domain) {
    return new NextResponse("Bad Request: domain is required", { status: 400 });
  }

  try {
    // 2. First check if custom domain system is globally enabled
    const globalAllowRow = await db.query.settings.findFirst({
      where: eq(settings.key, "allow_custom_domains")
    });
    const isGloballyAllowed = globalAllowRow?.value === "true";
    if (!isGloballyAllowed) {
      console.warn(`[Caddy Ask API] Domain ${domain} rejected: custom domains feature is globally disabled.`);
      return new NextResponse("Feature Disabled", { status: 403 });
    }

    // 3. Query the user record having this domain and authorized custom domain permission
    const user = await db.query.users.findFirst({
      where: and(
        eq(users.customDomain, domain),
        eq(users.allowCustomDomain, true)
      ),
      columns: { id: true }
    });

    if (!user) {
      console.warn(`[Caddy Ask API] Domain ${domain} rejected: no matching authorized user found.`);
      return new NextResponse("Not Found", { status: 404 });
    }

    console.log(`[Caddy Ask API] Domain ${domain} allowed.`);
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error(`[Caddy Ask API] Error checking domain ${domain}:`, error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
