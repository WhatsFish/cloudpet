import { Client, type QueryResultRow } from "pg";

function config() {
  return {
    host: process.env.PG_HOST ?? "db",
    port: parseInt(process.env.PG_PORT ?? "5432", 10),
    user: process.env.PG_USER ?? "cloudpet",
    password: process.env.PG_PASSWORD ?? "",
    database: process.env.PG_DB ?? "cloudpet",
  };
}

/** One-shot query (opens + closes a connection). Use for simple reads/writes. */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const c = new Client(config());
  await c.connect();
  try {
    const r = await c.query<T>(sql, params);
    return r.rows;
  } finally {
    await c.end();
  }
}

export type Tx = <T extends QueryResultRow = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>;

/**
 * Run `fn` inside a single transaction. The action pipeline needs this so it can
 * `SELECT ... FOR UPDATE` the pet rows and apply cooldown/state/inventory/delta
 * atomically (closes the cooldown-bypass and daily-counter races). Commits on
 * success, rolls back on any throw.
 */
export async function withTx<T>(fn: (q: Tx) => Promise<T>): Promise<T> {
  const c = new Client(config());
  await c.connect();
  const q: Tx = async (sql, params = []) => (await c.query(sql, params)).rows as never;
  try {
    await c.query("BEGIN");
    const result = await fn(q);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
