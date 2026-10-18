variable "cluster_name" {
  description = "Name of the local kind cluster"
  type        = string
  default     = "linkly"
}

variable "kubernetes_version" {
  description = "kindest/node image tag (Kubernetes version)"
  type        = string
  default     = "v1.31.4"
}

variable "worker_count" {
  description = "Number of worker nodes (pods spread across them via topologySpreadConstraints)"
  type        = number
  default     = 2

  validation {
    condition     = var.worker_count >= 1 && var.worker_count <= 5
    error_message = "worker_count must be between 1 and 5."
  }
}

variable "install_monitoring" {
  description = "Install kube-prometheus-stack (Prometheus, Alertmanager, Grafana)"
  type        = bool
  default     = true
}

variable "grafana_admin_password" {
  description = "Grafana admin password (local only — use a secret store elsewhere)"
  type        = string
  default     = "admin"
  sensitive   = true
}
