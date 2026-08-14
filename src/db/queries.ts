import { db } from "@/db";
import { posts, comments } from "@/db/schema";
import { eq, and, or, desc, lt, isNull } from "drizzle-orm";

const PAGE_SIZE = 15;

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
      reactions: {
        with: {
          author: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const hasMore = allPosts.length > PAGE_SIZE;
  const items = hasMore ? allPosts.slice(0, PAGE_SIZE) : allPosts;
  const nextCursor = hasMore && items.length > 0
    ? makeCursor(items[items.length - 1])
    : null;

  const mapped = items.map((post) => ({
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
    reactions: post.reactions.map((r) => ({
      ...r,
      userId: r.author,
    })),
  }));

  return { posts: mapped, nextCursor, hasMore };
}
