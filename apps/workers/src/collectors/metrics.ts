import { connect, NatsConnection, JetStreamManager } from 'nats';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { config } from '../config';
import type { StreamMetrics, ConsumerMetrics, ClusterMetrics } from '../../../shared/src/index';

const logger = pino({ name: 'metrics-collector' });

// Format timestamp for ClickHouse DateTime64(3)
function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

interface ClusterConnection {
  id: string;
  nc: NatsConnection;
  jsm: JetStreamManager;
  serverUrl: string;
}

export class MetricsCollector {
  private prisma: PrismaClient;
  private clickhouse: ClickHouseClient;
  private connections: Map<string, ClusterConnection> = new Map();
  private streamMetricsInterval: NodeJS.Timeout | null = null;
  private clusterMetricsInterval: NodeJS.Timeout | null = null;
  private previousStreamStats: Map<string, { messages: number; bytes: number; timestamp: number }> =
    new Map();

  constructor() {
    this.prisma = new PrismaClient();
    this.clickhouse = createClient({
      url: config.CLICKHOUSE_URL,
      database: config.CLICKHOUSE_DATABASE,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
    });
  }

  async start(): Promise<void> {
    logger.info('Starting metrics collector...');

    // Connect to all clusters
    await this.connectToClusters();

    // Start collecting metrics
    this.streamMetricsInterval = setInterval(
      () => this.collectStreamMetrics(),
      config.METRICS_INTERVAL_MS
    );

    this.clusterMetricsInterval = setInterval(
      () => this.collectClusterMetrics(),
      config.CLUSTER_METRICS_INTERVAL_MS
    );

    logger.info('Metrics collector started');
  }

  async stop(): Promise<void> {
    logger.info('Stopping metrics collector...');

    if (this.streamMetricsInterval) {
      clearInterval(this.streamMetricsInterval);
    }
    if (this.clusterMetricsInterval) {
      clearInterval(this.clusterMetricsInterval);
    }

    // Disconnect from all clusters
    for (const [id, conn] of this.connections) {
      try {
        await conn.nc.drain();
      } catch (err) {
        logger.error({ clusterId: id, err }, 'Error disconnecting from cluster');
      }
    }
    this.connections.clear();

    await this.clickhouse.close();
    await this.prisma.$disconnect();

    logger.info('Metrics collector stopped');
  }

  isRunning(): boolean {
    return this.streamMetricsInterval !== null || this.clusterMetricsInterval !== null;
  }

