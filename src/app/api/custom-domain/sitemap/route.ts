import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, posts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

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
  const approvedPosts = await db.query.posts.findMany({
    where: and(eq(posts.userId, user.id), eq(posts.status, "approved")),
    orderBy: [desc(posts.createdAt)],
    columns: { id: true, createdAt: true },
  });

  const entries: string[] = [
    `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
  ];
  for (const p of approvedPosts) {
    const lastmod = p.createdAt instanceof Date
      ? p.createdAt.toISOString()
      : new Date(p.createdAt).toISOString();
    entries.push(
      `<url><loc>${base}/mo/${p.id}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
