import client from "prom-client";
import type { NextFunction, Request, Response } from "express";

// Prometheus metrics: default Node.js process metrics plus RED metrics
// (Rate, Errors, Duration) per route, scraped by a ServiceMonitor in-cluster.
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "linkly_" });

export const httpDuration = new client.Histogram({
  name: "linkly_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const linksCreated = new client.Counter({
  name: "linkly_links_created_total",
  help: "Short links created",
  registers: [registry],
});

export const redirects = new client.Counter({
  name: "linkly_redirects_total",
  help: "Redirects served, by result",
  labelNames: ["result"] as const,
  registers: [registry],
});

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    // Use the matched route pattern, not the raw path, to keep label cardinality bounded.
    const route = req.route?.path ?? (res.statusCode === 404 ? "not_found" : "unmatched");
    end({ method: req.method, route: String(route), status: String(res.statusCode) });
  });
  next();
}
