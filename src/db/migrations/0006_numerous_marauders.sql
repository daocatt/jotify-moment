ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_post_id_posts_id_fk";
ALTER TABLE "reactions" DROP CONSTRAINT IF EXISTS "reactions_post_id_posts_id_fk";

ALTER TABLE "posts" ALTER COLUMN "id" SET DATA TYPE text;
ALTER TABLE "posts" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "comments" ALTER COLUMN "post_id" SET DATA TYPE text;
ALTER TABLE "reactions" ALTER COLUMN "post_id" SET DATA TYPE text;

ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade;
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade;