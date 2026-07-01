ALTER TABLE "users" ADD COLUMN "login_disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_codes" ADD COLUMN "sent_count" text DEFAULT '1';