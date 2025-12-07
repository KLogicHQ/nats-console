# =============================================================================
# NATS Console - All-in-One Docker Image (Multi-Stage Build)
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

# =============================================================================
# Stage 1: Builder - Install dependencies and build applications
# =============================================================================
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/workers/package.json ./apps/workers/
COPY apps/shared/package.json ./apps/shared/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/ ./apps/

# Generate Prisma client
RUN cd apps/api && pnpm prisma generate

# Build all applications
RUN pnpm run build

# =============================================================================
# Stage 2: Production Dependencies
# =============================================================================
FROM node:20-slim AS prod-deps

RUN npm install -g pnpm@9

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/workers/package.json ./apps/workers/
COPY apps/shared/package.json ./apps/shared/

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# =============================================================================
# Stage 3: Runner - Final image with only built artifacts
# =============================================================================
FROM ubuntu:22.04 AS runner

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
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Install Node.js 20 (runtime only, no build tools needed)
# =============================================================================
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

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
# Copy built applications from builder stage
# =============================================================================
WORKDIR /app

# Copy production node_modules first
COPY --from=prod-deps /app/node_modules ./node_modules

# Overlay Prisma-generated client from builder (generated client files)
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma ./node_modules/.pnpm/@prisma+client*/node_modules/.prisma

# Copy shared package (built)
COPY --from=builder /app/apps/shared/dist ./apps/shared/dist
COPY --from=builder /app/apps/shared/package.json ./apps/shared/

# Copy API (built only)
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Copy Web (Next.js standalone build)
COPY --from=builder /app/apps/web/.next/standalone ./apps/web-standalone
COPY --from=builder /app/apps/web/.next/static ./apps/web-standalone/apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web-standalone/apps/web/public

# Copy Workers (built only)
COPY --from=builder /app/apps/workers/dist ./apps/workers/dist
COPY --from=builder /app/apps/workers/package.json ./apps/workers/

# Copy Prisma CLI for migrations (from builder since it's a devDependency)
COPY --from=builder /app/node_modules/.pnpm/prisma*/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.pnpm/@prisma+engines*/node_modules/@prisma/engines ./node_modules/@prisma/engines

# Copy package.json files for workspace resolution
COPY package.json pnpm-workspace.yaml ./

# Create symlinks so apps can find node_modules from root
RUN ln -s /app/node_modules /app/apps/api/node_modules && \
    ln -s /app/node_modules /app/apps/workers/node_modules && \
    ln -s /app/node_modules /app/apps/shared/node_modules

# =============================================================================
# Copy initialization scripts and configuration
# =============================================================================
COPY infrastructure/clickhouse/init/init.sql /docker-entrypoint-initdb.d/clickhouse-init.sql
COPY docker/scripts/entrypoint.sh /entrypoint.sh
COPY docker/scripts/init-databases.sh /init-databases.sh
RUN chmod +x /entrypoint.sh /init-databases.sh

# Configure supervisord
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

# CORS: Allow all origins in single-container mode (frontend proxies to API)
ENV CORS_ORIGIN=*

# API URL for Next.js rewrites (internal, same container)
ENV API_URL=http://localhost:3001

# Public API URL for client-side requests (can be overridden for external access)
ENV NEXT_PUBLIC_API_URL=/api/v1

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
VOLUME ["/data"]

# =============================================================================
# Start all services
# =============================================================================
ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
