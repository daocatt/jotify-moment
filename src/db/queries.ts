import { db } from "@/db";
import { posts, comments, reactions } from "@/db/schema";
import { eq, and, or, desc, lt, isNull, sql, inArray } from "drizzle-orm";

const PAGE_SIZE = 15;

export interface ReactionSummary {
  total: number;
  byEmoji: Record<string, number>;
  top: Array<{ id: string; emoji: string; createdAt: Date; userId: { id: string; name: string } }>;
}

/**
 * Aggregated reaction data for a batch of posts: total count, per-emoji counts,
 * and the 3 most recent reactions (with author) for the compact display.
 * Avoids loading every reaction row (and its author) for every post.
 */
export async function loadReactions(postIds: string[]): Promise<Map<string, ReactionSummary>> {
  const result = new Map<string, ReactionSummary>();
  if (postIds.length === 0) return result;

  const [countRows, topRows] = await Promise.all([
    db
      .select({
        postId: reactions.postId,
        emoji: reactions.emoji,
        count: sql<number>`count(*)::int`,
      })
      .from(reactions)
      .where(inArray(reactions.postId, postIds))
      .groupBy(reactions.postId, reactions.emoji),
    db.execute(sql`
      SELECT r.post_id, r.id, r.emoji, r.created_at, u.id AS user_id, u.name AS user_name
      FROM (
        SELECT r2.*, row_number() OVER (
          PARTITION BY r2.post_id ORDER BY r2.created_at DESC, r2.id DESC
        ) AS rn
        FROM reactions r2
        WHERE r2.post_id IN ${postIds}
      ) r
      JOIN users u ON u.id = r.user_id
      WHERE r.rn <= 3
    `),
  ]);

  for (const row of countRows) {
    const s = result.get(row.postId) ?? { total: 0, byEmoji: {}, top: [] };
    s.total += row.count;
    s.byEmoji[row.emoji] = (s.byEmoji[row.emoji] ?? 0) + row.count;
    result.set(row.postId, s);
  }

  const rawTop = topRows as unknown as Array<{
    post_id: string;
    id: string;
    emoji: string;
    created_at: Date;
    user_id: string;
    user_name: string;
  }>;
  for (const row of rawTop) {
    const s = result.get(row.post_id) ?? { total: 0, byEmoji: {}, top: [] };
    if (s.top.length < 3) {
      s.top.push({
        id: row.id,
        emoji: row.emoji,
        createdAt: row.created_at,
        userId: { id: row.user_id, name: row.user_name },
      });
    }
    result.set(row.post_id, s);
  }

  return result;
}

/** Cursor format: `${createdAtMs}_${postId}` — a stable (time, id) tiebreaker. */
export function parseCursor(cursor: string): { createdAt: Date; id: string } | null {
  const idx = cursor.lastIndexOf("_");
  if (idx <= 0) return null;
  const ms = Number(cursor.slice(0, idx));
  const id = cursor.slice(idx + 1);
  if (!Number.isFinite(ms) || !id) return null;
  return { createdAt: new Date(ms), id };
}

export function makeCursor(post: { createdAt: Date; id: string }): string {
  return `${post.createdAt.getTime()}_${post.id}`;
}

function afterCursor(cond: { createdAt: Date; id: string }) {
  return or(
    lt(posts.createdAt, cond.createdAt),
    and(eq(posts.createdAt, cond.createdAt), lt(posts.id, cond.id)),
  );
}

export async function getPostsQuery(isAdmin: boolean, cursor?: string) {
  const cursorCond = cursor ? parseCursor(cursor) : null;
  const allPosts = await db.query.posts.findMany({
    where: isAdmin
      ? (cursorCond
          ? and(isNull(posts.pinnedAt), afterCursor(cursorCond))
          : isNull(posts.pinnedAt))
      : (cursorCond
          ? and(eq(posts.status, "approved"), isNull(posts.pinnedAt), afterCursor(cursorCond))
          : and(eq(posts.status, "approved"), isNull(posts.pinnedAt))),
    orderBy: [desc(posts.createdAt), desc(posts.id)],
    limit: PAGE_SIZE + 1,
    with: {
      author: {
        columns: {
          id: true,
          name: true,
          avatar: true,
          role: true,
          slug: true,
        },
      },
      comments: {
        columns: {
          id: true,
          status: true,
        },
        where: isAdmin ? undefined : eq(comments.status, "active"),
      },
    },
  });

  const hasMore = allPosts.length > PAGE_SIZE;
  const items = hasMore ? allPosts.slice(0, PAGE_SIZE) : allPosts;
  const nextCursor = hasMore && items.length > 0
    ? makeCursor(items[items.length - 1])
    : null;

  const reactionsMap = await loadReactions(items.map((p) => p.id));

  const mapped = items.map((post) => {
    const summary = reactionsMap.get(post.id);
    return {
      ...post,
      user: post.author,
      // NOTE: Comments are lazy-loaded. These stubs provide the count for
      // "N 条评论" display only — content and userId are intentionally empty.
      // Real data is fetched via getPostCommentsAction when user expands comments.
      comments: post.comments.map((c) => ({
        id: c.id,
        content: "",
        createdAt: post.createdAt,
        status: c.status,
        userId: { id: "", name: "", avatar: null },
      })),
      reactions: (summary?.top ?? []).map((r) => ({ id: r.id, emoji: r.emoji, userId: r.userId })),
      reactionSummary: summary ? { total: summary.total, byEmoji: summary.byEmoji } : undefined,
    };
  });

  return { posts: mapped, nextCursor, hasMore };
}
