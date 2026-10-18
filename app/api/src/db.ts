import pg from "pg";

export type Link = { code: string; url: string; clicks: number; created_at: string };

export function createPool(connectionString: string) {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
}

// Idempotent schema migration, run at startup. Safe with several replicas
// because CREATE ... IF NOT EXISTS is guarded by an advisory lock.
export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(42)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS links (
        code        VARCHAR(16) PRIMARY KEY,
        url         TEXT        NOT NULL,
        clicks      BIGINT      NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  } finally {
    await client.query("SELECT pg_advisory_unlock(42)").catch(() => {});
    client.release();
  }
}

export class LinkRepository {
  constructor(private pool: pg.Pool) {}

  async create(code: string, url: string): Promise<Link> {
    const { rows } = await this.pool.query<Link>(
      "INSERT INTO links (code, url) VALUES ($1, $2) RETURNING code, url, clicks, created_at",
      [code, url]
    );
    return rows[0];
  }

  async find(code: string): Promise<Link | undefined> {
    const { rows } = await this.pool.query<Link>(
      "SELECT code, url, clicks, created_at FROM links WHERE code = $1",
      [code]
    );
    return rows[0];
  }

  async hit(code: string): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ url: string }>(
      "UPDATE links SET clicks = clicks + 1 WHERE code = $1 RETURNING url",
      [code]
    );
    return rows[0]?.url;
  }

  async recent(limit = 20): Promise<Link[]> {
    const { rows } = await this.pool.query<Link>(
      "SELECT code, url, clicks, created_at FROM links ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return rows;
  }

  async ping() {
    await this.pool.query("SELECT 1");
  }
}
