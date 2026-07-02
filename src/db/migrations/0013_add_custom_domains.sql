DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='custom_domain') THEN ALTER TABLE "users" ADD COLUMN "custom_domain" text; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='allow_custom_domain') THEN ALTER TABLE "users" ADD COLUMN "allow_custom_domain" boolean DEFAULT false NOT NULL; END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "users_custom_domain_unique_idx" ON "users" ("custom_domain");
