import {
  connect,
  NatsConnection,
  JetStreamManager,
  JetStreamClient,
  StreamInfo,
  ConsumerInfo,
  StreamConfig as NatsStreamConfig,
  ConsumerConfig as NatsConsumerConfig,
  PubAck,
  JsMsg,
  StoredMsg,
  RetentionPolicy,
  StorageType,
} from 'nats';
import { config } from '../config/index';
import type { EncryptedCredentials, TlsConfig } from '@nats-console/shared';

// Connection pool for managed clusters
const connectionPool = new Map<string, NatsConnection>();
const jsmPool = new Map<string, JetStreamManager>();
const jsPool = new Map<string, JetStreamClient>();

// Internal NATS connection for job queues
let internalNc: NatsConnection | null = null;
let internalJsm: JetStreamManager | null = null;
let internalJs: JetStreamClient | null = null;

// ==================== Internal NATS (Job Queues) ====================

export async function connectInternalNats(): Promise<void> {
  if (internalNc) return;

  internalNc = await connect({
    servers: config.NATS_URL,
    name: 'nats-console-api',
  });

  internalJsm = await internalNc.jetstreamManager();
  internalJs = internalNc.jetstream();

  console.log('Internal NATS connected');

  // Setup internal streams for job queues
  await setupInternalStreams();
}

export async function disconnectInternalNats(): Promise<void> {
  if (internalNc) {
    await internalNc.drain();
    internalNc = null;
    internalJsm = null;
    internalJs = null;
  }
}

export function getInternalJetStream(): JetStreamClient {
  if (!internalJs) {
    throw new Error('Internal NATS not connected');
  }
  return internalJs;
}

export function getInternalNatsConnection(): NatsConnection | null {
  return internalNc;
}

export function getInternalJetStreamManager(): JetStreamManager {
  if (!internalJsm) {
    throw new Error('Internal NATS not connected');
  }
  return internalJsm;
}

async function setupInternalStreams(): Promise<void> {
  if (!internalJsm) return;

  const streams = [
    {
      name: 'JOBS_METRICS',
      subjects: ['jobs.metrics.>'],
      retention: 'workqueue' as const,
      maxAge: 24 * 60 * 60 * 1000000000, // 24 hours in ns
    },
    {
      name: 'JOBS_ALERTS',
      subjects: ['jobs.alerts.>'],
      retention: 'workqueue' as const,
      maxAge: 24 * 60 * 60 * 1000000000,
    },
    {
      name: 'JOBS_AUDIT',
      subjects: ['jobs.audit.>'],
      retention: 'workqueue' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000000000, // 7 days
    },
    {
      name: 'EVENTS',
      subjects: ['events.>'],
      retention: 'limits' as const,
      maxAge: 60 * 60 * 1000000000, // 1 hour
      maxMsgs: 10000,
    },
  ];

  for (const stream of streams) {
    try {
      await internalJsm.streams.info(stream.name);
    } catch {
      await internalJsm.streams.add({
        name: stream.name,
        subjects: stream.subjects,
        retention: stream.retention === 'workqueue' ? RetentionPolicy.Workqueue : RetentionPolicy.Limits,
        max_age: stream.maxAge,
        max_msgs: stream.maxMsgs,
        storage: StorageType.File,
        num_replicas: 1,
      });
      console.log(`Created internal stream: ${stream.name}`);
    }
  }
}

// ==================== Managed Cluster Connections ====================

export async function connectCluster(
  clusterId: string,
  serverUrl: string,
  credentials?: EncryptedCredentials | null,
  tlsConfig?: TlsConfig | null
): Promise<NatsConnection> {
  // Close existing connection if any
  await disconnectCluster(clusterId);

  const options: Record<string, unknown> = {
    servers: serverUrl,
    name: `nats-console-${clusterId}`,
  };

  // Apply credentials
  if (credentials) {
    if (credentials.token) {
      options.token = credentials.token;
    }
    if (credentials.username && credentials.password) {
      options.user = credentials.username;
      options.pass = credentials.password;
    }
    if (credentials.nkey) {
      // NKey authentication requires special handling
      options.authenticator = credentials.nkey;
    }
  }

  // Apply TLS config
  if (tlsConfig?.enabled) {
    options.tls = {
      rejectUnauthorized: !tlsConfig.skipVerify,
    };
  }

  const nc = await connect(options);
  connectionPool.set(clusterId, nc);

  const jsm = await nc.jetstreamManager();
  jsmPool.set(clusterId, jsm);

  const js = nc.jetstream();
  jsPool.set(clusterId, js);

  console.log(`Connected to cluster: ${clusterId}`);
  return nc;
}

