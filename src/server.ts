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
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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

// Check admin initialization & Custom Domain Middleware
app.use("*", async (c, next) => {
  const pathname = c.req.path;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/uploads") ||
    pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|webp|webmanifest|txt|xml)$/)
  ) {
    return next();
  }

  const hasAdmin = await checkHasAdmin();
  if (!hasAdmin && pathname !== "/init") {
    return c.redirect("/init");
  }

  const host = c.req.header("host") || "";
  const hostname = host.split(":")[0].toLowerCase();
  const mainHosts = getMainHosts();
  const isMainHost = mainHosts.length === 0 || mainHosts.includes(hostname);

  if (!isMainHost) {
    const slug = await resolveCustomDomain(hostname);
    if (!slug) {
      return c.text("Domain not found or pending approval", 404);
    }
    c.req.raw.headers.set("x-custom-domain", "true");
    c.req.raw.headers.set("x-custom-domain-slug", slug);

    // Custom domain rewrite: "/" serves user's profile
    if (pathname === "/") {
      return handleSsr(c, () => loadUserHomePage(slug, c.req.raw.headers), `/u/${slug}`);
    }
  }

  return next();
});

// Better Auth Endpoint
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

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

// RESTful API routes
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

// Static Assets
app.use("/assets/*", serveStatic({ root: "./dist/client" }));
app.use("/uploads/*", serveStatic({ root: "./public" }));
app.use("/favicon.ico", serveStatic({ root: "./public", path: "favicon.ico" }));
app.use("/apple-touch-icon.png", serveStatic({ root: "./public", path: "apple-touch-icon.png" }));
app.use("/manifest.webmanifest", serveStatic({ root: "./public", path: "manifest.webmanifest" }));
app.use("/default-cover.jpg", serveStatic({ root: "./public", path: "default-cover.jpg" }));
app.use("/default-og.png", serveStatic({ root: "./public", path: "default-og.png" }));

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

async function handleSsr(c: Context, loadFn: () => Promise<PageLoadResult>, routePath: string) {
  const cookieMap = new Map<string, string>();
  const cookieHeader = c.req.header("cookie") || "";
  cookieHeader.split(";").forEach((pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k) cookieMap.set(k, decodeURIComponent(v.join("=")));
  });
  setServerContext(c.req.raw.headers, cookieMap);

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
  return handleSsr(c, () => loadUserHomePage(slug, c.req.raw.headers), `/u/${slug}`);
});
app.get("/u/:slug/pinned", (c) => {
  const slug = c.req.param("slug");
  return handleSsr(c, () => loadUserHomePage(slug, c.req.raw.headers), `/u/${slug}/pinned`);
});
app.get("/mo/:id", (c) => {
  const id = c.req.param("id");
  return handleSsr(c, () => loadMomentPage(id, c.req.raw.headers), `/mo/${id}`);
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
