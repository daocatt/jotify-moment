import type { MetadataRoute } from "next";
import { getSetting } from "@/lib/settings";

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
  const allowIndexing = (await getSetting("allow_search_indexing")) !== "false";

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
