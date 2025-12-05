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
import { inviteRoutes } from './modules/invites/invites.routes';
import { settingsRoutes } from './modules/settings/settings.routes';

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
await app.register(cors, {
  origin: config.NODE_ENV === 'development' ? true : config.CORS_ORIGIN.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

// Health check endpoint
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API version prefix
app.register(
  async (api) => {
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
    await api.register(inviteRoutes, { prefix: '/invites' });
    await api.register(settingsRoutes, { prefix: '/settings' });
  },
  { prefix: '/api/v1' }
);

// Global error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);

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

// Graceful shutdown
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully...`);

  await app.close();
  await disconnectAllClusters();
  await disconnectInternalNats();
  await closeClickHouseClient();
  await redis.quit();
  await disconnectDatabase();

  app.log.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Connect to databases
    await connectDatabase();
    app.log.info('PostgreSQL connected');

    // Connect to internal NATS
    await connectInternalNats();

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
