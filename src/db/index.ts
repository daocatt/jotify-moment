import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/jotify_moment";

// For queries/mutations
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
export type DbType = typeof db;
export type SchemaType = typeof schema;
