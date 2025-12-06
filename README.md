# NATS JetStream Console

A modern, enterprise-grade web console for managing NATS JetStream clusters. Built with Next.js, Node.js, and TypeScript, featuring real-time monitoring and a developer-friendly experience.

**Open Source** | **Maintained by [KLogic](https://klogic.io)**

![Open Source](https://img.shields.io/badge/Open%20Source-Apache%202.0-green)
![NATS Console](https://img.shields.io/badge/NATS-JetStream-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Fastify](https://img.shields.io/badge/Fastify-5-black)

> **Free and Open Source Software (FOSS)** - Use, modify, and distribute freely under the Apache License 2.0. Contributions welcome!

## Features

### Cluster Management
- **Multi-cluster Support** - Connect and manage multiple NATS JetStream clusters from a single dashboard
- **Connection Testing** - Verify cluster connectivity before saving
- **Health Monitoring** - Real-time cluster health status with server info
- **Secure Connections** - Support for TLS, credentials, and token authentication

### Stream Management
- **Stream CRUD** - Create, update, delete, and configure streams
- **Message Browser** - Browse messages with pagination, JSON formatting, expand/collapse
- **Message Publishing** - Publish messages directly from the UI
- **Message Export** - Export messages to JSON or CSV format
- **Message Replay** - Replay messages to different subjects
- **Stream Purge** - Purge stream messages with confirmation
- **Metrics Charts** - Message throughput and data throughput visualization

### Consumer Management
- **Consumer CRUD** - Create, update, and delete consumers
- **Lag Visualization** - Real-time lag monitoring with progress bars
- **Pause/Resume** - Pause and resume consumers
- **Metrics Charts** - Consumer lag, pending, and ack rate visualization
- **Delivery Policies** - Configure various delivery policies

### Real-time Monitoring
- **WebSocket Updates** - Live metrics streaming via WebSocket
- **Interactive Charts** - ECharts-based visualization
- **Historical Trends** - ClickHouse-backed time-series analytics
- **Gauge Charts** - Memory, connections, and storage usage

### Alert System
- **Alert Rules** - Create rules for lag, throughput, storage, and connection health
- **Notification Channels** - Email, Slack, Webhook, PagerDuty, Microsoft Teams, Google Chat
- **Incident Management** - Create, acknowledge, resolve, and close incidents
- **Alert History** - View historical alerts and events

### Custom Dashboards
- **Dashboard Builder** - Drag-and-drop widget placement
- **Widget Library** - Line charts, bar charts, gauges, stat cards, tables, pie charts
- **Dashboard Sharing** - Share dashboards with team members

### Multi-tenancy & Security
- **Organizations** - Multi-tenant organization management
- **Teams** - Team-based access control within organizations
- **Role-Based Access Control (RBAC)** - Fine-grained permissions
- **Two-Factor Authentication (2FA)** - TOTP-based authentication
- **API Key Management** - Generate and manage API keys with expiration
- **IP Allowlisting** - Restrict access by IP address or CIDR range
- **Audit Logging** - Track all user actions with ClickHouse storage

### Enterprise Features
- **Data Retention Policies** - Configure retention for metrics, audit logs, and events
- **Audit Trail Export** - Export audit logs to JSON or CSV
- **Compliance Reports** - Security metrics and recommendations
- **GDPR Compliance** - Data export (Article 20) and account deletion (Article 17)

### Developer Experience
- **Modern UI** - Clean, responsive design with shadcn/ui components
- **Dark Mode** - System, light, and dark theme support
- **REST API** - Full-featured REST API for integrations
- **WebSocket API** - Real-time event streaming

---

## Screenshots

### Clusters Overview
Connect and manage multiple NATS JetStream clusters from a single dashboard.

![Clusters](screenshots/nats-clusters-01.jpg)

### Cluster Details
View detailed cluster information including server stats, health status, and real-time metrics.

![Cluster Summary](screenshots/nats-cluster-summary-02.jpg)

### Stream Summary
Monitor stream health with message counts, storage usage, and throughput metrics.

![Stream Summary](screenshots/nats-stream-summary-03.jpg)

### Message Browser
Browse and inspect messages with JSON formatting, expand/collapse functionality, and message metadata.

![Message Inspection](screenshots/nats-messages-inspect-04.jpg)

### Message Schema Detection
Automatic schema detection and visualization for structured message payloads.

![Message Schema](screenshots/nats-messages-schema-05.jpg)

### Stream Configuration
Configure stream settings including retention policies, storage limits, and replication.

![Stream Configuration](screenshots/nats-stream-configuration-06.jpg)

### Consumer Summary
Track consumer performance with lag monitoring, pending messages, and delivery metrics.

![Consumer Summary](screenshots/nats-consumer-summary-07.jpg)

### Consumer Configuration
Configure consumer settings including delivery policies, ack policies, and replay options.

![Consumer Configuration](screenshots/nats-consumer-configuration-08.jpg)

### Analytics Dashboard
Real-time analytics with interactive charts for throughput, latency, and resource utilization.

![Analytics](screenshots/nats-web-analytics-09.jpg)

### Alert Rules
Create and manage alert rules with golden templates for common monitoring scenarios.

![Alert Rules](screenshots/nats-alert-rules-10.jpg)

### Custom Dashboards
Build custom dashboards with drag-and-drop widgets for personalized monitoring views.

![Custom Dashboard](screenshots/nats-custom-dashboard-11.jpg)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS, shadcn/ui, TanStack Query |
| Backend | Fastify, Prisma ORM, PostgreSQL |
| Metrics | ClickHouse (time-series), Redis (cache/sessions) |
| Messaging | NATS JetStream |

---

## Deployment Options

Choose the deployment method that fits your needs:

| Method | Use Case | Complexity |
|--------|----------|------------|
| [All-in-One Docker](#1-all-in-one-docker-image) | Quick demos, testing, local dev | Simple |
| [Docker Compose (All-in-One)](#2-docker-compose-all-in-one) | Easy deployment with volume persistence | Simple |
| [Docker Compose (Production)](#3-docker-compose-production) | Production deployments | Medium |
| [Local Development](#4-local-development-mode) | Active development with hot reload | Medium |

---

## Container Images

Pre-built container images are available on GitHub Container Registry (GHCR):

| Image | Description |
|-------|-------------|
| `ghcr.io/klogic/nats-console` | All-in-one image with all services |
| `ghcr.io/klogic/nats-console-api` | API service only |
| `ghcr.io/klogic/nats-console-web` | Web frontend only |
| `ghcr.io/klogic/nats-console-workers` | Background workers only |

### Pull from GHCR

```bash
# Pull latest all-in-one image
docker pull ghcr.io/klogic/nats-console:latest

# Pull specific version
docker pull ghcr.io/klogic/nats-console:1.0.0

# Pull individual services
docker pull ghcr.io/klogic/nats-console-api:latest
docker pull ghcr.io/klogic/nats-console-web:latest
docker pull ghcr.io/klogic/nats-console-workers:latest
```

---

## 1. All-in-One Docker Image

The simplest way to try NATS Console. A single container with all services embedded.

### Quick Start (from GHCR)

```bash
# Run the container from GHCR
docker run -d \
  --name nats-console \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 4222:4222 \
  -p 8222:8222 \
  -e JWT_SECRET="your-secret-key-change-in-production" \
  ghcr.io/klogic/nats-console:latest
```

### Build Locally (Optional)

```bash
# Build the image locally
docker build -t nats-console:allinone .

# Run the container
docker run -d \
  --name nats-console \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 4222:4222 \
  -p 8222:8222 \
  -e JWT_SECRET="your-secret-key-change-in-production" \
  nats-console:allinone
```

### Access

| Service | URL |
|---------|-----|
| Web Dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| NATS Client | nats://localhost:4222 |
| NATS Monitoring | http://localhost:8222 |

### With Data Persistence

```bash
docker run -d \
  --name nats-console \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 4222:4222 \
  -v nats-console-postgres:/var/lib/postgresql/data \
  -v nats-console-redis:/var/lib/redis \
  -v nats-console-clickhouse:/var/lib/clickhouse \
  -v nats-console-nats:/var/lib/nats \
  -e JWT_SECRET="your-secret-key-change-in-production" \
  ghcr.io/klogic/nats-console:latest
```

---

## 2. Docker Compose (All-in-One)

Same all-in-one container but managed with Docker Compose for easier configuration.

```bash
# Start
docker-compose -f docker-compose.allinone.yml up -d

# View logs
docker-compose -f docker-compose.allinone.yml logs -f

# Stop
docker-compose -f docker-compose.allinone.yml down

# Stop and remove data
docker-compose -f docker-compose.allinone.yml down -v
```

### Custom Configuration

Create a `.env` file:

```bash
cp .env.example .env
# Edit .env with your settings
```

```env
JWT_SECRET=your-secure-random-string-here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

---

## 3. Docker Compose (Production)

For production deployments with separate, scalable services.

### Prerequisites

- Docker & Docker Compose
- At least 4GB RAM recommended

### Setup

1. **Create environment file**

```bash
cp .env.example .env.prod
```

2. **Edit production environment** (`.env.prod`)

```env
NODE_ENV=production

# Database
DATABASE_URL=postgresql://nats_console:secure_password@postgres:5432/nats_console
POSTGRES_PASSWORD=secure_password

# Redis
REDIS_URL=redis://redis:6379

# ClickHouse
CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_DATABASE=nats_console

# NATS
NATS_URL=nats://nats:4222

# Security (IMPORTANT: Use a secure random string!)
JWT_SECRET=generate-with-openssl-rand-hex-32
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

3. **Start services**

```bash
# Build and start
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Run database migrations
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### With Nginx Reverse Proxy

```bash
# Include nginx profile
docker-compose -f docker-compose.prod.yml --profile with-nginx up -d
```

### Scaling

```bash
# Scale API instances
docker-compose -f docker-compose.prod.yml up -d --scale api=3

# Scale workers
docker-compose -f docker-compose.prod.yml up -d --scale workers=2
```

---

## 4. Local Development Mode

For active development with hot reload. Infrastructure runs in Docker, apps run locally.

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Setup

1. **Clone and install**

```bash
git clone https://github.com/your-org/nats-console.git
cd nats-console
pnpm install
```

2. **Start infrastructure services**

```bash
# Start PostgreSQL, Redis, ClickHouse, NATS
docker-compose -f docker-compose.dev.yml up -d

# Or use the existing docker-compose.yml
docker-compose up -d
```

3. **Setup environment**

```bash
# Copy environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/workers/.env.example apps/workers/.env
```

4. **Initialize database**

```bash
# Generate Prisma client
make prisma-generate

# Run migrations
make prisma-migrate
```

5. **Start development servers**

```bash
# Start all services with hot reload
make dev

# Or start individually
make api-dev    # API only
make web-dev    # Web only
make workers-dev # Workers only
```

### Access

| Service | URL |
|---------|-----|
| Web Dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| NATS Monitoring | http://localhost:8222 |
| Prisma Studio | `make prisma-studio` |

### One-Command Setup

```bash
make setup && make dev
```

---

## Makefile Commands

### Development

```bash
make dev              # Start all services in dev mode
make api-dev          # Start API only
make web-dev          # Start Web only
make workers-dev      # Start Workers only
```

### Database Operations

```bash
make db-up            # Start database containers
make db-down          # Stop database containers
make db-shell-postgres  # PostgreSQL shell
make db-shell-redis     # Redis CLI
make db-shell-clickhouse # ClickHouse client
make db-shell-nats      # NATS CLI
```

### Prisma

```bash
make prisma-generate  # Generate Prisma client
make prisma-migrate   # Run migrations
make prisma-studio    # Open Prisma Studio
make prisma-reset     # Reset database
```

### Build & Production

```bash
make build            # Build all packages
make start            # Start in production mode
make health           # Check health of all services
```

### Docker

```bash
make docker-build-allinone  # Build all-in-one image
make docker-up-allinone     # Start all-in-one container
make docker-down            # Stop all containers
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser                                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                        ┌─────▼─────┐
                        │  Web UI   │
                        │ (Next.js) │
                        └─────┬─────┘
                              │ HTTP/REST
                              │
                        ┌─────▼─────┐
                        │    API    │◄─────────────────────────────┐
                        │ (Fastify) │                              │
                        └─────┬─────┘                              │
                              │                                    │
          ┌───────────────────┼───────────────────┐                │
          │                   │                   │                │
    ┌─────▼─────┐       ┌─────▼─────┐       ┌─────▼─────┐    ┌─────▼──────┐
    │ PostgreSQL│       │   Redis   │       │ ClickHouse│    │  Workers   │
    │   (Data)  │       │  (Cache)  │       │ (Metrics) │    │(Background)│
    └───────────┘       └───────────┘       └───────────┘    └─────┬──────┘
                                                                   │
          ┌────────────────────────────────────────────────────────┘
          │
          │  ┌─────────────────────────────────────────────────────┐
          │  │          NATS JetStream Clusters                    │
          │  │  (Managed by API - streams, consumers, messages)    │
          └──►                                                     │
             └─────────────────────────────────────────────────────┘
```

**Data Flow:**
- **Web UI → API**: All frontend requests go through the REST API
- **API → NATS**: API connects to NATS clusters to manage streams/consumers
- **Workers → NATS**: Background jobs for metrics collection and alerting

---

## Testing with Example Apps

The `examples/` directory contains sample NATS applications:

```bash
cd examples

# Install dependencies
pnpm install

# Setup example streams
pnpm run setup-streams

# Run message producer
pnpm run producer

# Run message consumer
pnpm run consumer

# Run high-volume load test
pnpm run load-test
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | API server port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `CLICKHOUSE_URL` | ClickHouse HTTP URL | - |
| `NATS_URL` | NATS server URL | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |

See `.env.example` for the complete list.

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs nats-console

# Check if ports are in use
lsof -i :3000,:3001,:4222

# Restart with fresh data
docker-compose down -v
docker-compose up -d
```

### Database connection issues

```bash
# Check PostgreSQL is running
docker exec nats-console-postgres pg_isready

# Check Redis
docker exec nats-console-redis redis-cli ping

# Check ClickHouse
curl http://localhost:8123/ping
```

### Reset everything

```bash
# Stop all containers and remove volumes
docker-compose down -v

# Remove images
docker rmi nats-console:allinone

# Start fresh
docker-compose up -d --build
```

---

## Contributing

We welcome contributions from the community! This project is open source and thrives on community involvement.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Commit** changes: `git commit -am 'Add feature'`
4. **Push** to branch: `git push origin feature/my-feature`
5. **Open** a Pull Request

### Ways to Contribute

- **Bug Reports** - Found a bug? Open an issue with details
- **Feature Requests** - Have an idea? We'd love to hear it
- **Documentation** - Help improve docs and examples
- **Code** - Submit PRs for bug fixes or new features
- **Testing** - Help test and report issues

### Development Setup

See [Local Development Mode](#4-local-development-mode) for setting up your development environment.

---

## License

Apache License 2.0 - see [LICENSE](./LICENSE) for details.

This is free and open source software. You are free to use, modify, and distribute it under the terms of the Apache License 2.0.
