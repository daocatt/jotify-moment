import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

async function isAllowedFaviconHost(hostname: string): Promise<boolean> {
  const mainHostEnv = process.env.MAIN_HOST || "";
  const mainHosts = mainHostEnv.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  if (mainHosts.includes(hostname.toLowerCase())) return true;

  const { users } = await import("@/db/schema");
  const { and, eq: eqOp } = await import("drizzle-orm");
  const domainUser = await db.query.users.findFirst({
    where: and(
      eqOp(users.customDomain, hostname.toLowerCase()),
      eqOp(users.allowCustomDomain, true)
    ),
    columns: { id: true },
  });
  return !!domainUser;
}

export async function GET() {
  try {
    const row = await db.query.settings.findFirst({
      where: eq(settings.key, "site_favicon"),
    });

    if (row?.value) {
      const faviconUrl = row.value;
      if (faviconUrl.startsWith("/uploads/") && !faviconUrl.includes("..")) {
        const publicDir = path.resolve(process.cwd(), "public");
        const filePath = path.resolve(process.cwd(), "public", faviconUrl);
        if (filePath.startsWith(publicDir + path.sep) && fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".svg" ? "image/svg+xml" : ext === ".ico" ? "image/x-icon" : "image/png";
          return new Response(buffer, {
            headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
          });
        }
      } else if (faviconUrl.startsWith("https://") || faviconUrl.startsWith("http://")) {
        try {
          const urlObj = new URL(faviconUrl);
          const hostname = urlObj.hostname.toLowerCase();

          if (!await isAllowedFaviconHost(hostname)) {
            return new NextResponse("Forbidden destination", { status: 400 });
          }

          const res = await fetch(faviconUrl);
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            return new Response(buffer, {
              headers: { "Content-Type": res.headers.get("Content-Type") || "image/png", "Cache-Control": "public, max-age=3600" },
            });
          }
        } catch (e) {
          console.error("Favicon fetch error:", e);
          return new NextResponse("Failed to fetch favicon", { status: 502 });
        }
      }
    }
  } catch (error) {
    console.error("Favicon route error:", error);
  }

  const defaultPath = path.join(process.cwd(), "public", "logo.svg");
  if (fs.existsSync(defaultPath)) {
    const buffer = fs.readFileSync(defaultPath);
    return new Response(buffer, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}
