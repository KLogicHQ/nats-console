import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import { config } from './config/index';
import { connectDatabase, disconnectDatabase } from './lib/prisma';
import { redis } from './lib/redis';
import { connectInternalNats, disconnectInternalNats, disconnectAllClusters } from './lib/nats';
import { closeClickHouseClient } from './lib/clickhouse';
import { setupWebSocket } from './lib/websocket';

// Import routes
import { authRoutes } from './modules/auth/auth.routes';
import { clusterRoutes } from './modules/clusters/clusters.routes';
import { streamRoutes } from './modules/streams/streams.routes';
import { consumerRoutes } from './modules/consumers/consumers.routes';
import { organizationRoutes } from './modules/organizations/organizations.routes';
import { userRoutes } from './modules/users/users.routes';
import { teamRoutes } from './modules/teams/teams.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { alertRoutes } from './modules/alerts/alerts.routes';
import { dashboardRoutes } from './modules/dashboards/dashboards.routes';
import { savedQueryRoutes } from './modules/saved-queries/saved-queries.routes';
import { inviteRoutes } from './modules/invites/invites.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { auditRoutes } from './modules/audit/audit.routes';
import { dlqRoutes } from './modules/dlq/dlq.routes';
import { auditPlugin } from './common/middleware/audit';
import { ipAllowlistMiddleware } from './common/middleware/ip-allowlist';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
    transport:
      config.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

// Register plugins
// CORS configuration:
// - Development: allow all origins
// - Production with '*': allow all origins (single-container mode)
// - Production with specific origins: only allow listed origins
const getCorsOrigin = () => {
  if (config.NODE_ENV === 'development') return true;
  if (config.CORS_ORIGIN === '*') return true;
  return config.CORS_ORIGIN.split(',').map(o => o.trim());
};

await app.register(cors, {
  origin: getCorsOrigin(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

await app.register(helmet, {
  contentSecurityPolicy: false, // Disable for API
});

// Only enable rate limiting in production
if (config.NODE_ENV !== 'development') {
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
  });
}

await app.register(sensible);

await app.register(websocket, {
  options: {
    maxPayload: 1048576, // 1MB
  },
});

// Health check endpoints
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: Record<string, { status: 'up' | 'down'; latency?: number; message?: string }>;
}

const startTime = Date.now();

// Check individual service health
async function checkPostgres(): Promise<{ status: 'up' | 'down'; latency: number; message?: string }> {
  const start = Date.now();
  try {
    const { prisma } = await import('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'up', latency: Date.now() - start };
  } catch (err) {
    return { status: 'down', latency: Date.now() - start, message: (err as Error).message };
  }
}

async function checkRedis(): Promise<{ status: 'up' | 'down'; latency: number; message?: string }> {
  const start = Date.now();
  try {
    const result = await redis.ping();
    return { status: result === 'PONG' ? 'up' : 'down', latency: Date.now() - start };
  } catch (err) {
    return { status: 'down', latency: Date.now() - start, message: (err as Error).message };
  }
}

async function checkClickHouse(): Promise<{ status: 'up' | 'down'; latency: number; message?: string }> {
  const start = Date.now();
  try {
    const { getClickHouseClient } = await import('./lib/clickhouse');
    const client = getClickHouseClient();
    await client.query({ query: 'SELECT 1', format: 'JSONEachRow' });
    return { status: 'up', latency: Date.now() - start };
  } catch (err) {
    return { status: 'down', latency: Date.now() - start, message: (err as Error).message };
  }
}

async function checkNats(): Promise<{ status: 'up' | 'down'; latency: number; message?: string }> {
  const start = Date.now();
  try {
    const { getInternalNatsConnection } = await import('./lib/nats');
    const nc = getInternalNatsConnection();
    if (nc && !nc.isClosed()) {
      return { status: 'up', latency: Date.now() - start };
    }
    return { status: 'down', latency: Date.now() - start, message: 'NATS connection not available' };
  } catch (err) {
    return { status: 'down', latency: Date.now() - start, message: (err as Error).message };
  }
}

// Basic health check - returns ok if server is responding
app.get('/health', async (): Promise<HealthCheckResult> => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.5.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
});

// Liveness probe - just confirms the server is alive
app.get('/health/live', async () => {
  return { status: 'alive', timestamp: new Date().toISOString() };
});

