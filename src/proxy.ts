import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { users, settings, posts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const DOMAIN_CACHE_TTL = 30_000;
const SETTING_CACHE_TTL = 60_000;
const UNKNOWN_DOMAIN_COOLDOWN = 60_000;

const domainCache = new Map<string, { slug: string; expires: number }>();
const settingCache = new Map<string, { value: string; expires: number }>();
const unknownDomainCache = new Map<string, number>();

function isValidDomain(domain: string): boolean {
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}

function getMainHosts(): string[] {
  const env = process.env.MAIN_HOST || "";
  return env.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
}

async function isCustomDomainGloballyAllowed(): Promise<boolean> {
  const cached = settingCache.get("allow_custom_domains");
  if (cached && Date.now() < cached.expires) return cached.value === "true";

  const row = await db.query.settings.findFirst({
    where: eq(settings.key, "allow_custom_domains"),
  });
  const value = row?.value || "false";
  settingCache.set("allow_custom_domains", { value, expires: Date.now() + SETTING_CACHE_TTL });
  return value === "true";
}

async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const cached = domainCache.get(hostname);
  if (cached && Date.now() < cached.expires) return cached.slug;

  const user = await db.query.users.findFirst({
    where: and(
      eq(users.customDomain, hostname),
      eq(users.allowCustomDomain, true),
    ),
    columns: { slug: true },
  });

  if (user?.slug) {
    domainCache.set(hostname, { slug: user.slug, expires: Date.now() + DOMAIN_CACHE_TTL });
    return user.slug;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)
  ) {
    return NextResponse.next();
  }

  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0].toLowerCase();
  const mainHosts = getMainHosts();

  if (mainHosts.length === 0) {
    console.error("[Proxy] MAIN_HOST is not configured — all requests treated as main host");
  }

  const isMainHost = mainHosts.length > 0 && mainHosts.includes(hostname);

  if (!isMainHost) {
    if (!isValidDomain(hostname)) {
      return new NextResponse(null, { status: 404 });
    }

    const lastRejected = unknownDomainCache.get(hostname);
    if (lastRejected && Date.now() - lastRejected < UNKNOWN_DOMAIN_COOLDOWN) {
      return new NextResponse(null, { status: 404 });
    }

    try {
      const isGloballyAllowed = await isCustomDomainGloballyAllowed();

      if (isGloballyAllowed) {
        const slug = await resolveCustomDomain(hostname);

        if (slug) {
          if (pathname === "/") {
            const rewriteUrl = new URL(`/u/${slug}`, request.url);
            const response = NextResponse.rewrite(rewriteUrl);
            response.headers.set("x-custom-domain", "true");
            response.headers.set("x-custom-domain-slug", slug);
            return response;
          }

          if (pathname.startsWith("/mo/")) {
            const segments = pathname.split("/");
            const postId = segments[2];
            if (postId) {
              const post = await db.query.posts.findFirst({
                where: eq(posts.id, postId),
                columns: { userId: true },
              });
              const owner = await db.query.users.findFirst({
                where: and(eq(users.slug, slug), eq(users.allowCustomDomain, true)),
                columns: { id: true },
              });

              if (post && owner && post.userId === owner.id) {
                const response = NextResponse.next();
                response.headers.set("x-custom-domain", "true");
                response.headers.set("x-custom-domain-slug", slug);
                return response;
              }
            }

            return new NextResponse(null, { status: 404 });
          }

          const primaryHost = mainHosts[0] || "localhost:3000";
          const protocol = request.headers.get("x-forwarded-proto") || "https";
          return NextResponse.redirect(`${protocol}://${primaryHost}${pathname}${request.nextUrl.search}`);
        }
      }
    } catch (err) {
      console.error("Proxy custom domain routing failed:", err);
    }

    unknownDomainCache.set(hostname, Date.now());
    if (unknownDomainCache.size > 5000) {
      const now = Date.now();
      for (const [h, t] of unknownDomainCache) {
        if (now - t > UNKNOWN_DOMAIN_COOLDOWN) unknownDomainCache.delete(h);
      }
    }

    return new NextResponse(null, { status: 404 });
  }

  try {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.role, "super_admin"),
      columns: { id: true },
    });
    const hasAdmin = !!adminUser;

    if (!hasAdmin && pathname !== "/init") {
      return NextResponse.redirect(new URL("/init", request.url));
    }

    if (hasAdmin && pathname === "/init") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch (err) {
    console.error("Proxy initialization check failed:", err);
  }

  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
