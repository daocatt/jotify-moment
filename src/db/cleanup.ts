import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sessions, verificationCodes, verifications } from "./schema";
import { lt } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const connectionString = process.env.DATABASE_URL;

async function run() {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  const now = new Date();

  const [expiredSessions, expiredCodes, expiredVerifications] = await Promise.all([
    db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
    db.delete(verificationCodes).where(lt(verificationCodes.expiresAt, now)).returning({ id: verificationCodes.id }),
    db.delete(verifications).where(lt(verifications.expiresAt, now)).returning({ id: verifications.id }),
  ]);

  console.log(
    `Cleanup complete: removed ${expiredSessions.length} expired sessions, ` +
    `${expiredCodes.length} expired verification codes, ${expiredVerifications.length} expired verifications.`,
  );

  await client.end();
}

run().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
