# NATS JetStream Console

A modern, enterprise-grade web console for managing NATS JetStream clusters. Built with Next.js, Node.js, and TypeScript, featuring real-time monitoring and a developer-friendly experience.

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
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS, shadcn/ui, ECharts, TanStack Table |
| Backend | Fastify, Prisma ORM, PostgreSQL |
| Metrics | ClickHouse (time-series), Redis (cache/sessions) |
| Messaging | NATS JetStream |

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Step-by-Step Setup

1. **Clone the repository**

```bash
git clone https://github.com/your-org/nats-console.git
cd nats-console
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Start infrastructure services**

```bash
# Start PostgreSQL, Redis, ClickHouse, and NATS
make db-up

# Or using docker-compose directly
docker-compose up -d
```

4. **Setup environment variables**

```bash
# API
cp apps/api/.env.example apps/api/.env

# Web
cp apps/web/.env.example apps/web/.env

# Workers
cp apps/workers/.env.example apps/workers/.env
```

5. **Initialize the database**

```bash
# Generate Prisma client
make prisma-generate

# Run migrations
make prisma-migrate
```

6. **Start development servers**

```bash
# Start all services (API, Web, Workers)
make dev
```

7. **Access the application**

| Service | URL |
|---------|-----|
| Web Dashboard | http://localhost:3000 |
| API | http://localhost:3001 |
| NATS Monitoring | http://localhost:8222 |
| Prisma Studio | Run `make prisma-studio` |

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

---

## Production Deployment

### Using Docker Compose

1. **Build the images**

```bash
docker-compose -f docker-compose.prod.yml build
```

2. **Create environment file**

```bash
cp .env.prod.example .env.prod
# Edit .env.prod with production values
```

3. **Start services**

```bash
docker-compose -f docker-compose.prod.yml up -d
```

4. **Run migrations**

```bash
docker-compose -f docker-compose.prod.yml exec api pnpm prisma migrate deploy
```

### Environment Variables (Production)

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/nats_console
REDIS_URL=redis://host:6379
CLICKHOUSE_URL=http://host:8123
JWT_SECRET=your-secure-jwt-secret

# Optional
NATS_URL=nats://host:4222
LOG_LEVEL=info
```

---

## Testing with Example Apps

The `examples/` directory contains sample NATS applications:

```bash
cd examples

# Install dependencies
pnpm install

# Run message producer
pnpm run producer

# Run message consumer
pnpm run consumer

# Run high-volume load test
pnpm run load-test
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
