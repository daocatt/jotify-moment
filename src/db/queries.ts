import { db } from "@/db";
import { posts, comments } from "@/db/schema";
import { eq, and, desc, lt, isNull } from "drizzle-orm";

const PAGE_SIZE = 15;

export async function getPostsQuery(isAdmin: boolean, cursor?: string) {
  const allPosts = await db.query.posts.findMany({
    where: isAdmin
      ? (cursor
          ? and(isNull(posts.pinnedAt), lt(posts.createdAt, new Date(cursor)))
          : isNull(posts.pinnedAt))
      : (cursor
          ? and(eq(posts.status, "approved"), isNull(posts.pinnedAt), lt(posts.createdAt, new Date(cursor)))
          : and(eq(posts.status, "approved"), isNull(posts.pinnedAt))),
    orderBy: [desc(posts.createdAt)],
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
    ? items[items.length - 1].createdAt.toISOString()
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
