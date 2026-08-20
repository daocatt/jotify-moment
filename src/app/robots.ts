import type { MetadataRoute } from "next";
import { getSetting } from "@/lib/settings";

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

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = getBaseUrl();
  let allowIndexing = true;
  try {
    allowIndexing = (await getSetting("allow_search_indexing")) !== "false";
  } catch (err) {
    console.error("[Robots] Failed to fetch search indexing setting from DB:", err);
  }

  if (!allowIndexing) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/*",
          "/api/*",
          "/init",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
