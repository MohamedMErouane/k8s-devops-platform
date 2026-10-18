output "kubeconfig_path" {
  description = "Use with: export KUBECONFIG=$(terraform output -raw kubeconfig_path)"
  value       = kind_cluster.this.kubeconfig_path
}

output "cluster_endpoint" {
  value = kind_cluster.this.endpoint
}

output "grafana" {
  description = "Open Grafana locally"
  value       = "kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80  ->  http://localhost:3000"
}
