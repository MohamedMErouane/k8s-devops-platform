# Runbook

What to do when an alert from `k8s/monitoring/alerts.yaml` fires. Commands assume the `linkly-dev` namespace.

## High error rate

**Alert:** `LinklyHighErrorRate` — more than 5 % of API requests return 5xx for 5 minutes.

1. Check whether it started with a deployment:
   `kubectl -n linkly-dev rollout history deployment/linkly-api`
2. Look at the errors:
   `kubectl -n linkly-dev logs deploy/linkly-api --since=15m | grep '"level":50'`
3. Check the database is ready:
   `kubectl -n linkly-dev get pods -l app.kubernetes.io/name=postgres`
4. If a recent release is the cause, roll back:
   `kubectl -n linkly-dev rollout undo deployment/linkly-api`

## High latency

**Alert:** `LinklyHighLatencyP95` — p95 latency above 500 ms for 10 minutes.

1. Is the HPA at its maximum? `kubectl -n linkly-dev get hpa linkly-api`
2. Are pods CPU-throttled or near their memory limit? `kubectl -n linkly-dev top pods`
3. Check the "Latency percentiles" and "Requests by route" panels in Grafana to see which route is slow.
4. If the database is the bottleneck, check active connections: `kubectl -n linkly-dev exec sts/postgres -- psql -U linkly -c 'select count(*) from pg_stat_activity'`

## API down

**Alert:** `LinklyApiDown` — Prometheus can't scrape any API pod for 2 minutes.

1. `kubectl -n linkly-dev get pods -l app.kubernetes.io/name=linkly-api` — CrashLoopBackOff? Pending?
2. `kubectl -n linkly-dev describe pod <pod>` — look at Events (image pull, probes, admission rejected by Pod Security).
3. `kubectl -n linkly-dev logs <pod> --previous` — startup errors (e.g. database unreachable during migration).
4. If pods are Running but not scraped, check the ServiceMonitor and the NetworkPolicy allowing the `monitoring` namespace.
