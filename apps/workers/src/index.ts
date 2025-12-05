import { createServer } from 'node:http';
import pino from 'pino';
import cron from 'node-cron';
import { MetricsCollector } from './collectors/metrics';
import { AlertProcessor } from './processors/alerts';
import { CleanupProcessor } from './processors/cleanup';
import { config } from './config';

const logger = pino({
  name: 'nats-console-workers',
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
});

const metricsCollector = new MetricsCollector();
const alertProcessor = new AlertProcessor();
const cleanupProcessor = new CleanupProcessor();

// Health check server
const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      workers: {
        metricsCollector: metricsCollector.isRunning(),
        alertProcessor: alertProcessor.isRunning(),
      },
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down...`);

  healthServer.close();
  await metricsCollector.stop();
  await alertProcessor.stop();
  await cleanupProcessor.close();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start workers
async function start(): Promise<void> {
  logger.info('Starting NATS Console Workers...');

  try {
    // Start metrics collector
    await metricsCollector.start();

    // Start alert processor
    await alertProcessor.start();

    // Schedule connection refresh every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      logger.info('Refreshing cluster connections...');
      await metricsCollector.refreshConnections();
    });

    // Schedule cleanup job every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      logger.info('Running cleanup job...');
      await cleanupProcessor.runCleanup();
    });

    // Run initial cleanup on startup
    await cleanupProcessor.runCleanup();

    // Start health server
    healthServer.listen(config.PORT, () => {
      logger.info(`Health server listening on http://localhost:${config.PORT}/health`);
    });

    logger.info('All workers started successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to start workers');
    process.exit(1);
  }
}

start();
