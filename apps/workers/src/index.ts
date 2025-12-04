import pino from 'pino';
import cron from 'node-cron';
import { MetricsCollector } from './collectors/metrics.js';
import { AlertProcessor } from './processors/alerts.js';
import { config } from './config.js';

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

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down...`);

  await metricsCollector.stop();
  await alertProcessor.stop();

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

    // Schedule cleanup job daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      logger.info('Running cleanup job...');
      // TODO: Implement cleanup (expired sessions, old data archival)
    });

    logger.info('All workers started successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to start workers');
    process.exit(1);
  }
}

start();
