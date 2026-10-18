import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createPool, LinkRepository, migrate } from "../src/db.js";
import { createApp } from "../src/app.js";

// Integration tests against a real PostgreSQL (a service container in CI).
const pool = createPool(process.env.DATABASE_URL ?? "postgres://linkly:linkly@localhost:5432/linkly");
const app = createApp(new LinkRepository(pool), {
  publicBaseUrl: "http://sho.rt",
  version: "test",
  isShuttingDown: () => false,
});

beforeAll(async () => {
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE links");
});
afterAll(async () => {
  await pool.end();
});

describe("probes", () => {
  it("liveness reports ok without touching the DB", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", version: "test" });
  });

  it("readiness checks the database", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
  });

  it("readiness fails while shutting down", async () => {
    const draining = createApp(new LinkRepository(pool), { publicBaseUrl: "", version: "t", isShuttingDown: () => true });
    const res = await request(draining).get("/readyz");
    expect(res.status).toBe(503);
  });
});

describe("links", () => {
  it("creates a link and redirects to it", async () => {
    const created = await request(app).post("/api/links").send({ url: "https://example.com/page" });
    expect(created.status).toBe(201);
    expect(created.body.shortUrl).toMatch(/^http:\/\/sho\.rt\/[A-Za-z0-9_-]{7}$/);

    const hit = await request(app).get(`/${created.body.code}`);
    expect(hit.status).toBe(302);
    expect(hit.headers.location).toBe("https://example.com/page");

    const stats = await request(app).get(`/api/links/${created.body.code}`);
    expect(stats.body.clicks).toBe("1"); // BIGINT comes back as a string from pg
  });

  it("accepts a custom code and rejects duplicates", async () => {
    const a = await request(app).post("/api/links").send({ url: "https://a.dev", code: "my-link" });
    expect(a.status).toBe(201);
    const b = await request(app).post("/api/links").send({ url: "https://b.dev", code: "my-link" });
    expect(b.status).toBe(409);
  });

  it("rejects invalid input", async () => {
    expect((await request(app).post("/api/links").send({ url: "javascript:alert(1)" })).status).toBe(400);
    expect((await request(app).post("/api/links").send({ url: "https://ok.dev", code: "a b" })).status).toBe(400);
    expect((await request(app).post("/api/links").send({})).status).toBe(400);
  });

  it("returns 404 for unknown codes", async () => {
    expect((await request(app).get("/nope1234")).status).toBe(404);
  });

  it("lists recent links", async () => {
    await request(app).post("/api/links").send({ url: "https://one.dev" });
    await request(app).post("/api/links").send({ url: "https://two.dev" });
    const res = await request(app).get("/api/links");
    expect(res.body).toHaveLength(2);
  });
});

describe("metrics", () => {
  it("exposes Prometheus metrics", async () => {
    await request(app).post("/api/links").send({ url: "https://m.dev" });
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.text).toContain("linkly_links_created_total");
    expect(res.text).toContain("linkly_http_request_duration_seconds_bucket");
  });
});
