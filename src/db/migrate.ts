import { config } from "dotenv";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

config({ path: ".env.local" });

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    console.log("Migrations applied");
  } finally {
    await sql.end();
  }
}

// Log only the message and SQLSTATE code: a Postgres error's `detail` can
// echo row values (e.g. "Key (email)=(...) already exists"), which may be PII.
main().catch((err: unknown) => {
  const { message, code } = (err ?? {}) as { message?: string; code?: string };
  console.error(`Migration failed${code ? ` [${code}]` : ""}: ${message ?? "unknown error"}`);
  process.exit(1);
});