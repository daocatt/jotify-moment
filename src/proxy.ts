import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { users, posts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSetting } from "@/lib/settings";

const DOMAIN_CACHE_TTL = 30_000;
const UNKNOWN_DOMAIN_COOLDOWN = 60_000;

const domainCache = new Map<string, { slug: string; expires: number }>();
const unknownDomainCache = new Map<string, number>();

function isValidDomain(domain: string): boolean {
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
}

function getMainHosts(): string[] {
  const env = process.env.MAIN_HOST || "";
  return env.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
}

async function isCustomDomainGloballyAllowed(): Promise<boolean> {
  return (await getSetting("allow_custom_domains")) === "true";
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

/**
 * Generates a per-request CSP nonce and wires it into the request headers
 * (x-nonce) so Next.js applies it to its own inline scripts/bundles.
 * Removes 'unsafe-inline' from script-src — only nonce'd inline scripts run.
 * Pages must be dynamically rendered for nonces to work.
 */
function buildNonce(request: NextRequest): { requestHeaders: Headers; csp: string } {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "frame-src https://www.youtube.com https://player.bilibili.com https://www.tiktok.com https://open.spotify.com https://music.163.com https://embed.music.apple.com https://embed.podcasts.apple.com https://challenges.cloudflare.com",
    "connect-src 'self' https://challenges.cloudflare.com https://www.google-analytics.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // SECURITY: strip client-supplied custom-domain markers — only the proxy may
  // set these, so a visitor can't impersonate the custom-domain UI/auth flow.
  requestHeaders.delete("x-custom-domain");
  requestHeaders.delete("x-custom-domain-slug");
  return { requestHeaders, csp };
}

function applySecurityHeaders(response: NextResponse, request: NextRequest, csp?: string): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (csp) response.headers.set("Content-Security-Policy", csp);
  if (request.headers.get("x-forwarded-proto") === "https") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  return response;
}

let hasAdminCache: { value: boolean; expires: number } | null = null;
const ADMIN_CHECK_TTL = 300_000; // 5 minutes cache when admin exists

async function checkHasAdmin(): Promise<boolean> {
  if (hasAdminCache && Date.now() < hasAdminCache.expires) {
    return hasAdminCache.value;
  }
  const adminUser = await db.query.users.findFirst({
    where: eq(users.role, "super_admin"),
    columns: { id: true },
  });
  const hasAdmin = !!adminUser;
  // Cache for 5 minutes if admin exists, 5 seconds if not (allowing system init)
  const ttl = hasAdmin ? ADMIN_CHECK_TTL : 5_000;
  hasAdminCache = { value: hasAdmin, expires: Date.now() + ttl };
  return hasAdmin;
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

  if (pathname.startsWith("/uploads/")) {
    if (pathname.includes("..") || pathname.endsWith("/")) {
      return new NextResponse(null, { status: 403 });
    }
    const response = NextResponse.next();
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return response;
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
            const { requestHeaders, csp } = buildNonce(request);
            requestHeaders.set("x-custom-domain", "true");
            requestHeaders.set("x-custom-domain-slug", slug);
            const response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
            applySecurityHeaders(response, request, csp);
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
                const { requestHeaders, csp } = buildNonce(request);
                requestHeaders.set("x-custom-domain", "true");
                requestHeaders.set("x-custom-domain-slug", slug);
                const response = NextResponse.next({ request: { headers: requestHeaders } });
                applySecurityHeaders(response, request, csp);
                return response;
              }
            }

            return new NextResponse(null, { status: 404 });
          }

          if (pathname === "/sitemap.xml" || pathname === "/robots.txt") {
            const target = pathname === "/sitemap.xml"
              ? "/api/custom-domain/sitemap"
              : "/api/custom-domain/robots";
            const { requestHeaders, csp } = buildNonce(request);
            const response = NextResponse.rewrite(
              new URL(target, request.url),
              { request: { headers: requestHeaders } },
            );
            applySecurityHeaders(response, request, csp);
            return response;
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
    const hasAdmin = await checkHasAdmin();

    if (!hasAdmin && pathname !== "/init") {
      return NextResponse.redirect(new URL("/init", request.url));
    }

    if (hasAdmin && pathname === "/init") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch (err) {
    console.error("Proxy initialization check failed:", err);
  }

  const { requestHeaders, csp } = buildNonce(request);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  applySecurityHeaders(response, request, csp);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
