/**
 * Fetches a URL and extracts Open Graph / fallback meta for link preview cards.
 * Returns null if the fetch fails or no meaningful metadata is found.
 *
 * SECURITY: The URL may be user-controlled. We validate every hop (including
 * redirects) against SSRF targets — private/loopback/link-local/metadata
 * addresses and non-http(s) protocols — before fetching.
 */
import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 65536;

function isBlockedIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4) to plain IPv4.
  if (ip.toLowerCase().startsWith("::ffff:")) ip = ip.slice(7);
  const version = net.isIP(ip);
  if (version === 0) return false;

  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a >= 224) return true; // 224.0.0.0/4 multicast + reserved
    return false;
  }

  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower === "::") return true; // unspecified
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10 link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("2001:db8")) return true; // documentation range
  return false;
}

async function isSafeUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // Block embedded credentials (userinfo) to prevent DNS rebinding / auth smuggling.
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  // Cloud provider metadata hostnames.
  if (host === "metadata.google.internal" || host.endsWith(".metadata.google.internal")) return false;

  // Hostname is already an IP literal.
  if (net.isIP(host)) return !isBlockedIp(host);

  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (addresses.length === 0) return false;
    for (const { address } of addresses) {
      if (isBlockedIp(address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Follows redirects manually so each hop is SSRF-validated, bounded to
 * MAX_REDIRECTS. Returns the final (non-redirect) response, or null.
 */
async function safeFetch(
  url: string,
  signal?: AbortSignal,
): Promise<Response | null> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!(await isSafeUrl(current))) return null;
    let res: Response;
    try {
      res = await fetch(current, { signal, redirect: "manual" });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      res.body?.cancel().catch(() => {});
      if (!loc) return null;
      try {
        current = new URL(loc, current).href;
      } catch {
        return null;
      }
      continue;
    }
    return res;
  }
  return null;
}

export async function fetchLinkOgMeta(
  url: string,
  signal?: AbortSignal,
): Promise<{ title?: string; description?: string; thumbnailUrl?: string } | null> {
  try {
    const res = await safeFetch(url, signal);
    if (!res || !res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    // Read only the first 64 KB — the <head> is always near the top.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.byteLength;
      if (totalBytes >= MAX_BODY_BYTES) break;
    }
    reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");

    const getMeta = (property: string): string | undefined => {
      // og:xxx via property=
      const ogMatch =
        html.match(
          new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
        ) ||
        html.match(
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
        );
      if (ogMatch?.[1]) return ogMatch[1].trim();
      // name= variant
      const nameMatch =
        html.match(
          new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
        ) ||
        html.match(
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
        );
      return nameMatch?.[1]?.trim();
    };

    const title =
      getMeta("og:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    const description =
      getMeta("og:description") ||
      getMeta("description");

    let thumbnailUrl =
      getMeta("og:image") ||
      getMeta("twitter:image");

    // Resolve relative image URLs to absolute
    if (thumbnailUrl && !thumbnailUrl.startsWith("http")) {
      try {
        thumbnailUrl = new URL(thumbnailUrl, url).href;
      } catch {
        thumbnailUrl = undefined;
      }
    }

    if (!title && !thumbnailUrl) return null;

    return {
      title: title ? title.slice(0, 200) : undefined,
      description: description ? description.slice(0, 400) : undefined,
      thumbnailUrl,
    };
  } catch {
    return null;
  }
}
