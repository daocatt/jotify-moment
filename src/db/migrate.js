const { drizzle } = require("drizzle-orm/postgres-js");
const { migrate } = require("drizzle-orm/postgres-js/migrator");
const postgres = require("postgres");

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/jotify_moment";

async function run() {
  console.log("Running migrations...");
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  await migrationClient.end();
  console.log("Migrations complete!");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
