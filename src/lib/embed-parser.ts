/**
 * Parses a pasted URL and returns { embedType, embedId } if recognized.
 * All parsing is done locally (regex) — no external requests.
 */

export type EmbedType =
  | "youtube"
  | "bilibili"
  | "tiktok"
  | "spotify"
  | "spotify-podcast"
  | "netease"
  | "apple-music"
  | "apple-podcast";

export interface EmbedInfo {
  embedType: EmbedType;
  embedId: string;
}

export function parseEmbedUrl(url: string): EmbedInfo | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");

    // ── YouTube ──────────────────────────────────────────────
    // https://youtu.be/dQw4w9WgXcQ
    // https://youtube.com/watch?v=dQw4w9WgXcQ
    // https://youtube.com/shorts/dQw4w9WgXcQ
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return { embedType: "youtube", embedId: id };
    }
    if (host === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return { embedType: "youtube", embedId: v };
      const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)/);
      if (shorts) return { embedType: "youtube", embedId: shorts[1] };
    }

    // ── Bilibili ─────────────────────────────────────────────
    // https://www.bilibili.com/video/BV1xx411c7mD
    // https://b23.tv/XXXXXX  (short link — we keep the short id, server resolves)
    if (host === "bilibili.com") {
      const bv = u.pathname.match(/\/video\/(BV[A-Za-z0-9]+)/i);
      if (bv) return { embedType: "bilibili", embedId: bv[1] };
      const av = u.pathname.match(/\/video\/(av\d+)/i);
      if (av) return { embedType: "bilibili", embedId: av[1] };
    }
    if (host === "b23.tv") {
      const short = u.pathname.slice(1);
      if (short) return { embedType: "bilibili", embedId: short };
    }

    // ── TikTok ───────────────────────────────────────────────
    // https://www.tiktok.com/@user/video/7123456789
    // https://vm.tiktok.com/XXXXXXX/
    if (host === "tiktok.com") {
      const vid = u.pathname.match(/\/video\/(\d+)/);
      if (vid) return { embedType: "tiktok", embedId: vid[1] };
    }
    if (host === "vm.tiktok.com") {
      const short = u.pathname.slice(1).replace(/\/$/, "");
      if (short) return { embedType: "tiktok", embedId: short };
    }

    // ── Spotify ──────────────────────────────────────────────
    // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
    // https://open.spotify.com/episode/4iV5W9uYEdYUVa79Axb7Rh  ← podcast episode
    // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
    // https://open.spotify.com/album/6rqhFgbbKwnb9MLmUQDhG6
    if (host === "open.spotify.com") {
      const match = u.pathname.match(/^\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/);
      if (match) {
        const [, type, id] = match;
        if (type === "episode" || type === "show") {
          return { embedType: "spotify-podcast", embedId: `${type}/${id}` };
        }
        return { embedType: "spotify", embedId: `${type}/${id}` };
      }
    }

    // ── 网易云音乐 ────────────────────────────────────────────
    // https://music.163.com/song?id=123456
    // https://music.163.com/#/song?id=123456
    // https://music.163.com/song/123456/
    if (host === "music.163.com") {
      // Handle hash-based URLs
      const fullPath = u.pathname + u.search + u.hash;
      const songId =
        u.searchParams.get("id") ||
        u.hash.match(/[?&]id=(\d+)/)?.[1] ||
        u.pathname.match(/\/song\/(\d+)/)?.[1];
      if (songId) return { embedType: "netease", embedId: songId };
      // playlist / album
      const playlist = fullPath.match(/playlist\?id=(\d+)/);
      if (playlist) return { embedType: "netease", embedId: `playlist/${playlist[1]}` };
    }

    // ── Apple Music ──────────────────────────────────────────
    // https://music.apple.com/cn/album/xxxx/123456789
    // https://music.apple.com/cn/song/xxxx/123456789
    if (host === "music.apple.com") {
      const match = u.pathname.match(/^\/([a-z]{2})\/(album|song|playlist)\/[^/]+\/([^/?]+)/);
      if (match) {
        const [, region, type, id] = match;
        return { embedType: "apple-music", embedId: `${region}/${type}/${id}` };
      }
    }

    // ── Apple Podcasts ───────────────────────────────────────
    // https://podcasts.apple.com/cn/podcast/some-show/id123456789
    if (host === "podcasts.apple.com") {
      const match = u.pathname.match(/^\/([a-z]{2})\/podcast\/[^/]+\/(id\d+)/);
      if (match) {
        const [, region, id] = match;
        return { embedType: "apple-podcast", embedId: `${region}/${id}` };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the iframe src for a given embed.
 * Used at render time — no external fetches.
 */
export function getEmbedIframeSrc(embedType: EmbedType, embedId: string): string {
  switch (embedType) {
    case "youtube":
      return `https://www.youtube.com/embed/${embedId}?autoplay=1`;
    case "bilibili":
      if (embedId.startsWith("BV") || embedId.startsWith("bv")) {
        return `https://player.bilibili.com/player.html?bvid=${embedId}&high_quality=1&autoplay=0`;
      }
      if (embedId.toLowerCase().startsWith("av")) {
        return `https://player.bilibili.com/player.html?aid=${embedId.slice(2)}&high_quality=1&autoplay=0`;
      }
      // short link — already resolved to BV by server
      return `https://player.bilibili.com/player.html?bvid=${embedId}&high_quality=1&autoplay=0`;
    case "tiktok":
      return `https://www.tiktok.com/embed/v2/${embedId}`;
    case "spotify":
      return `https://open.spotify.com/embed/${embedId}`;
    case "spotify-podcast":
      return `https://open.spotify.com/embed/${embedId}`;
    case "netease": {
      const isPlaylist = embedId.startsWith("playlist/");
      if (isPlaylist) {
        return `https://music.163.com/outchain/player?type=1&id=${embedId.slice(9)}&auto=0&height=90`;
      }
      return `https://music.163.com/outchain/player?type=2&id=${embedId}&auto=0&height=66`;
    }
    case "apple-music": {
      // embedId format: "{region}/{type}/{id}"
      const parts = embedId.split("/");
      const [region, type, id] = parts;
      return `https://embed.music.apple.com/${region}/${type}/${id}`;
    }
    case "apple-podcast": {
      // embedId format: "{region}/{podcastId}"
      const [region, podcastId] = embedId.split("/");
      return `https://embed.podcasts.apple.com/${region}/podcast/${podcastId}`;
    }
  }
}

/**
 * Returns the aspect ratio / height style for each embed type.
 */
export function getEmbedDimensions(embedType: EmbedType): { aspectRatio?: string; height?: string } {
  switch (embedType) {
    case "youtube":
    case "bilibili":
    case "tiktok":
      return { aspectRatio: "16/9" };
    case "spotify":
      return { height: "80px" }; // compact player
    case "spotify-podcast":
      return { height: "152px" };
    case "netease":
      return { height: "86px" };
    case "apple-music":
      return { height: "175px" };
    case "apple-podcast":
      return { height: "175px" };
  }
}

/**
 * Validates that an embedId matches the expected format for its embedType.
 * Prevents malformed or injected IDs from being used in server-side fetches.
 */
export function isValidEmbedId(embedType: EmbedType, embedId: string): boolean {
  if (!embedId || embedId.length > 256) return false;

  switch (embedType) {
    case "youtube":
      return /^[A-Za-z0-9_-]{11}$/.test(embedId);
    case "bilibili":
      // BVxxxxxxxxxx, avNNNNN, or b23.tv short code (alphanumeric, 4-12 chars)
      return /^(BV[A-Za-z0-9]{6,12}|av\d{1,12}|[A-Za-z0-9]{4,12})$/.test(embedId);
    case "tiktok":
      // Numeric video ID or short alphanumeric code
      return /^(\d{1,20}|[A-Za-z0-9]{4,15})$/.test(embedId);
    case "spotify":
      // track/xxxxx, album/xxxxx, playlist/xxxxx
      return /^(track|album|playlist)\/[A-Za-z0-9]{10,30}$/.test(embedId);
    case "spotify-podcast":
      // episode/xxxxx or show/xxxxx
      return /^(episode|show)\/[A-Za-z0-9]{10,30}$/.test(embedId);
    case "netease":
      // Numeric ID or playlist/NNNNN
      return /^(playlist\/)?\d{1,15}$/.test(embedId);
    case "apple-music":
      // {region}/{type}/{id} — region=2-letter, type=album|song|playlist, id=alphanumeric
      return /^[a-z]{2}\/(album|song|playlist)\/[A-Za-z0-9._-]{1,50}$/.test(embedId);
    case "apple-podcast":
      // {region}/idNNNNN
      return /^[a-z]{2}\/id\d{1,20}$/.test(embedId);
    default:
      return false;
  }
}
