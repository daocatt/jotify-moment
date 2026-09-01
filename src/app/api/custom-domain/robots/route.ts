import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

function getHost(req: NextRequest): string {
  return req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
}

export async function GET(req: NextRequest) {
  const host = getHost(req).split(":")[0].toLowerCase();
  const user = await db.query.users.findFirst({
    where: and(eq(users.customDomain, host), eq(users.allowCustomDomain, true)),
    columns: { id: true },
  });
  if (!user) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const base = `https://${host}`;
  let allowIndexing = true;
  try {
    allowIndexing = (await getSetting("allow_search_indexing")) !== "false";
  } catch (err) {
    console.error("[Custom Robots] Failed to fetch search indexing setting:", err);
  }

  if (!allowIndexing) {
    return new NextResponse("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /init",
    "Disallow: /reset-password",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
