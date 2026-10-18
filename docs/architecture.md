# Architecture decisions

Short records of the choices made in this platform and why.

## 1. Kustomize for the app, Helm for third-party software

The application manifests are plain YAML with Kustomize overlays (`dev`, `prod`). They stay readable, diff cleanly in code review, and need no templating language. Third-party components (ingress-nginx, metrics-server, kube-prometheus-stack) are installed with Helm through Terraform, because their charts are the maintained, versioned way to ship them.

## 2. Three different probes, three different questions

| Probe | Endpoint | Question it answers |
|---|---|---|
| startup | `/healthz` | Has the process finished booting (migrations done)? |
| liveness | `/healthz` | Is the process stuck and in need of a restart? |
| readiness | `/readyz` | Should this pod receive traffic **right now**? |

Liveness deliberately **does not** check the database. If Postgres goes down, restarting every API pod would not fix anything and would turn a database incident into an API crash loop. Instead, readiness fails, the pods leave the Service, and they come back by themselves when the database recovers.

## 3. Zero-downtime rollouts

Four pieces have to work together, and CI verifies them under load on every push:

1. `maxUnavailable: 0` — a new pod must be Ready before an old one is removed.
2. Readiness probe — a new pod only gets traffic once it can reach the database.
3. `preStop: sleep 5` — gives kube-proxy and the ingress time to remove the terminating pod from their endpoints.
4. Graceful shutdown in the app — on `SIGTERM` the API fails readiness, stops accepting connections, finishes in-flight requests, then closes the DB pool.

## 4. Security baseline

- Namespaces enforce the Kubernetes **restricted** Pod Security Standard, so a non-compliant pod is rejected at admission time.
- Every container runs as non-root with a read-only root filesystem, no privilege escalation, all capabilities dropped and the RuntimeDefault seccomp profile.
- NetworkPolicies start from **default deny** and only allow `ingress-nginx → web → api → postgres` (plus Prometheus → api).
- Images are scanned by Trivy in CI; the build fails on fixable CRITICAL vulnerabilities.
- Prometheus metrics are reachable in-cluster only; nginx returns 404 for `/metrics`.

## 5. Secrets

The `secretGenerator` in the base contains **development-only** credentials so the stack runs out of the box. In a real environment the `DATABASE_URL` secret would come from an external store (AWS Secrets Manager / Vault via the External Secrets Operator, or Sealed Secrets in Git) and the base literals would be removed.

## 6. Moving to a real cloud

The Kubernetes manifests don't change. What changes:

- Terraform swaps `kind_cluster` for an EKS / GKE / AKS module; the Helm releases stay the same.
- PostgreSQL moves out of the cluster to a managed database (RDS, Cloud SQL) — only `DATABASE_URL` changes.
- cert-manager issues TLS certificates (the `prod` overlay already references a `letsencrypt` ClusterIssuer).
- Deployment becomes pull-based with Argo CD or Flux watching the `prod` overlay, and the pipeline pins image digests with `kustomize edit set image`.
