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
        try {
          const urlObj = new URL(faviconUrl);
          const hostname = urlObj.hostname.toLowerCase();
          if (hostname === "localhost" || hostname === "localhost.localdomain") {
            return new NextResponse("Forbidden Destination", { status: 400 });
          }

          // Resolve hostname to check for SSRF IP ranges
          const dns = await import("dns");
          const { promisify } = await import("util");
          const lookupPromise = promisify(dns.lookup);
          let ip: string;
          try {
            const lookupResult = await lookupPromise(hostname);
            ip = lookupResult.address;
          } catch {
            return new NextResponse("Invalid Host", { status: 400 });
          }

          const isPrivate = (ipAddress: string): boolean => {
            if (ipAddress.startsWith("127.")) return true;
            if (ipAddress.startsWith("10.")) return true;
            if (ipAddress.startsWith("192.168.")) return true;
            if (ipAddress.startsWith("169.254.")) return true;
            if (ipAddress.startsWith("172.")) {
              const parts = ipAddress.split(".");
              if (parts.length >= 2) {
                const second = parseInt(parts[1], 10);
                if (second >= 16 && second <= 31) return true;
              }
            }
            if (ipAddress === "0.0.0.0" || ipAddress === "255.255.255.255") return true;
            if (ipAddress === "::1" || ipAddress === "0:0:0:0:0:0:0:1") return true;
            if (ipAddress.toLowerCase().startsWith("fe80:") || ipAddress.toLowerCase().startsWith("fe80::")) return true;
            if (ipAddress.toLowerCase().startsWith("fc00:") || ipAddress.toLowerCase().startsWith("fd00:")) return true;
            if (ipAddress === "::" || ipAddress === "0:0:0:0:0:0:0:0") return true;
            return false;
          };

          if (isPrivate(ip)) {
            return new NextResponse("Forbidden Destination", { status: 400 });
          }

          const res = await fetch(faviconUrl);
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            return new Response(buffer, {
              headers: { "Content-Type": res.headers.get("Content-Type") || "image/png", "Cache-Control": "public, max-age=3600" },
            });
          }
        } catch (e) {
          console.error("SSRF check error:", e);
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
