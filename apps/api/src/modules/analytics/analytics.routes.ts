import type { FastifyPluginAsync } from 'fastify';
import { MetricsQuerySchema, AuditLogQuerySchema } from '../../../../shared/src/index';
import {
  queryStreamMetrics,
  queryConsumerMetrics,
  queryAuditLogs,
  queryClusterOverview,
  queryOverviewMetrics,
} from '../../lib/clickhouse';
import { authenticate } from '../../common/middleware/auth';

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
      const { clusterId } = request.query;
      return queryClusterOverview(clusterId);
    }
  );

  // GET /analytics/overview - Overview metrics (alias for frontend compatibility)
  fastify.get<{ Querystring: { clusterId?: string; timeRange?: string } }>(
    '/overview',
    async (request) => {
      const { clusterId, timeRange } = request.query;
      return queryOverviewMetrics(clusterId, timeRange || '1h');
    }
  );

  // GET /analytics/charts/throughput - Throughput over time for charts
  fastify.get<{ Querystring: { clusterId: string; timeRange?: string } }>(
    '/charts/throughput',
    async (request) => {
      const { clusterId, timeRange = '24h' } = request.query;

      // Parse time range
      const rangeHours: Record<string, number> = {
        '1h': 1,
        '6h': 6,
        '24h': 24,
        '7d': 168,
        '30d': 720,
      };
      const hours = rangeHours[timeRange] || 24;
      const interval = hours <= 6 ? '5m' : hours <= 24 ? '15m' : hours <= 168 ? '1h' : '6h';

      const from = new Date(Date.now() - hours * 60 * 60 * 1000);
      const to = new Date();

      // Get all streams for the cluster
      const { prisma } = await import('../../lib/prisma');
      const streams = await prisma.stream.findMany({
        where: { clusterId },
        select: { name: true },
      });

      if (streams.length === 0) {
        return { data: [], interval };
      }

      // Query aggregated throughput for all streams
      const { getClickHouseClient } = await import('../../lib/clickhouse');
      const ch = getClickHouseClient();

      const intervalSeconds = interval === '5m' ? 300 : interval === '15m' ? 900 : interval === '1h' ? 3600 : 21600;

      try {
        const result = await ch.query({
          query: `
            SELECT
              toStartOfInterval(timestamp, INTERVAL ${intervalSeconds} SECOND) as time,
              sum(messages_rate) as messages_per_sec
            FROM stream_metrics
            WHERE cluster_id = {clusterId:UUID}
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}
            GROUP BY time
            ORDER BY time ASC
          `,
          query_params: {
            clusterId,
            from: from.toISOString(),
            to: to.toISOString(),
          },
          format: 'JSONEachRow',
        });

        const rows = (await result.json()) as Array<{ time: string; messages_per_sec: string }>;

        return {
          data: rows.map((row) => ({
            name: 'Throughput',
            value: Math.round(Number(row.messages_per_sec) * 100) / 100,
            time: new Date(row.time).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              ...(hours > 24 ? { month: 'short', day: 'numeric' } : {}),
            }),
          })),
          interval,
        };
      } catch {
        return { data: [], interval };
      }
    }
  );

  // GET /analytics/charts/consumer-lag - Consumer lag by consumer
  fastify.get<{ Querystring: { clusterId: string; timeRange?: string } }>(
    '/charts/consumer-lag',
    async (request) => {
      const { clusterId, timeRange = '24h' } = request.query;

      const rangeHours: Record<string, number> = {
        '1h': 1,
        '6h': 6,
        '24h': 24,
        '7d': 168,
        '30d': 720,
      };
      const hours = rangeHours[timeRange] || 24;

      const { getClickHouseClient } = await import('../../lib/clickhouse');
      const ch = getClickHouseClient();

      try {
        const result = await ch.query({
          query: `
            SELECT
              consumer_name as name,
              avg(pending_count) as pending
            FROM consumer_metrics
            WHERE cluster_id = {clusterId:UUID}
              AND timestamp >= now() - INTERVAL ${hours} HOUR
            GROUP BY consumer_name
            ORDER BY pending DESC
            LIMIT 10
          `,
          query_params: { clusterId },
          format: 'JSONEachRow',
        });

        const rows = (await result.json()) as Array<{ name: string; pending: string }>;

        return {
          data: rows.map((row) => ({
            name: row.name,
            value: Math.round(Number(row.pending)),
          })),
        };
      } catch {
        return { data: [] };
      }
    }
  );

  // GET /analytics/charts/stream-activity - Messages by stream over time
  fastify.get<{ Querystring: { clusterId: string; timeRange?: string } }>(
    '/charts/stream-activity',
    async (request) => {
      const { clusterId, timeRange = '24h' } = request.query;

      const rangeHours: Record<string, number> = {
        '1h': 1,
        '6h': 6,
        '24h': 24,
        '7d': 168,
        '30d': 720,
      };
      const hours = rangeHours[timeRange] || 24;
      const interval = hours <= 6 ? '5m' : hours <= 24 ? '15m' : hours <= 168 ? '1h' : '6h';
      const intervalSeconds = interval === '5m' ? 300 : interval === '15m' ? 900 : interval === '1h' ? 3600 : 21600;

      const from = new Date(Date.now() - hours * 60 * 60 * 1000);
      const to = new Date();

      const { getClickHouseClient } = await import('../../lib/clickhouse');
      const ch = getClickHouseClient();

      try {
        const result = await ch.query({
          query: `
            SELECT
              stream_name,
              toStartOfInterval(timestamp, INTERVAL ${intervalSeconds} SECOND) as time,
              avg(messages_rate) as messages_rate
            FROM stream_metrics
            WHERE cluster_id = {clusterId:UUID}
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}
            GROUP BY stream_name, time
            ORDER BY stream_name, time ASC
          `,
          query_params: {
            clusterId,
            from: from.toISOString(),
            to: to.toISOString(),
          },
          format: 'JSONEachRow',
        });

        const rows = (await result.json()) as Array<{
          stream_name: string;
          time: string;
          messages_rate: string;
        }>;

        // Group by stream
        const streams: Record<string, Array<{ time: string; value: number }>> = {};
        for (const row of rows) {
          if (!streams[row.stream_name]) {
            streams[row.stream_name] = [];
          }
          streams[row.stream_name].push({
            time: new Date(row.time).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              ...(hours > 24 ? { month: 'short', day: 'numeric' } : {}),
            }),
            value: Math.round(Number(row.messages_rate) * 100) / 100,
          });
        }

        return { streams, interval };
      } catch {
        return { streams: {}, interval };
      }
    }
  );
};
