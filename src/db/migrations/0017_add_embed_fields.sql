ALTER TABLE "posts" ADD COLUMN "embed_type" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "embed_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "embed_meta" jsonb;