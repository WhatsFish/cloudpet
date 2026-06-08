import { Pool, type QueryResultRow } from "pg";

// A single process-wide connection pool. The backend is a long-lived Next.js
// standalone server, so the pool persists across requests — we never open a
// connection per query anymore (that churned ~15 connect/auth/close cycles on
// the SHARED Postgres for a single GET /api/pet and risked exhausting the
// db container's max_connections under a launch spike). max is small because
// each user has exactly one pet and contention is per-row (FOR UPDATE).
let _pool: Pool | null = null;

export function pool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      host: process.env.PG_HOST ?? "db",
      port: parseInt(process.env.PG_PORT ?? "5432", 10),
      user: process.env.PG_USER ?? "cloudpet",
      password: process.env.PG_PASSWORD ?? "",
      database: process.env.PG_DB ?? "cloudpet",
      max: parseInt(process.env.PG_POOL_MAX ?? "8", 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // A pooled client can emit an async 'error' (e.g. the db restarted); without
    // a listener that would crash the process. Log + let the pool evict it.
    _pool.on("error", (e) => console.error("pg pool error:", e.message));
  }
  return _pool;
}

/** One-shot query, borrowed from the pool. Use for simple reads/writes. */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const r = await pool().query<T>(sql, params);
  return r.rows;
}

export type Tx = <T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>;

/**
 * Run `fn` inside a single transaction on ONE pooled connection. The mutating
 * routes use this so they can `SELECT ... FOR UPDATE` the pet rows and apply
 * tick/cooldown/state/delta atomically (closes the lost-update + cooldown-bypass
 * + daily-counter races). Commits on success, rolls back on any throw, and always
 * returns the connection to the pool.
 */
export async function withTx<T>(fn: (q: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  const q: Tx = async (sql, params = []) => (await client.query(sql, params)).rows as never;
  try {
    await client.query("BEGIN");
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
