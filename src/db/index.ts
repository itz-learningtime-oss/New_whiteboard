import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function connectionString() {
  return process.env.DATABASE_URL || "";
}

export function isDbConfigured() {
  return connectionString().length > 0;
}

function getPool(): Pool {
  if (!isDbConfigured()) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your local PostgreSQL (see README)."
    );
  }
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: connectionString(),
    });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

function createDb() {
  // Lazily create the pool so importing this module never crashes routes.
  // Accessing any property forwards to a real drizzle instance.
  return new Proxy({} as ReturnType<typeof drizzle>, {
    get(_target, prop) {
      const real = drizzle(getPool());
      const value = (real as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? value.bind(real) : value;
    },
  });
}

export const db = createDb();
export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? null;
