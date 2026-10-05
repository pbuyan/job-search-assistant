// src/db/index.ts — Drizzle client (Postgres + pgvector).
//
// Runs inside the Next.js server runtime, which loads .env.local itself, so
// no dotenv here (unlike migrate.ts / drizzle.config.ts, which run via tsx
// outside Next and load it explicitly).
//
// Data access only happens through src/db/queries/*; components must never
// import `db` directly (see CLAUDE.md).
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

declare global {
  var __dbClient: postgres.Sql | undefined;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

// One client per module instance: a warm serverless function reuses it across
// invocations, and in dev it is cached on `globalThis` so Next.js hot reloads
// don't open a new connection on every edit.
//
// `prepare: false` because pooled connections (Supabase/Neon poolers,
// pgbouncer in transaction mode) don't support named prepared statements.
// `max: 1` keeps each serverless instance to one connection, since many
// instances can run at once; the pooler, not this client, multiplexes them.
const client =
  globalThis.__dbClient ?? postgres(databaseUrl, { prepare: false, max: 1 });
globalThis.__dbClient = client;

export const db = drizzle(client, { schema });
