import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress } from "hono/compress";
import fs from "fs";
import path from "path";
import { auth } from "@/lib/auth-better";
import { getAction } from "@/server/action-registry";
import { setServerContext, getOutgoingCookies } from "@/shims/next-headers";
import { toHonoHandler } from "@/server/api-adapter";
import {
  loadHomePage,
  loadUserHomePage,
  loadMomentPage,
  loadFriendsPage,
  loadPinnedPage,
  loadTagPage,
  loadSettingsPage,
  loadAdminPage,
  type PageLoadResult,
} from "@/server/page-loaders";
import { db } from "@/db";
import { users, posts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSetting } from "@/lib/settings";

// Route Handlers
import * as uploadRoute from "@/app/api/upload/route";
import * as postsRoute from "@/app/api/v1/posts/route";
import * as meRoute from "@/app/api/v1/me/route";
import * as v1UploadRoute from "@/app/api/v1/upload/route";
import * as domainsCheckRoute from "@/app/api/domains/check/route";
import * as telegramRoute from "@/app/api/telegram/webhook/route";
import * as robotsRoute from "@/app/api/custom-domain/robots/route";
import * as sitemapRoute from "@/app/api/custom-domain/sitemap/route";
import * as initStatusRoute from "@/app/api/init-status/route";
import * as faviconRoute from "@/app/api/favicon/route";
import * as authMeRoute from "@/app/api/auth/me/route";
import * as authLogoutRoute from "@/app/api/auth/logout/route";
import * as oauth2TokenRoute from "@/app/api/auth/oauth2/token/route";
import * as oauth2AuthorizeRoute from "@/app/api/auth/oauth2/authorize/route";
import * as oauth2CallbackRoute from "@/app/api/auth/oauth2/callback/route";
import * as betterAuthRoute from "@/app/api/auth/[...better-auth]/route";
import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const app = new Hono();

app.use("*", compress());

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

// Custom domain cache
const domainCache = new Map<string, { slug: string; expires: number }>();
function getMainHosts(): string[] {
  const env = process.env.MAIN_HOST || "";
  return env.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const cached = domainCache.get(hostname);
  if (cached && Date.now() < cached.expires) return cached.slug;

  const user = await db.query.users.findFirst({
    where: and(
      eq(users.customDomain, hostname),
      eq(users.allowCustomDomain, true),
      eq(users.customDomainStatus, "approved")
    ),
    columns: { slug: true },
  });

  if (user?.slug) {
    domainCache.set(hostname, { slug: user.slug, expires: Date.now() + 30000 });
    return user.slug;
  }
  return null;
}

let hasAdminCache: { value: boolean; expires: number } | null = null;
async function checkHasAdmin(): Promise<boolean> {
  if (hasAdminCache && Date.now() < hasAdminCache.expires) {
    return hasAdminCache.value;
  }
  const adminUser = await db.query.users.findFirst({
    where: eq(users.role, "super_admin"),
    columns: { id: true },
  });
  const hasAdmin = !!adminUser;
  hasAdminCache = { value: hasAdmin, expires: Date.now() + (hasAdmin ? 300000 : 5000) };
  return hasAdmin;
}

async function isCustomDomainGloballyAllowed(): Promise<boolean> {
  return (await getSetting("allow_custom_domains")) === "true";
}

