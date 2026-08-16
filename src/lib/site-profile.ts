/** Display name when the site profile is not yet filled in. */
export const SITE_PROFILE_PLACEHOLDER = "请完善信息->";

/** Header profile shape used by the home/friends pages (site profile, no user id). */
export interface HomeHeaderProfile {
  id?: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  coverImage: string | null;
}
