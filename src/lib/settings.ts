import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const CACHE_TTL = 60_000;
const cache = new Map<string, { value: string | null; expires: number }>();

/**
 * Read a settings row with a short in-memory TTL.
 * Call invalidateSetting() after writing a setting so the new value is picked up promptly.
 */
export async function getSetting(key: string): Promise<string | null> {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) return cached.value;

  const row = await db.query.settings.findFirst({
    where: eq(settings.key, key),
    columns: { value: true },
  });
  const value = row?.value ?? null;
  cache.set(key, { value, expires: Date.now() + CACHE_TTL });
  return value;
}

export function invalidateSetting(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export interface SiteFcProfile {
  cover: string;
  logo: string;
  title: string;
  desc: string;
}

/**
 * The site-wide friends-circle profile — a single, global identity stored in the
 * settings table. Strictly separate from any user's personal profile.
 */
export async function getSiteFcProfile(): Promise<SiteFcProfile> {
  const [cover, logo, title, desc] = await Promise.all([
    getSetting("site_fc_cover"),
    getSetting("site_fc_logo"),
    getSetting("site_fc_title"),
    getSetting("site_fc_desc"),
  ]);
  return { cover: cover || "", logo: logo || "", title: title || "", desc: desc || "" };
}