// Check admin initialization & Custom Domain Middleware
app.use("*", async (c, next) => {
  const pathname = c.req.path;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/uploads") ||
    pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|webp|webmanifest)$/)
  ) {
    return next();
  }

  const hasAdmin = await checkHasAdmin();
  if (!hasAdmin && pathname !== "/init") {
    return c.redirect("/init");
  }

  const rawHost = c.req.header("x-forwarded-host") || c.req.header("host") || "";
  const hostname = rawHost.split(",")[0].trim().split(":")[0].toLowerCase();
  const mainHosts = getMainHosts();
  const isMainHost = mainHosts.length === 0 || mainHosts.includes(hostname);

  if (!isMainHost) {
    const isGloballyAllowed = await isCustomDomainGloballyAllowed();
    if (!isGloballyAllowed) {
      return c.text("Custom domains are disabled", 404);
    }

    const slug = await resolveCustomDomain(hostname);
    if (!slug) {
      return c.text("Domain not found or pending approval", 404);
    }

    const reqHeaders = new Headers(c.req.raw.headers);
    reqHeaders.set("x-custom-domain", "true");
    reqHeaders.set("x-custom-domain-slug", slug);

    // Custom domain rewrite: "/" serves user's profile at routePath "/"
    if (pathname === "/") {
      return handleSsr(c, () => loadUserHomePage(slug, reqHeaders), "/", reqHeaders);
    }

    // Canonicalize /u/:slug on custom domain to "/"
    if (pathname === `/u/${slug}`) {
      return c.redirect("/", 301);
    }

    // Custom domain pinned posts page
    if (pathname === `/u/${slug}/pinned` || pathname === "/pinned") {
      return handleSsr(c, () => loadUserHomePage(slug, reqHeaders), pathname, reqHeaders);
    }

    // Custom domain moment detail page (only if post belongs to the domain owner)
    if (pathname.startsWith("/mo/")) {
      const postId = pathname.split("/")[2];
      if (postId) {
        const [post, owner] = await Promise.all([
          db.query.posts.findFirst({
            where: eq(posts.id, postId),
            columns: { userId: true },
          }),
          db.query.users.findFirst({
            where: and(eq(users.slug, slug), eq(users.allowCustomDomain, true)),
            columns: { id: true },
          }),
        ]);
        if (post && owner && post.userId === owner.id) {
          return handleSsr(c, () => loadMomentPage(postId, reqHeaders), `/mo/${postId}`, reqHeaders);
        }
      }
      return c.text("Not Found", 404);
    }

    if (pathname === "/sitemap.xml") {
      return toHonoHandler(sitemapRoute.GET)(c);
    }
    if (pathname === "/robots.txt") {
      return toHonoHandler(robotsRoute.GET)(c);
    }

    const primaryHost = mainHosts[0] || "localhost:3000";
    const protocol = c.req.header("x-forwarded-proto") || "https";
    const urlObj = new URL(c.req.url);
    return c.redirect(`${protocol}://${primaryHost}${pathname}${urlObj.search}`);
  }

  return next();
});

// Server Actions Bridge
app.post("/api/action/:name", async (c) => {
  const name = c.req.param("name");
  const fn = getAction(name);
  if (!fn) {
    return c.json({ error: `Action ${name} not found` }, 404);
  }

  const cookieMap = new Map<string, string>();
  const cookieHeader = c.req.header("cookie") || "";
  cookieHeader.split(";").forEach((pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k) cookieMap.set(k, decodeURIComponent(v.join("=")));
  });
  setServerContext(c.req.raw.headers, cookieMap);

  try {
    const body = await c.req.json().catch(() => ({ args: [] }));
    const args = Array.isArray(body?.args) ? body.args : [];
    const result = await fn(...args);

    const outgoing = getOutgoingCookies();
    outgoing.forEach((cookieStr) => {
      c.header("Set-Cookie", cookieStr, { append: true });
    });

    return c.json(result);
  } catch (err: unknown) {
    console.error(`Action ${name} error:`, err);
    const message = err instanceof Error ? err.message : "Internal Action Error";
    return c.json({ error: message }, 500);
  }
});

// RESTful API routes (specific auth endpoints MUST be registered before /api/auth/* catch-all)
app.post("/api/upload", toHonoHandler(uploadRoute.POST));
app.get("/api/v1/posts", toHonoHandler(postsRoute.GET));
app.post("/api/v1/posts", toHonoHandler(postsRoute.POST));
app.get("/api/v1/me", toHonoHandler(meRoute.GET));
app.post("/api/v1/upload", toHonoHandler(v1UploadRoute.POST));
app.get("/api/domains/check", toHonoHandler(domainsCheckRoute.GET));
app.post("/api/telegram/webhook", toHonoHandler(telegramRoute.POST));
app.get("/api/custom-domain/robots", toHonoHandler(robotsRoute.GET));
app.get("/api/custom-domain/sitemap", toHonoHandler(sitemapRoute.GET));
app.get("/api/init-status", toHonoHandler(initStatusRoute.GET));
app.get("/api/favicon", toHonoHandler(faviconRoute.GET));
app.get("/api/auth/me", toHonoHandler(authMeRoute.GET));
app.post("/api/auth/logout", toHonoHandler(authLogoutRoute.POST));
app.post("/api/auth/oauth2/token", toHonoHandler(oauth2TokenRoute.POST));
app.get("/api/auth/oauth2/authorize", toHonoHandler(oauth2AuthorizeRoute.GET));
app.get("/api/auth/oauth2/callback", toHonoHandler(oauth2CallbackRoute.GET));