  private async connectToClusters(): Promise<void> {
    // Get all clusters with their connections
    const clusters = await this.prisma.natsCluster.findMany({
      where: { status: 'connected' },
      include: {
        connections: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    for (const cluster of clusters) {
      const connection = cluster.connections[0];
      if (!connection) continue;

      try {
        const nc = await connect({
          servers: connection.serverUrl,
          name: `metrics-collector-${cluster.id}`,
        });

        const jsm = await nc.jetstreamManager();

        this.connections.set(cluster.id, {
          id: cluster.id,
          nc,
          jsm,
          serverUrl: connection.serverUrl,
        });

        logger.info({ clusterId: cluster.id }, 'Connected to cluster');
      } catch (err) {
        logger.error({ clusterId: cluster.id, err }, 'Failed to connect to cluster');
      }
    }
  }

  private async collectStreamMetrics(): Promise<void> {
    const streamMetrics: StreamMetrics[] = [];
    const consumerMetrics: ConsumerMetrics[] = [];
    const timestamp = new Date();

    for (const [clusterId, conn] of this.connections) {
      try {
        // List all streams
        for await (const streamInfo of conn.jsm.streams.list()) {
          const streamName = streamInfo.config.name;
          const state = streamInfo.state;

          // Calculate rate
          const key = `${clusterId}:${streamName}`;
          const prev = this.previousStreamStats.get(key);
          const now = Date.now();

          let messagesRate = 0;
          let bytesRate = 0;

          if (prev) {
            const timeDiff = (now - prev.timestamp) / 1000; // seconds
            if (timeDiff > 0) {
              messagesRate = (state.messages - prev.messages) / timeDiff;
              bytesRate = (state.bytes - prev.bytes) / timeDiff;
            }
          }

          this.previousStreamStats.set(key, {
            messages: state.messages,
            bytes: state.bytes,
            timestamp: now,
          });

          streamMetrics.push({
            clusterId,
            streamName,
            timestamp,
            messagesTotal: state.messages,
            bytesTotal: state.bytes,
            messagesRate: Math.max(0, messagesRate),
            bytesRate: Math.max(0, bytesRate),
            consumerCount: state.consumer_count,
            firstSeq: state.first_seq,
            lastSeq: state.last_seq,
            subjects: streamInfo.config.subjects || [],
          });

          // Collect consumer metrics for this stream
          try {
            for await (const consumerInfo of conn.jsm.consumers.list(streamName)) {
              consumerMetrics.push({
                clusterId,
                streamName,
                consumerName: consumerInfo.name,
                timestamp,
                pendingCount: consumerInfo.num_pending,
                ackPending: consumerInfo.num_ack_pending,
                redelivered: consumerInfo.num_redelivered,
                waiting: consumerInfo.num_waiting,
                deliveredRate: 0, // TODO: Calculate from delivered sequence
                ackRate: 0, // TODO: Calculate from ack floor
                lag: consumerInfo.num_pending,
              });
            }
          } catch (err) {
            logger.error({ clusterId, streamName, err }, 'Error collecting consumer metrics');
          }
        }
      } catch (err) {
        logger.error({ clusterId, err }, 'Error collecting stream metrics');
      }
    }

    // Insert metrics into ClickHouse
    if (streamMetrics.length > 0) {
      try {
        await this.clickhouse.insert({
          table: 'stream_metrics',
          values: streamMetrics.map((m) => ({
            cluster_id: m.clusterId,
            stream_name: m.streamName,
            timestamp: formatTimestamp(m.timestamp),
            messages_total: m.messagesTotal,
            bytes_total: m.bytesTotal,
            messages_rate: m.messagesRate,
            bytes_rate: m.bytesRate,
            consumer_count: m.consumerCount,
            first_seq: m.firstSeq,
            last_seq: m.lastSeq,
            subjects: m.subjects,
          })),
          format: 'JSONEachRow',
        });

        logger.debug({ count: streamMetrics.length }, 'Inserted stream metrics');
      } catch (err) {
        logger.error({ err }, 'Error inserting stream metrics');
      }
    }

    if (consumerMetrics.length > 0) {
      try {
        await this.clickhouse.insert({
          table: 'consumer_metrics',
          values: consumerMetrics.map((m) => ({
            cluster_id: m.clusterId,
            stream_name: m.streamName,
            consumer_name: m.consumerName,
            timestamp: formatTimestamp(m.timestamp),
            pending_count: m.pendingCount,
            ack_pending: m.ackPending,
            redelivered: m.redelivered,
            waiting: m.waiting,
            delivered_rate: m.deliveredRate,
            ack_rate: m.ackRate,
            lag: m.lag,
          })),
          format: 'JSONEachRow',
        });

        logger.debug({ count: consumerMetrics.length }, 'Inserted consumer metrics');
      } catch (err) {
        logger.error({ err }, 'Error inserting consumer metrics');
      }
    }
  }

  private async collectClusterMetrics(): Promise<void> {
    const clusterMetrics: ClusterMetrics[] = [];
    const timestamp = new Date();

    for (const [clusterId, conn] of this.connections) {
      try {
        const info = conn.nc.info;
        if (!info) continue;

        // Get server stats via monitoring endpoint
        // For now, use basic info from connection
        clusterMetrics.push({
          clusterId,
          serverId: info.server_id,
          serverName: info.server_name,
          timestamp,
          cpuPercent: 0, // Need monitoring endpoint
          memoryBytes: 0,
          connections: 0,
          subscriptions: 0,
          slowConsumers: 0,
          inMsgs: 0,
          outMsgs: 0,
          inBytes: 0,
          outBytes: 0,
        });
      } catch (err) {
        logger.error({ clusterId, err }, 'Error collecting cluster metrics');
      }
    }

    if (clusterMetrics.length > 0) {
      try {
        await this.clickhouse.insert({
          table: 'cluster_metrics',
          values: clusterMetrics.map((m) => ({
            cluster_id: m.clusterId,
            server_id: m.serverId,
            server_name: m.serverName,
            timestamp: formatTimestamp(m.timestamp),
            cpu_percent: m.cpuPercent,
            memory_bytes: m.memoryBytes,
            connections: m.connections,
            subscriptions: m.subscriptions,
            slow_consumers: m.slowConsumers,
            in_msgs: m.inMsgs,
            out_msgs: m.outMsgs,
            in_bytes: m.inBytes,
            out_bytes: m.outBytes,
          })),
          format: 'JSONEachRow',
        });

        logger.debug({ count: clusterMetrics.length }, 'Inserted cluster metrics');
      } catch (err) {
        logger.error({ err }, 'Error inserting cluster metrics');
      }
    }
  }

  async refreshConnections(): Promise<void> {
    logger.info('Refreshing cluster connections...');

    // Get all clusters
    const clusters = await this.prisma.natsCluster.findMany({
      include: {
        connections: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    const activeClusterIds = new Set(clusters.map((c) => c.id));

    // Disconnect from removed clusters
    for (const [id, conn] of this.connections) {
      if (!activeClusterIds.has(id)) {
        try {
          await conn.nc.drain();
          this.connections.delete(id);
          logger.info({ clusterId: id }, 'Disconnected from removed cluster');
        } catch (err) {
          logger.error({ clusterId: id, err }, 'Error disconnecting from cluster');
        }
      }
    }

    // Connect to new clusters
    for (const cluster of clusters) {
      if (this.connections.has(cluster.id)) continue;

      const connection = cluster.connections[0];
      if (!connection) continue;

      try {
        const nc = await connect({
          servers: connection.serverUrl,
          name: `metrics-collector-${cluster.id}`,
        });

        const jsm = await nc.jetstreamManager();

        this.connections.set(cluster.id, {
          id: cluster.id,
          nc,
          jsm,
          serverUrl: connection.serverUrl,
        });

        logger.info({ clusterId: cluster.id }, 'Connected to new cluster');
      } catch (err) {
        logger.error({ clusterId: cluster.id, err }, 'Failed to connect to new cluster');
      }
    }
  }
}
