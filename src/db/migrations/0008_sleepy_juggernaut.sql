DROP INDEX "posts_status_idx";--> statement-breakpoint
CREATE INDEX "accounts_user_provider_idx" ON "accounts" USING btree ("user_id","provider_id");--> statement-breakpoint
CREATE INDEX "posts_status_created_at_idx" ON "posts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "posts_pinned_at_idx" ON "posts" USING btree ("pinned_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_telegram_chat_id_idx" ON "users" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "users_telegram_bind_token_idx" ON "users" USING btree ("telegram_bind_token");