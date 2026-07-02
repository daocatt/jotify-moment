DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='theme') THEN ALTER TABLE "users" ADD COLUMN "theme" text; END IF; END $$;
