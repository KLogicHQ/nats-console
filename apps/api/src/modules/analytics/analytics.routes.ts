import type { FastifyPluginAsync } from 'fastify';
import { MetricsQuerySchema, AuditLogQuerySchema } from '@nats-console/shared';
import {
  queryStreamMetrics,
  queryConsumerMetrics,
  queryAuditLogs,
} from '../../lib/clickhouse.js';
import { authenticate } from '../../common/middleware/auth.js';

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /analytics/metrics - Query metrics
  fastify.get('/', async (request) => {
    const query = MetricsQuerySchema.parse(request.query);

    const from = new Date(query.from);
    const to = new Date(query.to);

    if (query.consumerName && query.streamName && query.clusterId) {
      const metrics = await queryConsumerMetrics(
        query.clusterId,
        query.streamName,
        query.consumerName,
        from,
        to,
        query.interval
      );
      return { metrics, type: 'consumer' };
    }

    if (query.streamName && query.clusterId) {
      const metrics = await queryStreamMetrics(
        query.clusterId,
        query.streamName,
        from,
        to,
        query.interval
      );
      return { metrics, type: 'stream' };
    }

    return { metrics: [], type: 'unknown' };
  });

  // GET /analytics/streams/:name/throughput - Stream throughput
  fastify.get<{
    Params: { name: string };
    Querystring: { clusterId: string; from: string; to: string; interval?: string };
  }>('/streams/:name/throughput', async (request) => {
    const { clusterId, from, to, interval } = request.query;

    const metrics = await queryStreamMetrics(
      clusterId,
      request.params.name,
      new Date(from),
      new Date(to),
      interval || '5m'
    );

    return {
      streamName: request.params.name,
      data: metrics.map((m) => ({
        timestamp: m.timestamp,
        messagesRate: m.messagesRate,
        bytesRate: m.bytesRate,
      })),
    };
  });

  // GET /analytics/consumers/:name/lag - Consumer lag
  fastify.get<{
    Params: { name: string };
    Querystring: {
      clusterId: string;
      streamName: string;
      from: string;
      to: string;
      interval?: string;
    };
  }>('/consumers/:name/lag', async (request) => {
    const { clusterId, streamName, from, to, interval } = request.query;

    const metrics = await queryConsumerMetrics(
      clusterId,
      streamName,
      request.params.name,
      new Date(from),
      new Date(to),
      interval || '5m'
    );

    return {
      consumerName: request.params.name,
      streamName,
      data: metrics.map((m) => ({
        timestamp: m.timestamp,
        lag: m.lag,
        pendingCount: m.pendingCount,
        ackRate: m.ackRate,
      })),
    };
  });

  // GET /analytics/cluster/overview - Cluster overview
  fastify.get<{ Querystring: { clusterId?: string } }>(
    '/cluster/overview',
    async (request) => {
      // TODO: Implement cluster overview metrics
      return {
        totalStreams: 0,
        totalConsumers: 0,
        totalMessages: 0,
        messageRate: 0,
        activeAlerts: 0,
      };
    }
  );
};
