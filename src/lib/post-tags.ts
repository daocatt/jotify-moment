import { eq } from "drizzle-orm";
import { db } from "@/db";
import { postTags } from "@/db/schema";
import { extractTags } from "@/lib/tag-extractor";

/**
 * Either the pooled client or the transaction handle passed to db.transaction().
 * `tx` is not assignable to `typeof db` (the client carries `$client`, a
 * transaction does not), hence the union.
 */
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Replace the tag index rows for a post so they match its current content.
 *
 * Call this in the same transaction as the post write, otherwise a failed tag
 * insert leaves posts.content and post_tags disagreeing. Deletion needs no
 * call: post_tags.post_id is ON DELETE CASCADE.
 */
export async function syncPostTags(
  executor: DbExecutor,
  postId: string,
  content: string,
): Promise<void> {
  const tags = extractTags(content);

  await executor.delete(postTags).where(eq(postTags.postId, postId));

  if (tags.length > 0) {
    await executor
      .insert(postTags)
      .values(tags.map((tag) => ({ postId, tag })))
      .onConflictDoNothing();
  }
}
