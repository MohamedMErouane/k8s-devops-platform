CLUSTER ?= linkly
TF      := terraform -chdir=infra/terraform
export KUBECONFIG := $(HOME)/.kube/kind-$(CLUSTER)

.PHONY: help cluster deploy monitoring smoke grafana destroy test up

help: ## Show available targets
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

up: ## Run the app locally with Docker Compose
	docker compose up --build

test: ## Run API tests (needs a Postgres on localhost:5432)
	cd app/api && npm ci && npm test

cluster: ## Create kind cluster + ingress + metrics-server + monitoring (Terraform)
	$(TF) init
	$(TF) apply -auto-approve -var cluster_name=$(CLUSTER)

deploy: ## Build images, load into kind, deploy the dev overlay
	docker build -t ghcr.io/mohamedmerouane/linkly-api:ci app/api
	docker build -t ghcr.io/mohamedmerouane/linkly-web:ci app/web
	kind load docker-image ghcr.io/mohamedmerouane/linkly-api:ci ghcr.io/mohamedmerouane/linkly-web:ci --name $(CLUSTER)
	kubectl apply -k k8s/overlays/dev
	kubectl -n linkly-dev rollout status deployment/linkly-api --timeout=180s

monitoring: ## ServiceMonitor, alert rules and Grafana dashboard
	kubectl apply -k k8s/monitoring

smoke: ## End-to-end smoke test through the ingress
	BASE_URL=http://linkly.localtest.me ./scripts/smoke-test.sh

grafana: ## Open Grafana on http://localhost:3000
	kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80

destroy: ## Delete the cluster
	$(TF) destroy -auto-approve -var cluster_name=$(CLUSTER)
