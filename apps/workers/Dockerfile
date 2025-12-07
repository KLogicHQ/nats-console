# =============================================================================
# NATS Console Workers - Multi-Stage Docker Build
# =============================================================================

# =============================================================================
# Stage 1: Builder - Install all dependencies and build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files for dependency caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/workers/package.json ./apps/workers/
COPY apps/shared/package.json ./apps/shared/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/shared ./apps/shared
COPY apps/workers ./apps/workers

# Build packages
RUN pnpm --filter @nats-console/shared build
RUN pnpm --filter @nats-console/workers build

# =============================================================================
# Stage 2: Production Dependencies
# =============================================================================
FROM node:20-alpine AS prod-deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workers/package.json ./apps/workers/
COPY apps/shared/package.json ./apps/shared/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# =============================================================================
# Stage 3: Runner - Final production image
# =============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Copy production node_modules
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy shared package (built)
COPY --from=builder /app/apps/shared/dist ./apps/shared/dist
COPY --from=builder /app/apps/shared/package.json ./apps/shared/

# Copy Workers (built artifacts only)
COPY --from=builder /app/apps/workers/dist ./apps/workers/dist
COPY --from=builder /app/apps/workers/package.json ./apps/workers/

# Copy workspace config for module resolution
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/workers

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
