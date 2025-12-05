# NATS JetStream Console

A modern, enterprise-grade web console for managing NATS JetStream clusters. Built with Next.js, Node.js, and TypeScript, featuring real-time monitoring and a developer-friendly experience.

**Maintained by [KLogic](https://klogic.io)**

![NATS Console](https://img.shields.io/badge/NATS-JetStream-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Fastify](https://img.shields.io/badge/Fastify-5-black)

## Features

- **Multi-cluster Management** - Connect and manage multiple NATS JetStream clusters
- **Stream Management** - Create, configure, and monitor streams with message browser
- **Consumer Management** - Manage consumers with real-time lag visualization
- **Real-time Metrics** - Live dashboards with ClickHouse-backed analytics
- **Alerting** - Configurable alerts for lag, throughput, and errors
- **Team Collaboration** - Multi-tenant with organizations and teams

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

## 1. All-in-One Docker Image

The simplest way to try NATS Console. A single container with all services embedded.

### Quick Start

```bash
# Build the image
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
  nats-console:allinone
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

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](./LICENSE) for details.
