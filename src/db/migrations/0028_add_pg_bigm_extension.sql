-- pg_bigm backs the keyword search in src/app/actions/posts.ts (searchPostsAction).
--
-- The extension must be present on the server before this runs:
--   local:  ./scripts/install-pg-bigm.sh
--   docker: docker compose build db
--
-- Failing loudly is deliberate. The whole point of this migration is to stop
-- posts.content being scanned sequentially, and a silent skip would leave the
-- query quietly degraded. Wrapped in a DO block only to attach the fix hint.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_bigm;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'pg_bigm is not available on this PostgreSQL server. Run ./scripts/install-pg-bigm.sh locally, or "docker compose build db" for Docker. Cause: %', SQLERRM;
END
$$;
--> statement-breakpoint
-- pg_bigm's operator class exposes ~~ (LIKE) but not ~~* (ILIKE), so the query
-- cannot use ILIKE. Index the lowercased column instead and compare against a
-- lowercased pattern, which keeps the search case-insensitive.
CREATE INDEX IF NOT EXISTS "posts_content_lower_bigm_idx"
  ON "posts" USING gin (lower("content") gin_bigm_ops);
