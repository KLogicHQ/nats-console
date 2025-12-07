# =============================================================================
# NATS Console API - Multi-Stage Docker Build
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
COPY apps/api/package.json ./apps/api/
COPY apps/shared/package.json ./apps/shared/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/shared ./apps/shared
COPY apps/api ./apps/api

# Generate Prisma client
RUN pnpm --filter @nats-console/api prisma generate

# Build packages
RUN pnpm --filter @nats-console/shared build
RUN pnpm --filter @nats-console/api build

# =============================================================================
# Stage 2: Production Dependencies
# =============================================================================
FROM node:20-alpine AS prod-deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
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

# Copy API (built artifacts only)
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Copy Prisma generated client
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma ./node_modules/.pnpm/@prisma+client*/node_modules/.prisma

# Copy workspace config for module resolution
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
