# =============================================================================
# NATS Console Web - Multi-Stage Docker Build
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
COPY apps/web/package.json ./apps/web/
COPY apps/shared/package.json ./apps/shared/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/shared ./apps/shared
COPY apps/web ./apps/web

# Build packages
RUN pnpm --filter @nats-console/shared build
RUN pnpm --filter @nats-console/web build

# =============================================================================
# Stage 2: Runner - Final production image
# =============================================================================
# Next.js standalone output includes all dependencies, no need for prod-deps stage
FROM node:20-alpine AS runner

WORKDIR /app

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy Next.js standalone build (includes node_modules)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Set correct ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
