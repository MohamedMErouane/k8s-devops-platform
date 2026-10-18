// All configuration comes from environment variables (12-factor),
// so the same image runs unchanged in compose, CI and Kubernetes.
export const config = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://linkly:linkly@localhost:5432/linkly",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8080",
  logLevel: process.env.LOG_LEVEL ?? "info",
  version: process.env.APP_VERSION ?? "dev",
  shutdownGraceMs: Number(process.env.SHUTDOWN_GRACE_MS ?? 10000),
};
