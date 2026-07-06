import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

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
      } else if (faviconUrl.startsWith("http")) {
        const res = await fetch(faviconUrl);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          return new Response(buffer, {
            headers: { "Content-Type": res.headers.get("Content-Type") || "image/png", "Cache-Control": "public, max-age=3600" },
          });
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
