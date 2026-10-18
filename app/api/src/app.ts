import express, { type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import type { LinkRepository } from "./db.js";
import { linksCreated, metricsMiddleware, redirects, registry } from "./metrics.js";

const CODE_RE = /^[A-Za-z0-9_-]{4,16}$/;

function newCode() {
  return randomBytes(6).toString("base64url").slice(0, 7);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function createApp(repo: LinkRepository, opts: { publicBaseUrl: string; version: string; isShuttingDown: () => boolean; onError?: (err: Error) => void }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));
  app.use(metricsMiddleware);

  // Liveness: the process is up. Never touches the database, so a DB outage
  // doesn't make Kubernetes restart healthy pods in a loop.
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", version: opts.version });
  });

  // Readiness: can we serve traffic right now? Fails during shutdown and
  // when the database is unreachable, so the Service stops routing to us.
  app.get("/readyz", async (_req, res) => {
    if (opts.isShuttingDown()) return res.status(503).json({ status: "shutting_down" });
    try {
      await repo.ping();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "db_unavailable" });
    }
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  app.post("/api/links", async (req: Request, res: Response) => {
    const { url, code } = req.body ?? {};
    if (!isHttpUrl(url)) return res.status(400).json({ error: "url must be a valid http(s) URL" });
    if (code !== undefined && (typeof code !== "string" || !CODE_RE.test(code))) {
      return res.status(400).json({ error: "code must be 4-16 chars: letters, digits, _ or -" });
    }
    const wanted = code ?? newCode();
    try {
      const link = await repo.create(wanted, url);
      linksCreated.inc();
      res.status(201).json({ ...link, shortUrl: `${opts.publicBaseUrl}/${link.code}` });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") return res.status(409).json({ error: "code already taken" });
      throw err;
    }
  });

  app.get("/api/links", async (_req, res) => {
    res.json(await repo.recent());
  });

  app.get("/api/links/:code", async (req, res) => {
    const link = await repo.find(req.params.code);
    if (!link) return res.status(404).json({ error: "not found" });
    res.json(link);
  });

  app.get("/:code", async (req, res) => {
    if (!CODE_RE.test(req.params.code)) {
      redirects.inc({ result: "invalid" });
      return res.status(404).json({ error: "not found" });
    }
    const url = await repo.hit(req.params.code);
    if (!url) {
      redirects.inc({ result: "miss" });
      return res.status(404).json({ error: "not found" });
    }
    redirects.inc({ result: "hit" });
    res.redirect(302, url);
  });

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
    opts.onError?.(err);
    res.status(500).json({ error: "internal error" });
  });

  return app;
}
