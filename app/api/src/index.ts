import pino from "pino";
import { config } from "./config.js";
import { createPool, LinkRepository, migrate } from "./db.js";
import { createApp } from "./app.js";

const log = pino({ level: config.logLevel, base: { service: "linkly-api", version: config.version } });

async function main() {
  const pool = createPool(config.databaseUrl);
  await migrate(pool);
  log.info("database migrated");

  let shuttingDown = false;
  const app = createApp(new LinkRepository(pool), {
    publicBaseUrl: config.publicBaseUrl,
    version: config.version,
    isShuttingDown: () => shuttingDown,
    onError: (err) => log.error({ err }, "unhandled request error"),
  });

  const server = app.listen(config.port, () => log.info({ port: config.port }, "listening"));

  // Graceful shutdown: on SIGTERM (sent by Kubernetes on rollout/scale-down),
  // fail readiness first so the endpoint is removed, finish in-flight
  // requests, then close the DB pool. Pairs with the preStop hook and
  // terminationGracePeriodSeconds in the Deployment.
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");
    const force = setTimeout(() => process.exit(1), config.shutdownGraceMs).unref();
    server.close(async () => {
      await pool.end().catch(() => {});
      clearTimeout(force);
      log.info("bye");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal({ err }, "failed to start");
  process.exit(1);
});