export async function disconnectCluster(clusterId: string): Promise<void> {
  const nc = connectionPool.get(clusterId);
  if (nc) {
    await nc.drain();
    connectionPool.delete(clusterId);
    jsmPool.delete(clusterId);
    jsPool.delete(clusterId);
    console.log(`Disconnected from cluster: ${clusterId}`);
  }
}

export async function disconnectAllClusters(): Promise<void> {
  const clusterIds = Array.from(connectionPool.keys());
  await Promise.all(clusterIds.map((id) => disconnectCluster(id)));
}

export function getClusterConnection(clusterId: string): NatsConnection {
  const nc = connectionPool.get(clusterId);
  if (!nc) {
    throw new Error(`Cluster ${clusterId} not connected`);
  }
  return nc;
}

export function getClusterJetStreamManager(clusterId: string): JetStreamManager {
  const jsm = jsmPool.get(clusterId);
  if (!jsm) {
    throw new Error(`Cluster ${clusterId} not connected`);
  }
  return jsm;
}

export function getClusterJetStream(clusterId: string): JetStreamClient {
  const js = jsPool.get(clusterId);
  if (!js) {
    throw new Error(`Cluster ${clusterId} not connected`);
  }
  return js;
}

export function isClusterConnected(clusterId: string): boolean {
  return connectionPool.has(clusterId);
}

// ==================== Stream Operations ====================

export async function listStreams(clusterId: string): Promise<StreamInfo[]> {
  const jsm = getClusterJetStreamManager(clusterId);
  const streams: StreamInfo[] = [];

  for await (const si of jsm.streams.list()) {
    streams.push(si);
  }

  return streams;
}

export async function getStreamInfo(clusterId: string, streamName: string): Promise<StreamInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.streams.info(streamName);
}

export async function createStream(clusterId: string, config: Partial<NatsStreamConfig>): Promise<StreamInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.streams.add(config);
}

export async function updateStream(clusterId: string, config: Partial<NatsStreamConfig>): Promise<StreamInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.streams.update(config.name!, config);
}

export async function deleteStream(clusterId: string, streamName: string): Promise<boolean> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.streams.delete(streamName);
}

export async function purgeStream(
  clusterId: string,
  streamName: string,
  options?: { filter?: string; seq?: number; keep?: number }
): Promise<{ purged: number }> {
  const jsm = getClusterJetStreamManager(clusterId);
  // Build purge options based on what's provided
  let purgeOpts: { filter?: string; seq?: number; keep?: number } | undefined;
  if (options) {
    if (options.keep !== undefined) {
      purgeOpts = { filter: options.filter, keep: options.keep };
    } else if (options.seq !== undefined) {
      purgeOpts = { filter: options.filter, seq: options.seq };
    } else if (options.filter) {
      purgeOpts = { filter: options.filter };
    }
  }
  const result = await jsm.streams.purge(streamName, purgeOpts as any);
  return { purged: result.purged };
}

// ==================== Consumer Operations ====================

export async function listConsumers(clusterId: string, streamName: string): Promise<ConsumerInfo[]> {
  const jsm = getClusterJetStreamManager(clusterId);
  const consumers: ConsumerInfo[] = [];

  for await (const ci of jsm.consumers.list(streamName)) {
    consumers.push(ci);
  }

  return consumers;
}

export async function getConsumerInfo(
  clusterId: string,
  streamName: string,
  consumerName: string
): Promise<ConsumerInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.consumers.info(streamName, consumerName);
}

export async function createConsumer(
  clusterId: string,
  streamName: string,
  config: Partial<NatsConsumerConfig>
): Promise<ConsumerInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.consumers.add(streamName, config);
}

export async function updateConsumer(
  clusterId: string,
  streamName: string,
  config: Partial<NatsConsumerConfig>
): Promise<ConsumerInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.consumers.update(streamName, config.durable_name || config.name!, config);
}

export async function deleteConsumer(clusterId: string, streamName: string, consumerName: string): Promise<boolean> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.consumers.delete(streamName, consumerName);
}

export async function pauseConsumer(
  clusterId: string,
  streamName: string,
  consumerName: string,
  pauseUntil?: Date
): Promise<ConsumerInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  // Get current consumer info
  const consumer = await jsm.consumers.info(streamName, consumerName);

  // Update with pause_until set to a future time
  const until = pauseUntil || new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years if no time specified
  return jsm.consumers.update(streamName, consumerName, {
    ...consumer.config,
    pause_until: until,
  } as any);
}

export async function resumeConsumer(
  clusterId: string,
  streamName: string,
  consumerName: string
): Promise<ConsumerInfo> {
  const jsm = getClusterJetStreamManager(clusterId);
  // Get current consumer info
  const consumer = await jsm.consumers.info(streamName, consumerName);

  // Update with pause_until removed (set to epoch/past time)
  return jsm.consumers.update(streamName, consumerName, {
    ...consumer.config,
    pause_until: undefined,
  } as any);
}