// Better Auth catch-all endpoint
app.get("/api/auth/*", toHonoHandler(betterAuthRoute.GET));
app.post("/api/auth/*", toHonoHandler(betterAuthRoute.POST));
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Dynamic Web Manifest, Robots.txt, and Sitemap.xml
app.get("/manifest.webmanifest", (c) =>
  c.json(manifest(), 200, { "Content-Type": "application/manifest+json; charset=utf-8" })
);

app.get("/robots.txt", async (c) => {
  const data = await robots();
  const rulesList = Array.isArray(data.rules) ? data.rules : [data.rules];
  const lines: string[] = [];
  for (const r of rulesList) {
    const agents = Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent || "*"];
    for (const ua of agents) {
      lines.push(`User-agent: ${ua}`);
    }
    if (r.allow) {
      const allows = Array.isArray(r.allow) ? r.allow : [r.allow];
      for (const a of allows) lines.push(`Allow: ${a}`);
    }
    if (r.disallow) {
      const disallows = Array.isArray(r.disallow) ? r.disallow : [r.disallow];
      for (const d of disallows) lines.push(`Disallow: ${d}`);
    }
    lines.push("");
  }
  if (data.sitemap) {
    const sitemaps = Array.isArray(data.sitemap) ? data.sitemap : [data.sitemap];
    for (const s of sitemaps) lines.push(`Sitemap: ${s}`);
  }
  return c.text(lines.join("\n") + "\n");
});

app.get("/sitemap.xml", async (c) => {
  const entries = await sitemap();
  const urlItems = entries.map((item) => {
    const lastmod = item.lastModified
      ? item.lastModified instanceof Date
        ? item.lastModified.toISOString()
        : new Date(item.lastModified).toISOString()
      : undefined;
    return [
      "<url>",
      `<loc>${escapeHtml(item.url)}</loc>`,
      lastmod ? `<lastmod>${lastmod}</lastmod>` : "",
      item.changeFrequency ? `<changefreq>${item.changeFrequency}</changefreq>` : "",
      item.priority !== undefined ? `<priority>${item.priority}</priority>` : "",
      "</url>",
    ]
      .filter(Boolean)
      .join("");
  });
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlItems.join("\n")}\n</urlset>`;
  return c.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

// Static Assets (Vite client bundle + all public/ assets including SVGs, icons, uploads)
app.use("/assets/*", serveStatic({ root: "./dist/client" }));
app.use("/uploads/*", serveStatic({ root: "./public" }));
app.get("/:file{.+\\.(ico|png|jpg|jpeg|gif|svg|webp|woff2)$}", serveStatic({ root: "./public" }));

// Template and SSR render import
let template = "";
let ssrRender: ((url: string, initialData?: Record<string, unknown>) => string) | null = null;

function loadTemplate() {
  if (!template) {
    const templatePath = path.resolve("./dist/client/index.html");
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, "utf-8");
    } else {
      template = `<!DOCTYPE html><html><head><!-- TITLE --><!-- SEO_META --></head><body><div id="root"><!-- SSR_CONTENT --></div><!-- SSR_DATA --><script type="module" src="/src/entry-client.tsx"></script></body></html>`;
    }
  }
  return template;
}

async function getSsrRender() {
  if (!ssrRender) {
    const serverEntryPath = path.resolve("./dist/server/entry-server.mjs");
    if (fs.existsSync(serverEntryPath)) {
      const mod = await import(serverEntryPath);
      ssrRender = mod.render;
    }
  }
  return ssrRender;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function handleSsr(
  c: Context,
  loadFn: () => Promise<PageLoadResult>,
  routePath: string,
  customHeaders?: Headers
) {
  const cookieMap = new Map<string, string>();
  const cookieHeader = c.req.header("cookie") || "";
  cookieHeader.split(";").forEach((pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k) cookieMap.set(k, decodeURIComponent(v.join("=")));
  });

  const effectiveHeaders = customHeaders || (() => {
    const h = new Headers(c.req.raw.headers);
    h.delete("x-custom-domain");
    h.delete("x-custom-domain-slug");
    return h;
  })();
  setServerContext(effectiveHeaders, cookieMap);

  const pageRes = await loadFn();
  if (pageRes.redirectUrl) {
    return c.redirect(pageRes.redirectUrl);
  }

  const { initialData, metadata } = pageRes;
  const renderFn = await getSsrRender();
  const appHtml = renderFn ? renderFn(routePath, initialData) : "";

  const seoTags = `
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description || "")}" />
    <meta property="og:title" content="${escapeHtml(metadata.ogTitle || metadata.title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.ogDescription || metadata.description || "")}" />
    ${metadata.ogImage ? `<meta property="og:image" content="${escapeHtml(metadata.ogImage)}" />` : ""}
    <meta property="og:url" content="${escapeHtml(metadata.canonical || routePath)}" />
    <meta name="twitter:card" content="${escapeHtml(metadata.twitterCard || "summary")}" />
    <meta name="twitter:title" content="${escapeHtml(metadata.ogTitle || metadata.title)}" />
    <meta name="twitter:description" content="${escapeHtml(metadata.ogDescription || metadata.description || "")}" />
    ${metadata.ogImage ? `<meta name="twitter:image" content="${escapeHtml(metadata.ogImage)}" />` : ""}
    ${metadata.canonical ? `<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />` : ""}
    ${metadata.jsonLd ? `<script type="application/ld+json">${JSON.stringify(metadata.jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
  `;

  const initialDataScript = `<script>window.__INITIAL_DATA__ = ${JSON.stringify(initialData).replace(/</g, "\\u003c")}; window.__INITIAL_ROUTE__ = ${JSON.stringify(routePath)};</script>`;

  const html = loadTemplate()
    .replace("<!-- TITLE -->", `<title>${escapeHtml(metadata.title)}</title>`)
    .replace("<!-- SEO_META -->", seoTags)
    .replace("<!-- SSR_CONTENT -->", appHtml)
    .replace("<!-- SSR_DATA -->", initialDataScript);

  return c.html(html);
}