// Readiness probe - checks all dependencies
app.get('/health/ready', async (): Promise<HealthCheckResult> => {
  const [postgres, redisCheck, clickhouse, nats] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkClickHouse(),
    checkNats(),
  ]);

  const checks = { postgres, redis: redisCheck, clickhouse, nats };
  const allHealthy = Object.values(checks).every((c) => c.status === 'up');
  const anyHealthy = Object.values(checks).some((c) => c.status === 'up');

  return {
    status: allHealthy ? 'healthy' : anyHealthy ? 'degraded' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.5.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };
});

// API version prefix
app.register(
  async (api) => {
    // Register audit logging middleware
    await api.register(auditPlugin);

    // Register IP allowlist middleware (runs after authentication)
    api.addHook('preHandler', ipAllowlistMiddleware);

    // Register all routes
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(organizationRoutes, { prefix: '/organizations' });
    await api.register(userRoutes, { prefix: '/users' });
    await api.register(teamRoutes, { prefix: '/teams' });
    await api.register(clusterRoutes, { prefix: '/clusters' });
    await api.register(streamRoutes, { prefix: '/clusters' });
    await api.register(consumerRoutes, { prefix: '/clusters' });
    await api.register(analyticsRoutes, { prefix: '/analytics' });
    await api.register(alertRoutes, { prefix: '/alerts' });
    await api.register(dashboardRoutes, { prefix: '/dashboards' });
    await api.register(savedQueryRoutes, { prefix: '/saved-queries' });
    await api.register(inviteRoutes, { prefix: '/invites' });
    await api.register(settingsRoutes, { prefix: '/settings' });
    await api.register(auditRoutes, { prefix: '/audit' });
    await api.register(dlqRoutes, { prefix: '/dlq' });
  },
  { prefix: '/api/v1' }
);

// Global error handler
app.setErrorHandler((error: Error & { statusCode?: number; code?: string; issues?: unknown[] }, request, reply) => {
  app.log.error(error);

  // Handle Zod validation errors
  if (error.name === 'ZodError' && Array.isArray(error.issues)) {
    const messages = error.issues.map((issue: { path?: (string | number)[]; message?: string }) => {
      const path = issue.path?.join('.') || '';
      return path ? `${path}: ${issue.message}` : issue.message;
    });
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: messages.join('. '),
        details: error.issues,
      },
    });
  }

  // Handle AppError and its subclasses
  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Internal Server Error' : error.message;

  reply.status(statusCode).send({
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message,
      ...(config.NODE_ENV === 'development' && { stack: error.stack }),
    },
  });
});

// Graceful shutdown with timeout
const SHUTDOWN_TIMEOUT = 30000; // 30 seconds
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    app.log.warn('Shutdown already in progress...');
    return;
  }
  isShuttingDown = true;

  app.log.info(`Received ${signal}, shutting down gracefully...`);

  // Set a force shutdown timeout
  const forceShutdownTimer = setTimeout(() => {
    app.log.error('Graceful shutdown timed out, forcing exit...');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  try {
    // Close HTTP server first (stops accepting new requests)
    app.log.info('Closing HTTP server...');
    await app.close();

    // Disconnect from external services
    app.log.info('Disconnecting NATS clusters...');
    await disconnectAllClusters();

    app.log.info('Disconnecting internal NATS...');
    await disconnectInternalNats();

    app.log.info('Closing ClickHouse connection...');
    await closeClickHouseClient();

    app.log.info('Closing Redis connection...');
    await redis.quit();

    app.log.info('Disconnecting PostgreSQL...');
    await disconnectDatabase();

    clearTimeout(forceShutdownTimer);
    app.log.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during shutdown');
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err: Error) => {
  app.log.error({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason: unknown) => {
  app.log.error({ reason }, 'Unhandled rejection');
  shutdown('unhandledRejection');
});

// Start server
async function start() {
  try {
    // Connect to databases
    await connectDatabase();
    app.log.info('PostgreSQL connected');

    // Connect to internal NATS
    await connectInternalNats();

    // Setup WebSocket server
    setupWebSocket(app);
    app.log.info('WebSocket server ready at /ws');

    // Start HTTP server
    await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    app.log.info(`Server running at http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
