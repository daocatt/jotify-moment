/**
 * Fetches a URL and extracts Open Graph / fallback meta for link preview cards.
 * Returns null if the fetch fails or no meaningful metadata is found.
 */
export async function fetchLinkOgMeta(
  url: string,
  signal?: AbortSignal,
): Promise<{ title?: string; description?: string; thumbnailUrl?: string } | null> {
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        // Identify as a bot to get OG-friendly responses from most sites
        "User-Agent": "Mozilla/5.0 (compatible; MomentBot/1.0; +https://jotify.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    // Read only the first 64 KB — the <head> is always near the top.
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const LIMIT = 65536;
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.byteLength;
      if (totalBytes >= LIMIT) break;
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
