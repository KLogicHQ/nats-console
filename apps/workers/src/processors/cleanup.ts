import Redis from 'ioredis';
import pino from 'pino';
import { config } from '../config';

const logger = pino({ name: 'cleanup-processor' });

// Session cleanup settings
const SESSION_PREFIX = 'session:';
const SESSION_INACTIVITY_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

// Password reset token prefix
const PASSWORD_RESET_PREFIX = 'password_reset:';

// Rate limit prefix
const RATE_LIMIT_PREFIX = 'ratelimit:';

export class CleanupProcessor {
  private redis: Redis;
  private running = false;

  constructor() {
    this.redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });
  }

  async runCleanup(): Promise<void> {
    if (this.running) {
      logger.warn('Cleanup already running, skipping');
      return;
    }

    this.running = true;
    logger.info('Starting cleanup job...');

    try {
      const results = await Promise.all([
        this.cleanupInactiveSessions(),
        this.cleanupExpiredPasswordResets(),
        this.cleanupOldRateLimitData(),
      ]);

      const [sessions, resets, rateLimits] = results;

      logger.info(
        {
          sessionsDeleted: sessions,
          passwordResetsDeleted: resets,
          rateLimitsDeleted: rateLimits,
        },
        'Cleanup job completed'
      );
    } catch (err) {
      logger.error({ err }, 'Cleanup job failed');
    } finally {
      this.running = false;
    }
  }

  private async cleanupInactiveSessions(): Promise<number> {
    const now = Date.now();
    let deletedCount = 0;
    let cursor = '0';

    try {
      do {
        // Scan for session keys
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${SESSION_PREFIX}*`,
          'COUNT',
          100
        );
        cursor = nextCursor;

        for (const key of keys) {
          try {
            const lastActivity = await this.redis.hget(key, 'lastActivity');
            if (lastActivity) {
              const lastActivityTime = new Date(lastActivity).getTime();
              if (now - lastActivityTime > SESSION_INACTIVITY_THRESHOLD) {
                await this.redis.del(key);
                deletedCount++;
                logger.debug({ key }, 'Deleted inactive session');
              }
            }
          } catch (err) {
            logger.error({ err, key }, 'Error processing session key');
          }
        }
      } while (cursor !== '0');

      logger.info({ count: deletedCount }, 'Inactive sessions cleaned up');
      return deletedCount;
    } catch (err) {
      logger.error({ err }, 'Error scanning sessions');
      return deletedCount;
    }
  }

  private async cleanupExpiredPasswordResets(): Promise<number> {
    let deletedCount = 0;
    let cursor = '0';

    try {
      do {
        // Scan for password reset keys
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${PASSWORD_RESET_PREFIX}*`,
          'COUNT',
          100
        );
        cursor = nextCursor;

        for (const key of keys) {
          try {
            // Check if key still exists (may have been expired)
            const ttl = await this.redis.ttl(key);
            if (ttl === -2 || ttl === -1) {
              // Key doesn't exist or has no TTL, delete it
              await this.redis.del(key);
              deletedCount++;
              logger.debug({ key }, 'Deleted expired password reset token');
            }
          } catch (err) {
            logger.error({ err, key }, 'Error processing password reset key');
          }
        }
      } while (cursor !== '0');

      logger.info({ count: deletedCount }, 'Expired password resets cleaned up');
      return deletedCount;
    } catch (err) {
      logger.error({ err }, 'Error scanning password resets');
      return deletedCount;
    }
  }

  private async cleanupOldRateLimitData(): Promise<number> {
    let deletedCount = 0;
    let cursor = '0';
    const now = Date.now();
    // Rate limit window - clean up entries older than 1 hour
    const cleanupThreshold = now - 60 * 60 * 1000;

    try {
      do {
        // Scan for rate limit keys
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          `${RATE_LIMIT_PREFIX}*`,
          'COUNT',
          100
        );
        cursor = nextCursor;

        for (const key of keys) {
          try {
            // Remove old entries from sorted set
            const removed = await this.redis.zremrangebyscore(key, 0, cleanupThreshold);
            if (removed > 0) {
              deletedCount += removed;
              logger.debug({ key, removed }, 'Removed old rate limit entries');
            }

            // If the sorted set is now empty, delete the key
            const count = await this.redis.zcard(key);
            if (count === 0) {
              await this.redis.del(key);
              logger.debug({ key }, 'Deleted empty rate limit key');
            }
          } catch (err) {
            logger.error({ err, key }, 'Error processing rate limit key');
          }
        }
      } while (cursor !== '0');

      logger.info({ count: deletedCount }, 'Old rate limit entries cleaned up');
      return deletedCount;
    } catch (err) {
      logger.error({ err }, 'Error scanning rate limits');
      return deletedCount;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
    logger.info('Cleanup processor closed');
  }
}
