ALTER TABLE "users" ADD COLUMN "publish_to_feed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_permission" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_homepage" boolean DEFAULT true NOT NULL;