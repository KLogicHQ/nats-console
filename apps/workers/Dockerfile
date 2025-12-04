# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/workers/package.json ./apps/workers/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/workers ./apps/workers

# Build packages
RUN pnpm --filter @nats-console/shared build
RUN pnpm --filter @nats-console/workers build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built application
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/workers/package.json ./apps/workers/
COPY --from=builder /app/apps/workers/dist ./apps/workers/dist
COPY --from=builder /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/apps/workers

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