// Page Routes (SSR)
app.get("/", (c) => handleSsr(c, loadHomePage, "/"));
app.get("/u/:slug", (c) => {
  const slug = c.req.param("slug");
  return handleSsr(c, () => loadUserHomePage(slug), `/u/${slug}`);
});
app.get("/u/:slug/pinned", (c) => {
  const slug = c.req.param("slug");
  return handleSsr(c, () => loadUserHomePage(slug), `/u/${slug}/pinned`);
});
app.get("/mo/:id", (c) => {
  const id = c.req.param("id");
  return handleSsr(c, () => loadMomentPage(id), `/mo/${id}`);
});
app.get("/friends", (c) => handleSsr(c, loadFriendsPage, "/friends"));
app.get("/pinned", (c) => handleSsr(c, loadPinnedPage, "/pinned"));
app.get("/tag/:tag", (c) => {
  const tag = c.req.param("tag");
  return handleSsr(c, () => loadTagPage(tag), `/tag/${tag}`);
});
app.get("/settings", (c) => handleSsr(c, loadSettingsPage, "/settings"));
app.get("/admin", (c) => handleSsr(c, loadAdminPage, "/admin"));
app.get("/init", (c) =>
  handleSsr(
    c,
    async () => ({ initialData: {}, metadata: { title: "系统初始化 - Jotify Moment" } }),
    "/init"
  )
);
app.get("/reset-password", (c) =>
  handleSsr(
    c,
    async () => ({ initialData: {}, metadata: { title: "重置密码 - Jotify Moment" } }),
    "/reset-password"
  )
);
app.get("/guest-profile", (c) =>
  handleSsr(
    c,
    async () => ({ initialData: {}, metadata: { title: "访客资料 - Jotify Moment" } }),
    "/guest-profile"
  )
);

// Fallback SPA route handler
app.get("*", (c) =>
  handleSsr(
    c,
    async () => ({ initialData: {}, metadata: { title: "Jotify Moment" } }),
    c.req.path
  )
);

const PORT = parseInt(process.env.PORT || process.env.APP_PORT || "3000", 10);

console.log(`🚀 Jotify Moment Hono Server listening on http://0.0.0.0:${PORT}`);

serve({
  fetch: app.fetch,
  port: PORT,
});
