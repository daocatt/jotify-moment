ALTER TABLE "posts" ADD COLUMN "pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_slug_unique" UNIQUE("slug");