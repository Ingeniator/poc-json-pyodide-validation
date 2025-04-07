# Makefile

# Default target
.DEFAULT_GOAL := help

# Application name
APP_NAME := poc-json-pyodide-validation

# Docker image name
DOCKER_IMAGE := $(APP_NAME)

# Kubernetes directory
K8S_DIR := k8s/

# Colors for output
CYAN  := \033[36m
RESET := \033[0m

## ---------- General Commands ----------

.PHONY: help
help:  ## Show available commands
	@echo "$(CYAN)Available commands:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "$(CYAN)%-15s$(RESET) %s\n", $$1, $$2}'


## ---------- Local Development ----------
.PHONY: dev-init
dev-init:  ## Initialize development environment
	uv venv
	uv pip install --dev
	uvx pre-commit install

.PHONY: run
run:  ## Run application
	python3 -m http.server

## ---------- Code Quality ----------

.PHONY: lint
lint:  ## Run linting (Python example)
	uvx ruff check --fix .

.PHONY: commit
commit:  ## Auto-format code (Python example)
	uvx --from commitizen cz c

## ---------- Testing ----------

.PHONY: test
test:  ## Run tests
	uv venv
	source $$(pwd)/.venv/bin/activate
	uv pip install pytest pytest-asyncio
	PYTHONPATH=$$(pwd) uv run pytest

.PHONY: test-coverage
test-coverage:  ## Run tests with coverage report
	pytest --cov=.