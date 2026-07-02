ALTER TABLE "users" ADD COLUMN "custom_domain" text;
ALTER TABLE "users" ADD COLUMN "allow_custom_domain" boolean DEFAULT false NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_custom_domain_unique_idx" ON "users" ("custom_domain");
