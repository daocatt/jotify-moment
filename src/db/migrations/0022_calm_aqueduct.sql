CREATE INDEX "comments_post_status_idx" ON "comments" USING btree ("post_id","status");--> statement-breakpoint
CREATE INDEX "posts_user_status_created_idx" ON "posts" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "users_publish_display_idx" ON "users" USING btree ("publish_to_feed","display_permission");--> statement-breakpoint
CREATE INDEX "users_friends_idx" ON "users" USING btree ("display_permission","last_post_at");--> statement-breakpoint
CREATE INDEX "verification_codes_expires_at_idx" ON "verification_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verifications_expires_at_idx" ON "verifications" USING btree ("expires_at");