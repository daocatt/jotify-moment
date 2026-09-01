import type { MetadataRoute } from "next";
import { db } from "@/db";
import { users, posts } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

function getBaseUrl(): string {
  const betterAuthUrl = process.env.BETTER_AUTH_URL;
  if (betterAuthUrl && !betterAuthUrl.includes("localhost")) {
    return betterAuthUrl.replace(/\/$/, "");
  }
  const mainHost = process.env.MAIN_HOST?.split(",")[0]?.trim();
  if (mainHost && !mainHost.includes("localhost") && !mainHost.includes("127.0.0.1")) {
    return `https://${mainHost}`;
  }
  return betterAuthUrl?.replace(/\/$/, "") || "http://localhost:3000";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const now = new Date();

  // 1. Static & Core Routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/friends`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  try {
    // 2. Public User Profiles (excluding those with a custom domain — they are
    //    canonicalized to their own domain and served via /sitemap.xml there)
    const publicUsers = await db.query.users.findMany({
      where: and(
        eq(users.status, "active"),
        eq(users.publicHomepage, true),
        isNull(users.customDomain),
      ),
      columns: {
        slug: true,
        updatedAt: true,
        lastPostAt: true,
      },
    });

    for (const u of publicUsers) {
      if (u.slug) {
        routes.push({
          url: `${baseUrl}/u/${encodeURIComponent(u.slug)}`,
          lastModified: u.lastPostAt || u.updatedAt || now,
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
    }

    // 3. Approved Posts from Active & Allowed Users
    const activePosts = await db.query.posts.findMany({
      where: eq(posts.status, "approved"),
      orderBy: [desc(posts.createdAt)],
      limit: 1000,
      columns: {
        id: true,
        createdAt: true,
      },
      with: {
        author: {
          columns: {
            status: true,
            displayPermission: true,
            customDomain: true,
            allowCustomDomain: true,
          },
        },
      },
    });

    for (const p of activePosts) {
      if (p.author?.status === "active" && p.author?.displayPermission) {
        // Custom-domain owners are canonicalized to their own domain — skip here.
        if (p.author.customDomain && p.author.allowCustomDomain) continue;
        routes.push({
          url: `${baseUrl}/mo/${p.id}`,
          lastModified: p.createdAt,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  } catch (err) {
    console.error("[Sitemap] Failed to fetch sitemap items from DB:", err);
  }

  return routes;
}
