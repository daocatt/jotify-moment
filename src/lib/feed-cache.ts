import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPostsQuery } from "@/db/queries";
import { ensureUserSlug } from "@/lib/auth";

// Nonce-based CSP forces dynamic rendering (ISR is disabled), so we cache the
// expensive public feed/profile reads in memory with a short TTL instead.
// Call invalidateFeedCache() from mutating actions to pick up changes promptly.
const FEED_TTL = 15_000;
const PROFILE_TTL = 60_000;

type FeedData = Awaited<ReturnType<typeof getPostsQuery>>;

let feed: { data: FeedData; expires: number } | null = null;

export async function getCachedPublicFeed(): Promise<FeedData> {
  if (feed && Date.now() < feed.expires) return feed.data;
  const data = await getPostsQuery(false);
  feed = { data, expires: Date.now() + FEED_TTL };
  return data;
}

export interface CachedSuperAdminProfile {
  id: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
  role: string;
  wechat: string | null;
  telegram: string | null;
  github: string | null;
  x: string | null;
  otherLink: string | null;
  theme: string | null;
  customDomain: string | null;
  allowCustomDomain: boolean;
}

let profile: { data: CachedSuperAdminProfile | null; expires: number } | null = null;

export async function getCachedSuperAdminProfile(): Promise<CachedSuperAdminProfile | null> {
  if (profile && Date.now() < profile.expires) return profile.data;

  const admin = await db.query.users.findFirst({
    where: eq(users.role, "super_admin"),
    columns: {
      id: true,
      name: true,
      slug: true,
      avatar: true,
      bio: true,
      coverImage: true,
      role: true,
      wechat: true,
      telegram: true,
      github: true,
      x: true,
      otherLink: true,
      theme: true,
      customDomain: true,
      allowCustomDomain: true,
    },
  });

  if (!admin) {
    profile = { data: null, expires: Date.now() + PROFILE_TTL };
    return null;
  }

  let slug = admin.slug;
  if (!slug) slug = await ensureUserSlug(admin.id, admin.name);

  const data: CachedSuperAdminProfile = { ...admin, slug };
  profile = { data, expires: Date.now() + PROFILE_TTL };
  return data;
}

export function invalidateFeedCache(): void {
  feed = null;
  profile = null;
}
