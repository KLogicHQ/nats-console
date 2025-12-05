import Redis from 'ioredis';
import { config } from '../config/index';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

// Session management
const SESSION_PREFIX = 'session:';
const SESSION_TTL = 24 * 60 * 60; // 24 hours

export interface SessionData {
  userId: string;
  orgId: string;
  email: string;
  role: string;
  permissions: string[];
  ipAddress: string;
  createdAt: string;
  lastActivity: string;
}

export async function setSession(sessionId: string, data: SessionData): Promise<void> {
  // Serialize permissions array to JSON string
  const serializedData = {
    ...data,
    permissions: JSON.stringify(data.permissions),
  };
  await redis.hset(`${SESSION_PREFIX}${sessionId}`, serializedData as Record<string, string>);
  await redis.expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL);
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const data = await redis.hgetall(`${SESSION_PREFIX}${sessionId}`);
  if (!data || Object.keys(data).length === 0) {
    return null;
  }
  return {
    ...data,
    permissions: JSON.parse(data.permissions || '[]'),
  } as SessionData;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
  await redis.hset(`${SESSION_PREFIX}${sessionId}`, 'lastActivity', new Date().toISOString());
  await redis.expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL);
}

// Rate limiting
const RATE_LIMIT_PREFIX = 'ratelimit:';

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `${RATE_LIMIT_PREFIX}${key}`;

  // Remove old entries
  await redis.zremrangebyscore(redisKey, 0, windowStart);

  // Count current entries
  const count = await redis.zcard(redisKey);

  if (count >= maxRequests) {
    const oldestEntry = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetAt = oldestEntry[1] ? parseInt(oldestEntry[1]) + windowMs : now + windowMs;
    return { allowed: false, remaining: 0, resetAt };
  }

  // Add new entry
  await redis.zadd(redisKey, now, `${now}-${Math.random()}`);
  await redis.pexpire(redisKey, windowMs);

  return { allowed: true, remaining: maxRequests - count - 1, resetAt: now + windowMs };
}

// Cluster status cache
const CLUSTER_STATUS_PREFIX = 'cluster:';
const CLUSTER_STATUS_TTL = 30; // 30 seconds

export interface ClusterStatusCache {
  status: string;
  serverCount: number;
  version: string;
  lastCheck: string;
}

export async function setClusterStatus(clusterId: string, data: ClusterStatusCache): Promise<void> {
  await redis.hset(`${CLUSTER_STATUS_PREFIX}${clusterId}:status`, data as Record<string, string>);
  await redis.expire(`${CLUSTER_STATUS_PREFIX}${clusterId}:status`, CLUSTER_STATUS_TTL);
}

export async function getClusterStatus(clusterId: string): Promise<ClusterStatusCache | null> {
  const data = await redis.hgetall(`${CLUSTER_STATUS_PREFIX}${clusterId}:status`);
  if (!data || Object.keys(data).length === 0) {
    return null;
  }
  return {
    ...data,
    serverCount: parseInt(data.serverCount || '0'),
  } as ClusterStatusCache;
}

// Permissions cache
const PERMISSIONS_PREFIX = 'permissions:';
const PERMISSIONS_TTL = 5 * 60; // 5 minutes

export async function setUserPermissions(userId: string, orgId: string, permissions: string[]): Promise<void> {
  const key = `${PERMISSIONS_PREFIX}${userId}:${orgId}`;
  await redis.del(key);
  if (permissions.length > 0) {
    await redis.sadd(key, ...permissions);
    await redis.expire(key, PERMISSIONS_TTL);
  }
}

export async function getUserPermissions(userId: string, orgId: string): Promise<string[] | null> {
  const key = `${PERMISSIONS_PREFIX}${userId}:${orgId}`;
  const permissions = await redis.smembers(key);
  if (permissions.length === 0) {
    return null; // Cache miss
  }
  return permissions;
}

export async function invalidateUserPermissions(userId: string, orgId: string): Promise<void> {
  await redis.del(`${PERMISSIONS_PREFIX}${userId}:${orgId}`);
}

// Pub/Sub for real-time metrics
const METRICS_CHANNEL = 'metrics';
const ALERTS_CHANNEL = 'alerts';

// Subscriber client for pub/sub (separate from main client)
let subscriber: Redis | null = null;
const messageHandlers = new Map<string, Set<(message: any) => void>>();

export function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        const handlers = messageHandlers.get(channel);
        handlers?.forEach((handler) => handler(data));
      } catch (err) {
        console.error('Failed to parse Redis message:', err);
      }
    });
  }
  return subscriber;
}

export function subscribeToChannel(channel: string, handler: (data: any) => void): () => void {
  const sub = getSubscriber();

  if (!messageHandlers.has(channel)) {
    messageHandlers.set(channel, new Set());
    sub.subscribe(channel);
  }

  messageHandlers.get(channel)!.add(handler);

  // Return unsubscribe function
  return () => {
    const handlers = messageHandlers.get(channel);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        sub.unsubscribe(channel);
        messageHandlers.delete(channel);
      }
    }
  };
}

export async function publishMetrics(data: any): Promise<void> {
  await redis.publish(METRICS_CHANNEL, JSON.stringify(data));
}

export async function publishAlert(data: any): Promise<void> {
  await redis.publish(ALERTS_CHANNEL, JSON.stringify(data));
}

export { METRICS_CHANNEL, ALERTS_CHANNEL };
