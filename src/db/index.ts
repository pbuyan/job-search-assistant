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

// In dev, Next.js hot-reloads server modules, which would otherwise open a
// fresh connection pool on every edit. Cache the client on `globalThis` so
// it survives HMR; in production each server instance gets its own pool.
const client =
  globalThis.__dbClient ??
  postgres(databaseUrl, {
    max: process.env.NODE_ENV === "production" ? 10 : 1,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__dbClient = client;
}

export const db = drizzle(client, { schema });
