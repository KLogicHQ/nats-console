# =============================================================================
# NATS Console - All-in-One Docker Image
# =============================================================================
# This Dockerfile creates a single image containing:
# - PostgreSQL 16
# - Redis 7
# - ClickHouse
# - NATS Server with JetStream
# - NATS Console (API, Web, Workers)
#
# Perfect for local development, demos, and trying out the application.
# For production, use docker-compose.prod.yml with separate services.
# =============================================================================

FROM ubuntu:22.04

LABEL maintainer="NATS Console Team"
LABEL description="All-in-One NATS JetStream Console with embedded databases"

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# =============================================================================
# Install system dependencies
# =============================================================================
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gnupg \
    lsb-release \
    ca-certificates \
    supervisor \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Install Node.js 20
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm@9

# =============================================================================
# Install PostgreSQL 16
# =============================================================================
RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' \
    && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
    && apt-get update \
    && apt-get install -y postgresql-16 postgresql-contrib-16 \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Install Redis
# =============================================================================
RUN apt-get update && apt-get install -y redis-server \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Install ClickHouse
# =============================================================================
RUN apt-get update \
    && apt-get install -y apt-transport-https ca-certificates dirmngr \
    && apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 8919F6BD2B48D754 \
    && echo "deb https://packages.clickhouse.com/deb stable main" | tee /etc/apt/sources.list.d/clickhouse.list \
    && apt-get update \
    && apt-get install -y clickhouse-server clickhouse-client \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Install NATS Server
# =============================================================================
ARG NATS_VERSION=2.10.22
RUN curl -L https://github.com/nats-io/nats-server/releases/download/v${NATS_VERSION}/nats-server-v${NATS_VERSION}-linux-amd64.tar.gz | tar xz \
    && mv nats-server-v${NATS_VERSION}-linux-amd64/nats-server /usr/local/bin/ \
    && rm -rf nats-server-v${NATS_VERSION}-linux-amd64

# =============================================================================
# Create directories
# =============================================================================
RUN mkdir -p /app \
    /var/run/postgresql \
    /var/lib/postgresql/data \
    /var/lib/redis \
    /var/lib/clickhouse \
    /var/lib/nats \
    /var/log/nats-console \
    /docker-entrypoint-initdb.d

# Set ownership
RUN chown -R postgres:postgres /var/run/postgresql /var/lib/postgresql
RUN chown -R clickhouse:clickhouse /var/lib/clickhouse
RUN chown -R redis:redis /var/lib/redis

# =============================================================================
# Copy application code
# =============================================================================
WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/workers/package.json ./apps/workers/
COPY apps/shared/package.json ./apps/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Generate Prisma client
RUN cd apps/api && pnpm prisma generate

# =============================================================================
# Copy initialization scripts
# =============================================================================
COPY infrastructure/clickhouse/init/init.sql /docker-entrypoint-initdb.d/clickhouse-init.sql
COPY docker/scripts/entrypoint.sh /entrypoint.sh
COPY docker/scripts/init-databases.sh /init-databases.sh
RUN chmod +x /entrypoint.sh /init-databases.sh

# =============================================================================
# Configure supervisord
# =============================================================================
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# =============================================================================
# Environment variables
# =============================================================================
ENV NODE_ENV=production
ENV PORT=3001
ENV WEB_PORT=3000
ENV DATABASE_URL=postgresql://nats_console:nats_console@localhost:5432/nats_console
ENV REDIS_URL=redis://localhost:6379
ENV CLICKHOUSE_URL=http://localhost:8123
ENV CLICKHOUSE_DATABASE=nats_console
ENV NATS_URL=nats://localhost:4222
ENV JWT_SECRET=change-me-in-production-use-secure-random-string
ENV JWT_EXPIRES_IN=15m
ENV JWT_REFRESH_EXPIRES_IN=7d
ENV NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1

# =============================================================================
# Expose ports
# =============================================================================
# Web UI
EXPOSE 3000
# API
EXPOSE 3001
# PostgreSQL
EXPOSE 5432
# Redis
EXPOSE 6379
# ClickHouse HTTP
EXPOSE 8123
# ClickHouse Native
EXPOSE 9000
# NATS
EXPOSE 4222
# NATS Monitoring
EXPOSE 8222

# =============================================================================
# Health check
# =============================================================================
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000 && curl -f http://localhost:3001/health || exit 1

# =============================================================================
# Volumes for data persistence
# =============================================================================
# Single data directory with all databases
# /data
# ├── postgres/
# ├── redis/
# ├── clickhouse/
# ├── nats/
# └── logs/
VOLUME ["/data"]

# =============================================================================
# Start all services
# =============================================================================
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
