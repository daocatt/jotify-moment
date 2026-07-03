CREATE TABLE "user_pinned" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_pinned" ADD CONSTRAINT "user_pinned_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pinned" ADD CONSTRAINT "user_pinned_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_pinned_user_id_idx" ON "user_pinned" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_pinned_user_post_idx" ON "user_pinned" USING btree ("user_id","post_id");