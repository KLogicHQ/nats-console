.PHONY: help install dev build start stop logs clean \
        db-up db-down db-shell-postgres db-shell-redis db-shell-clickhouse db-shell-nats \
        prisma-generate prisma-migrate prisma-studio \
        api-dev web-dev workers-dev \
        lint format test

# Colors
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

help: ## Show this help
	@echo "$(CYAN)NATS JetStream Console$(RESET)"
	@echo ""
	@echo "$(GREEN)Usage:$(RESET)"
	@echo "  make [target]"
	@echo ""
	@echo "$(GREEN)Targets:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'

# ==================== Setup ====================

install: ## Install all dependencies
	pnpm install

# ==================== Development ====================

dev: db-up ## Start all services in development mode
	pnpm dev

api-dev: ## Start API in development mode
	pnpm --filter @nats-console/api dev

web-dev: ## Start Web in development mode
	pnpm --filter @nats-console/web dev

workers-dev: ## Start Workers in development mode
	pnpm --filter @nats-console/workers dev

# ==================== Build ====================

build: ## Build all packages
	pnpm build

build-api: ## Build API
	pnpm --filter @nats-console/api build

build-web: ## Build Web
	pnpm --filter @nats-console/web build

build-workers: ## Build Workers
	pnpm --filter @nats-console/workers build

build-shared: ## Build Shared package
	pnpm --filter @nats-console/shared build

# ==================== Docker / Databases ====================

db-up: ## Start all database containers
	docker-compose up -d

db-down: ## Stop all database containers
	docker-compose down

db-restart: db-down db-up ## Restart all database containers

db-logs: ## Show database container logs
	docker-compose logs -f

db-clean: ## Stop containers and remove volumes
	docker-compose down -v

db-shell-postgres: ## Open PostgreSQL shell
	docker-compose exec postgres psql -U nats_console -d nats_console

db-shell-redis: ## Open Redis CLI
	docker-compose exec redis redis-cli

db-shell-clickhouse: ## Open ClickHouse CLI
	docker-compose exec clickhouse clickhouse-client --database=nats_console

db-shell-nats: ## Open NATS CLI (requires nats-cli installed)
	@echo "$(YELLOW)Connecting to NATS...$(RESET)"
	@which nats > /dev/null 2>&1 && nats -s nats://localhost:4222 || echo "$(YELLOW)Install nats-cli: brew install nats-io/nats-tools/nats$(RESET)"

nats-streams: ## List NATS JetStream streams
	@which nats > /dev/null 2>&1 && nats -s nats://localhost:4222 stream ls || echo "$(YELLOW)Install nats-cli: brew install nats-io/nats-tools/nats$(RESET)"

nats-consumers: ## List NATS JetStream consumers
	@which nats > /dev/null 2>&1 && nats -s nats://localhost:4222 consumer ls || echo "$(YELLOW)Install nats-cli: brew install nats-io/nats-tools/nats$(RESET)"

# ==================== Prisma ====================

prisma-generate: ## Generate Prisma client
	pnpm --filter @nats-console/api prisma generate

prisma-migrate: ## Run Prisma migrations
	pnpm --filter @nats-console/api prisma migrate dev

prisma-migrate-prod: ## Run Prisma migrations (production)
	pnpm --filter @nats-console/api prisma migrate deploy

prisma-studio: ## Open Prisma Studio
	pnpm --filter @nats-console/api prisma studio

prisma-reset: ## Reset database and run migrations
	pnpm --filter @nats-console/api prisma migrate reset

prisma-seed: ## Seed the database
	pnpm --filter @nats-console/api prisma db seed

# ==================== Code Quality ====================

lint: ## Run linter on all packages
	pnpm lint

lint-fix: ## Fix linting issues
	pnpm lint --fix

format: ## Format code with Prettier
	pnpm format

typecheck: ## Run TypeScript type checking
	pnpm typecheck

test: ## Run tests
	pnpm test

test-watch: ## Run tests in watch mode
	pnpm test --watch

test-coverage: ## Run tests with coverage
	pnpm test --coverage

# ==================== Production ====================

start: ## Start all services in production mode
	pnpm start

start-api: ## Start API in production mode
	pnpm --filter @nats-console/api start

start-web: ## Start Web in production mode
	pnpm --filter @nats-console/web start

start-workers: ## Start Workers in production mode
	pnpm --filter @nats-console/workers start

# ==================== Utilities ====================

clean: ## Clean all build artifacts and node_modules
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf packages/*/node_modules
	rm -rf apps/*/.next
	rm -rf apps/*/dist
	rm -rf packages/*/dist
	pnpm store prune

logs-api: ## Tail API logs
	docker-compose logs -f api 2>/dev/null || pnpm --filter @nats-console/api dev

logs-workers: ## Tail Workers logs
	docker-compose logs -f workers 2>/dev/null || pnpm --filter @nats-console/workers dev

status: ## Show status of all services
	@echo "$(CYAN)Docker Containers:$(RESET)"
	@docker-compose ps
	@echo ""
	@echo "$(CYAN)NATS Server Info:$(RESET)"
	@curl -s http://localhost:8222/varz 2>/dev/null | head -20 || echo "$(YELLOW)NATS not running$(RESET)"

health: ## Check health of all services
	@echo "$(CYAN)Checking services...$(RESET)"
	@echo -n "PostgreSQL: " && (docker-compose exec -T postgres pg_isready -U nats_console > /dev/null 2>&1 && echo "$(GREEN)OK$(RESET)" || echo "$(YELLOW)DOWN$(RESET)")
	@echo -n "Redis:      " && (docker-compose exec -T redis redis-cli ping > /dev/null 2>&1 && echo "$(GREEN)OK$(RESET)" || echo "$(YELLOW)DOWN$(RESET)")
	@echo -n "ClickHouse: " && (curl -s http://localhost:8123/ping > /dev/null 2>&1 && echo "$(GREEN)OK$(RESET)" || echo "$(YELLOW)DOWN$(RESET)")
	@echo -n "NATS:       " && (curl -s http://localhost:8222/healthz > /dev/null 2>&1 && echo "$(GREEN)OK$(RESET)" || echo "$(YELLOW)DOWN$(RESET)")
	@echo -n "API:        " && (curl -s http://localhost:3001/health > /dev/null 2>&1 && echo "$(GREEN)OK$(RESET)" || echo "$(YELLOW)DOWN$(RESET)")
	@echo -n "Web:        " && (curl -s http://localhost:3000 > /dev/null 2>&1 && echo "$(GREEN)OK$(RESET)" || echo "$(YELLOW)DOWN$(RESET)")

# ==================== Setup Shortcuts ====================

setup: install db-up prisma-generate prisma-migrate ## Complete project setup
	@echo "$(GREEN)Setup complete!$(RESET)"
	@echo "Run 'make dev' to start development servers"

reset: db-clean install db-up prisma-generate prisma-migrate ## Reset everything and start fresh
	@echo "$(GREEN)Reset complete!$(RESET)"