// ==================== Message Operations ====================

export async function publishMessage(
  clusterId: string,
  subject: string,
  data: Uint8Array | string,
  headers?: Record<string, string>
): Promise<PubAck> {
  const js = getClusterJetStream(clusterId);

  const msgHeaders = headers
    ? Object.entries(headers).reduce((h, [k, v]) => {
        h.set(k, v);
        return h;
      }, new Map<string, string>())
    : undefined;

  return js.publish(subject, typeof data === 'string' ? new TextEncoder().encode(data) : data, {
    headers: msgHeaders as any,
  });
}

export async function getMessage(
  clusterId: string,
  streamName: string,
  sequence: number
): Promise<StoredMsg | null> {
  const jsm = getClusterJetStreamManager(clusterId);
  try {
    return await jsm.streams.getMessage(streamName, { seq: sequence });
  } catch {
    return null;
  }
}

export async function getMessages(
  clusterId: string,
  streamName: string,
  options: { startSeq?: number; limit?: number; subject?: string }
): Promise<StoredMsg[]> {
  const jsm = getClusterJetStreamManager(clusterId);
  const messages: StoredMsg[] = [];
  const { startSeq = 1, limit = 100, subject } = options;

  let seq = startSeq;
  let count = 0;

  while (count < limit) {
    try {
      // Build request options - next_by_subj is a valid option but may not be in type definitions
      const requestOpts: { seq: number; next_by_subj?: string } = { seq };
      if (subject) {
        requestOpts.next_by_subj = subject;
      }
      const msg = await jsm.streams.getMessage(streamName, requestOpts as any);
      if (msg) {
        messages.push(msg);
        count++;
        seq = msg.seq + 1;
      } else {
        break;
      }
    } catch {
      // No more messages or error
      break;
    }
  }

  return messages;
}

export async function deleteMessage(clusterId: string, streamName: string, sequence: number): Promise<boolean> {
  const jsm = getClusterJetStreamManager(clusterId);
  return jsm.streams.deleteMessage(streamName, sequence);
}

// ==================== Health Check ====================

export async function checkClusterHealth(clusterId: string): Promise<{
  connected: boolean;
  rtt?: number;
  serverInfo?: {
    serverId: string;
    serverName: string;
    version: string;
    jetstream: boolean;
  };
}> {
  try {
    const nc = getClusterConnection(clusterId);
    const start = Date.now();
    await nc.flush();
    const rtt = Date.now() - start;

    const info = nc.info;
    return {
      connected: true,
      rtt,
      serverInfo: info
        ? {
            serverId: info.server_id,
            serverName: info.server_name,
            version: info.version,
            jetstream: info.jetstream || false,
          }
        : undefined,
    };
  } catch {
    return { connected: false };
  }
}

// ==================== JetStream Account Info ====================

export async function getJetStreamAccountInfo(clusterId: string): Promise<{
  streams: number;
  consumers: number;
  messages: number;
  bytes: number;
  limits?: {
    maxMemory: number;
    maxStorage: number;
    maxStreams: number;
    maxConsumers: number;
  };
} | null> {
  try {
    const jsm = getClusterJetStreamManager(clusterId);
    const info = await jsm.getAccountInfo();
    return {
      streams: info.streams || 0,
      consumers: info.consumers || 0,
      messages: info.api?.total || 0,
      bytes: info.memory + info.storage,
      limits: {
        maxMemory: info.limits.max_memory,
        maxStorage: info.limits.max_storage,
        maxStreams: info.limits.max_streams,
        maxConsumers: info.limits.max_consumers,
      },
    };
  } catch {
    return null;
  }
}

// ==================== KV Store Operations ====================

export async function listKvStores(clusterId: string): Promise<string[]> {
  const jsm = getClusterJetStreamManager(clusterId);
  const stores: string[] = [];

  for await (const si of jsm.streams.list()) {
    if (si.config.name.startsWith('KV_')) {
      stores.push(si.config.name.slice(3)); // Remove 'KV_' prefix
    }
  }

  return stores;
}

export async function getKvStore(clusterId: string, bucket: string) {
  const js = getClusterJetStream(clusterId);
  return js.views.kv(bucket);
}

// ==================== Object Store Operations ====================

export async function listObjectStores(clusterId: string): Promise<string[]> {
  const jsm = getClusterJetStreamManager(clusterId);
  const stores: string[] = [];

  for await (const si of jsm.streams.list()) {
    if (si.config.name.startsWith('OBJ_')) {
      stores.push(si.config.name.slice(4)); // Remove 'OBJ_' prefix
    }
  }

  return stores;
}

export async function getObjectStore(clusterId: string, bucket: string) {
  const js = getClusterJetStream(clusterId);
  return js.views.os(bucket);
}
