import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsDrizzle?: NodePgDatabase;
};

export function isDatabaseConfigured(): boolean {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === "") return false;
  // Ignore dummy/placeholder host values
  if (databaseUrl.includes("@host:") || databaseUrl.includes("user:password@host")) {
    return false;
  }
  return true;
}

function getDb(): NodePgDatabase {
  if (globalForDb.__arenaNextJsDrizzle) {
    return globalForDb.__arenaNextJsDrizzle;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!isDatabaseConfigured() || !databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured with a valid connection string. Please update .env.local or your Vercel project environment settings."
    );
  }

  const pool =
    globalForDb.__arenaNextJsPostgresqlPool ??
    new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }

  const instance = drizzle(pool);
  globalForDb.__arenaNextJsDrizzle = instance;
  return instance;
}

// Proxied db instance: evaluates getDb() on demand upon query execution instead of module evaluation
export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const instance = getDb();
    const val = (instance as unknown as Record<string, unknown>)[prop as string];
    if (typeof val === "function") {
      return val.bind(instance);
    }
    return val;
  },
});
