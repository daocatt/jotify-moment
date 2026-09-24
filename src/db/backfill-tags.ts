import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { posts, postTags, settings } from "./schema";
import { extractTags } from "../lib/tag-extractor";

// Fills post_tags for posts that predate the tag index. Runs once at container
// start (see Dockerfile), gated on a settings flag so later boots are a single
// primary-key lookup.
//
// Recovery hatch: `npm run db:reindex-tags` re-runs this with --force, which
// ignores the flag. Needed if the app was ever rolled back to a version that
// did not maintain the index, since those posts would otherwise stay unindexed.
const BACKFILL_FLAG = "post_tags_backfill_done";
const BATCH_SIZE = 500;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const connectionString = process.env.DATABASE_URL;

type Db = ReturnType<typeof drizzle>;

// Annotated so the keyset loop below does not become self-referential
// (batch -> last -> lastCreatedAt -> cursor -> batch).
type PostRow = { id: string; content: string; createdAt: Date };

async function backfill(db: Db): Promise<number> {
  let lastCreatedAt: Date | null = null;
  let lastId = "";
  let processed = 0;

  for (;;) {
    // Keyset pagination: stable while rows are being written.
    const cursor = lastCreatedAt
      ? or(
          gt(posts.createdAt, lastCreatedAt),
          and(eq(posts.createdAt, lastCreatedAt), gt(posts.id, lastId)),
        )
      : undefined;

    const batch: PostRow[] = await db
      .select({ id: posts.id, content: posts.content, createdAt: posts.createdAt })
      .from(posts)
      .where(cursor)
      .orderBy(asc(posts.createdAt), asc(posts.id))
      .limit(BATCH_SIZE);

    if (batch.length === 0) break;

    await db.transaction(async (tx) => {
      for (const post of batch) {
        const tags = extractTags(post.content);
        await tx.delete(postTags).where(eq(postTags.postId, post.id));
        if (tags.length > 0) {
          await tx
            .insert(postTags)
            .values(tags.map((tag) => ({ postId: post.id, tag })))
            .onConflictDoNothing();
        }
      }
    });

    processed += batch.length;
    const last = batch[batch.length - 1];
    lastCreatedAt = last.createdAt;
    lastId = last.id;

    if (batch.length < BATCH_SIZE) break;
  }

  return processed;
}

async function run() {
  const force = process.argv.includes("--force");
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    if (!force) {
      const [flag] = await db
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, BACKFILL_FLAG));

      if (flag?.value === "true") {
        console.log(`[backfill-tags] ${BACKFILL_FLAG} already set, skipping.`);
        return;
      }
    }

    console.log("[backfill-tags] indexing existing posts...");
    const processed = await backfill(db);

    await db
      .insert(settings)
      .values({ key: BACKFILL_FLAG, value: "true" })
      .onConflictDoUpdate({ target: settings.key, set: { value: "true" } });

    console.log(`[backfill-tags] done: indexed ${processed} posts.`);
  } catch (err) {
    // Deliberately non-fatal: a failed backfill must not stop the server from
    // booting. The flag is left unset, so the next start retries.
    console.error("[backfill-tags] failed (will retry on next start):", err);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("[backfill-tags] unexpected error:", err);
  process.exit(0);
});
