import { createClient, ClickHouseClient } from '@clickhouse/client';
import { config } from '../config/index';
import type { StreamMetrics, ConsumerMetrics, ClusterMetrics, AuditLog } from '../../../shared/src/index';

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: config.CLICKHOUSE_URL,
      database: config.CLICKHOUSE_DATABASE,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
    });
  }
  return client;
}

export async function closeClickHouseClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

// ==================== Stream Metrics ====================

export async function insertStreamMetrics(metrics: StreamMetrics[]): Promise<void> {
  const ch = getClickHouseClient();
  await ch.insert({
    table: 'stream_metrics',
    values: metrics.map((m) => ({
      cluster_id: m.clusterId,
      stream_name: m.streamName,
      timestamp: m.timestamp.toISOString(),
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
}

export async function queryStreamMetrics(
  clusterId: string,
  streamName: string,
  from: Date,
  to: Date,
  interval: string = '5m'
): Promise<StreamMetrics[]> {
  const ch = getClickHouseClient();
  const intervalSeconds = parseInterval(interval);

  const result = await ch.query({
    query: `
      SELECT
        cluster_id,
        stream_name,
        toStartOfInterval(timestamp, INTERVAL ${intervalSeconds} SECOND) as timestamp,
        avg(messages_total) as messages_total,
        avg(bytes_total) as bytes_total,
        avg(messages_rate) as messages_rate,
        avg(bytes_rate) as bytes_rate,
        avg(consumer_count) as consumer_count,
        min(first_seq) as first_seq,
        max(last_seq) as last_seq,
        arrayDistinct(flatten(groupArray(subjects))) as subjects
      FROM stream_metrics
      WHERE cluster_id = {clusterId:UUID}
        AND stream_name = {streamName:String}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
      GROUP BY cluster_id, stream_name, timestamp
      ORDER BY timestamp ASC
    `,
    query_params: {
      clusterId,
      streamName,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    format: 'JSONEachRow',
  });

  const rows = await result.json<any[]>();
  return rows.map((row) => ({
    clusterId: row.cluster_id,
    streamName: row.stream_name,
    timestamp: new Date(row.timestamp),
    messagesTotal: Number(row.messages_total),
    bytesTotal: Number(row.bytes_total),
    messagesRate: Number(row.messages_rate),
    bytesRate: Number(row.bytes_rate),
    consumerCount: Number(row.consumer_count),
    firstSeq: Number(row.first_seq),
    lastSeq: Number(row.last_seq),
    subjects: row.subjects || [],
  }));
}

// ==================== Consumer Metrics ====================

export async function insertConsumerMetrics(metrics: ConsumerMetrics[]): Promise<void> {
  const ch = getClickHouseClient();
  await ch.insert({
    table: 'consumer_metrics',
    values: metrics.map((m) => ({
      cluster_id: m.clusterId,
      stream_name: m.streamName,
      consumer_name: m.consumerName,
      timestamp: m.timestamp.toISOString(),
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
}

export async function queryConsumerMetrics(
  clusterId: string,
  streamName: string,
  consumerName: string,
  from: Date,
  to: Date,
  interval: string = '5m'
): Promise<ConsumerMetrics[]> {
  const ch = getClickHouseClient();
  const intervalSeconds = parseInterval(interval);

  const result = await ch.query({
    query: `
      SELECT
        cluster_id,
        stream_name,
        consumer_name,
        toStartOfInterval(timestamp, INTERVAL ${intervalSeconds} SECOND) as timestamp,
        avg(pending_count) as pending_count,
        avg(ack_pending) as ack_pending,
        sum(redelivered) as redelivered,
        avg(waiting) as waiting,
        avg(delivered_rate) as delivered_rate,
        avg(ack_rate) as ack_rate,
        avg(lag) as lag
      FROM consumer_metrics
      WHERE cluster_id = {clusterId:UUID}
        AND stream_name = {streamName:String}
        AND consumer_name = {consumerName:String}
        AND timestamp >= {from:DateTime64(3)}
        AND timestamp <= {to:DateTime64(3)}
      GROUP BY cluster_id, stream_name, consumer_name, timestamp
      ORDER BY timestamp ASC
    `,
    query_params: {
      clusterId,
      streamName,
      consumerName,
      from: from.toISOString(),
      to: to.toISOString(),
    },
    format: 'JSONEachRow',
  });

  const rows = await result.json<any[]>();
  return rows.map((row) => ({
    clusterId: row.cluster_id,
    streamName: row.stream_name,
    consumerName: row.consumer_name,
    timestamp: new Date(row.timestamp),
    pendingCount: Number(row.pending_count),
    ackPending: Number(row.ack_pending),
    redelivered: Number(row.redelivered),
    waiting: Number(row.waiting),
    deliveredRate: Number(row.delivered_rate),
    ackRate: Number(row.ack_rate),
    lag: Number(row.lag),
  }));
}

// ==================== Cluster Metrics ====================

export async function insertClusterMetrics(metrics: ClusterMetrics[]): Promise<void> {
  const ch = getClickHouseClient();
  await ch.insert({
    table: 'cluster_metrics',
    values: metrics.map((m) => ({
      cluster_id: m.clusterId,
      server_id: m.serverId,
      server_name: m.serverName,
      timestamp: m.timestamp.toISOString(),
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
}

// ==================== Audit Logs ====================

export async function insertAuditLog(log: Omit<AuditLog, 'id'>): Promise<void> {
  const ch = getClickHouseClient();
  await ch.insert({
    table: 'audit_logs',
    values: [
      {
        id: crypto.randomUUID(),
        org_id: log.orgId,
        user_id: log.userId,
        user_email: log.userEmail,
        timestamp: log.timestamp.toISOString(),
        action: log.action,
        resource_type: log.resourceType,
        resource_id: log.resourceId,
        resource_name: log.resourceName,
        cluster_id: log.clusterId,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        request_id: log.requestId,
        changes: log.changes,
        status: log.status,
        error_message: log.errorMessage,
      },
    ],
    format: 'JSONEachRow',
  });
}

export async function queryAuditLogs(
  orgId: string,
  options: {
    from?: Date;
    to?: Date;
    action?: string;
    resourceType?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ logs: AuditLog[]; total: number }> {
  const ch = getClickHouseClient();
  const { from, to, action, resourceType, userId, limit = 50, offset = 0 } = options;

  const conditions = ['org_id = {orgId:UUID}'];
  const params: Record<string, unknown> = { orgId };

  if (from) {
    conditions.push('timestamp >= {from:DateTime64(3)}');
    params.from = from.toISOString();
  }
  if (to) {
    conditions.push('timestamp <= {to:DateTime64(3)}');
    params.to = to.toISOString();
  }
  if (action) {
    conditions.push('action = {action:String}');
    params.action = action;
  }
  if (resourceType) {
    conditions.push('resource_type = {resourceType:String}');
    params.resourceType = resourceType;
  }
  if (userId) {
    conditions.push('user_id = {userId:UUID}');
    params.userId = userId;
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countResult = await ch.query({
    query: `SELECT count() as total FROM audit_logs WHERE ${whereClause}`,
    query_params: params,
    format: 'JSONEachRow',
  });
  const countRows = await countResult.json<{ total: string }[]>();
  const total = parseInt(countRows[0]?.total || '0');

  // Get logs
  const result = await ch.query({
    query: `
      SELECT *
      FROM audit_logs
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `,
    query_params: params,
    format: 'JSONEachRow',
  });

  const rows = await result.json<any[]>();
  const logs = rows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    userEmail: row.user_email,
    timestamp: new Date(row.timestamp),
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    clusterId: row.cluster_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    requestId: row.request_id,
    changes: row.changes,
    status: row.status,
    errorMessage: row.error_message,
  }));

  return { logs, total };
}

// ==================== Helpers ====================

function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(m|h|d)$/);
  if (!match) return 300; // Default 5 minutes

  const value = parseInt(match[1]!);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 300;
  }
}
