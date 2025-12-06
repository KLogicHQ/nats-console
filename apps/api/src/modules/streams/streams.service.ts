import { prisma } from '../../lib/prisma';
import {
  listStreams as natsListStreams,
  getStreamInfo as natsGetStreamInfo,
  createStream as natsCreateStream,
  updateStream as natsUpdateStream,
  deleteStream as natsDeleteStream,
  purgeStream as natsPurgeStream,
  getMessages as natsGetMessages,
  getMessage as natsGetMessage,
  publishMessage as natsPublishMessage,
  deleteMessage as natsDeleteMessage,
} from '../../lib/nats';
import { NotFoundError } from '@nats-console/shared';
import type {
  StreamInfo,
  StreamMessage,
  CreateStreamInput,
  UpdateStreamInput,
  PurgeStreamInput,
  GetMessagesInput,
  NatsStreamConfig,
} from '@nats-console/shared';
import { StreamInfo as NatsStreamInfo, RetentionPolicy, StorageType, DiscardPolicy } from 'nats';

// Transform NATS StreamInfo to shared StreamInfo type
function transformStreamInfo(natsInfo: NatsStreamInfo): StreamInfo {
  const config = natsInfo.config;

  // Map retention policy
  let retention: NatsStreamConfig['retention'] = 'limits';
  if (config.retention === RetentionPolicy.Interest) {
    retention = 'interest';
  } else if (config.retention === RetentionPolicy.Workqueue) {
    retention = 'workqueue';
  }

  // Map storage type
  const storage: NatsStreamConfig['storage'] = config.storage === StorageType.Memory ? 'memory' : 'file';

  // Map discard policy
  const discard: NatsStreamConfig['discard'] = config.discard === DiscardPolicy.New ? 'new' : 'old';

  return {
    config: {
      name: config.name,
      subjects: config.subjects || [],
      retention,
      maxConsumers: config.max_consumers ?? -1,
      maxMsgs: config.max_msgs ?? -1,
      maxBytes: config.max_bytes ?? -1,
      maxAge: config.max_age ?? 0,
      maxMsgSize: config.max_msg_size ?? -1,
      storage,
      replicas: config.num_replicas ?? 1,
      noAck: config.no_ack ?? false,
      discard,
      duplicateWindow: config.duplicate_window ?? 0,
      placement: config.placement ? {
        cluster: config.placement.cluster,
        tags: config.placement.tags,
      } : undefined,
      mirror: config.mirror ? {
        name: config.mirror.name,
        optStartSeq: config.mirror.opt_start_seq,
        optStartTime: config.mirror.opt_start_time,
        filterSubject: (config.mirror as any).filter_subject,
      } : undefined,
      sources: config.sources?.map(s => ({
        name: s.name,
        optStartSeq: s.opt_start_seq,
        optStartTime: s.opt_start_time,
        filterSubject: (s as any).filter_subject,
      })),
      sealed: config.sealed,
      denyDelete: config.deny_delete,
      denyPurge: config.deny_purge,
      allowRollup: config.allow_rollup_hdrs,
    },
    created: new Date(natsInfo.created),
    state: {
      messages: natsInfo.state.messages,
      bytes: natsInfo.state.bytes,
      firstSeq: natsInfo.state.first_seq,
      firstTs: new Date(natsInfo.state.first_ts),
      lastSeq: natsInfo.state.last_seq,
      lastTs: new Date(natsInfo.state.last_ts),
      numSubjects: natsInfo.state.num_subjects ?? 0,
      subjects: natsInfo.state.subjects,
      numDeleted: natsInfo.state.num_deleted ?? 0,
      deleted: natsInfo.state.deleted,
      consumerCount: natsInfo.state.consumer_count,
    },
    cluster: natsInfo.cluster ? {
      name: natsInfo.cluster.name || '',
      leader: natsInfo.cluster.leader || '',
      replicas: natsInfo.cluster.replicas?.map(r => ({
        name: r.name,
        current: r.current,
        offline: r.offline || false,
        active: r.active,
        lag: r.lag || 0,
      })),
    } : undefined,
    mirror: natsInfo.mirror ? {
      name: natsInfo.mirror.name,
      lag: natsInfo.mirror.lag,
      active: natsInfo.mirror.active,
      filterSubject: (natsInfo.mirror as any).filter_subject,
      error: natsInfo.mirror.error?.description,
    } : undefined,
    sources: natsInfo.sources?.map(s => ({
      name: s.name,
      lag: s.lag,
      active: s.active,
      filterSubject: (s as any).filter_subject,
      error: s.error?.description,
    })),
  };
}

// Map string retention to NATS enum
function mapRetention(retention?: string): RetentionPolicy {
  if (retention === 'interest') return RetentionPolicy.Interest;
  if (retention === 'workqueue') return RetentionPolicy.Workqueue;
  return RetentionPolicy.Limits;
}

// Map string storage to NATS enum
function mapStorage(storage?: string): StorageType {
  if (storage === 'memory') return StorageType.Memory;
  return StorageType.File;
}

// Map string discard to NATS enum
function mapDiscard(discard?: string): DiscardPolicy {
  if (discard === 'new') return DiscardPolicy.New;
  return DiscardPolicy.Old;
}

// ==================== Stream Operations ====================

export async function listStreams(
  orgId: string,
  clusterId: string
): Promise<StreamInfo[]> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const natsStreams = await natsListStreams(clusterId);
  return natsStreams.map(transformStreamInfo);
}

export async function getStream(
  orgId: string,
  clusterId: string,
  streamName: string
): Promise<StreamInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  try {
    const natsStream = await natsGetStreamInfo(clusterId, streamName);
    return transformStreamInfo(natsStream);
  } catch {
    throw new NotFoundError('Stream', streamName);
  }
}

export async function createStream(
  orgId: string,
  clusterId: string,
  userId: string,
  input: CreateStreamInput
): Promise<StreamInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Create stream in NATS
  const natsStreamInfo = await natsCreateStream(clusterId, {
    name: input.name,
    subjects: input.subjects,
    retention: mapRetention(input.retention),
    max_consumers: input.maxConsumers,
    max_msgs: input.maxMsgs,
    max_bytes: input.maxBytes,
    max_age: input.maxAge,
    max_msg_size: input.maxMsgSize,
    storage: mapStorage(input.storage),
    num_replicas: input.replicas,
    no_ack: input.noAck,
    discard: mapDiscard(input.discard),
    duplicate_window: input.duplicateWindow,
    placement: input.placement ? { cluster: input.placement.cluster || '', tags: input.placement.tags } : undefined,
    mirror: input.mirror,
    sources: input.sources,
    sealed: input.sealed,
    deny_delete: input.denyDelete,
    deny_purge: input.denyPurge,
    allow_rollup_hdrs: input.allowRollup,
  });
  const streamInfo = transformStreamInfo(natsStreamInfo);

  // Store config in database for tracking
  await prisma.streamConfig.create({
    data: {
      clusterId,
      streamName: input.name,
      configSnapshot: natsStreamInfo.config as any,
      createdBy: userId,
      isManaged: true,
      tags: input.tags || [],
    },
  });

  return streamInfo;
}

export async function updateStream(
  orgId: string,
  clusterId: string,
  streamName: string,
  input: UpdateStreamInput
): Promise<StreamInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Get current config
  const currentStream = await natsGetStreamInfo(clusterId, streamName);

  // Update stream in NATS
  const natsStreamInfo = await natsUpdateStream(clusterId, {
    name: streamName,
    subjects: input.subjects ?? currentStream.config.subjects,
    retention: input.retention ? mapRetention(input.retention) : currentStream.config.retention,
    max_consumers: input.maxConsumers ?? currentStream.config.max_consumers,
    max_msgs: input.maxMsgs ?? currentStream.config.max_msgs,
    max_bytes: input.maxBytes ?? currentStream.config.max_bytes,
    max_age: input.maxAge ?? currentStream.config.max_age,
    max_msg_size: input.maxMsgSize ?? currentStream.config.max_msg_size,
    storage: input.storage ? mapStorage(input.storage) : currentStream.config.storage,
    num_replicas: input.replicas ?? currentStream.config.num_replicas,
    discard: input.discard ? mapDiscard(input.discard) : currentStream.config.discard,
  });
  const streamInfo = transformStreamInfo(natsStreamInfo);

  // Update config in database
  await prisma.streamConfig.updateMany({
    where: { clusterId, streamName },
    data: {
      configSnapshot: natsStreamInfo.config as any,
      tags: input.tags,
    },
  });

  return streamInfo;
}

export async function deleteStream(
  orgId: string,
  clusterId: string,
  streamName: string
): Promise<void> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Delete from NATS
  await natsDeleteStream(clusterId, streamName);

  // Delete from database
  await prisma.streamConfig.deleteMany({
    where: { clusterId, streamName },
  });
}

export async function purgeStream(
  orgId: string,
  clusterId: string,
  streamName: string,
  input?: PurgeStreamInput
): Promise<{ purged: number }> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  return natsPurgeStream(clusterId, streamName, input);
}

// ==================== Message Operations ====================

export async function getMessages(
  orgId: string,
  clusterId: string,
  streamName: string,
  input: GetMessagesInput
): Promise<StreamMessage[]> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const messages = await natsGetMessages(clusterId, streamName, {
    startSeq: input.startSeq,
    limit: input.limit,
    subject: input.subject,
  });

  return messages.map((msg): StreamMessage => ({
    subject: msg.subject,
    sequence: msg.seq,
    time: msg.time,
    data: new TextDecoder().decode(msg.data),
    headers: msg.header
      ? Object.fromEntries(
          Array.from(msg.header.keys()).map((k) => [k, [msg.header!.get(k) || '']])
        )
      : undefined,
  }));
}

export async function getMessage(
  orgId: string,
  clusterId: string,
  streamName: string,
  sequence: number
): Promise<StreamMessage | null> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const msg = await natsGetMessage(clusterId, streamName, sequence);

  if (!msg) {
    return null;
  }

  return {
    subject: msg.subject,
    sequence: msg.seq,
    time: msg.time,
    data: new TextDecoder().decode(msg.data),
    headers: msg.header
      ? Object.fromEntries(
          Array.from(msg.header.keys()).map((k) => [k, [msg.header!.get(k) || '']])
        )
      : undefined,
  };
}

export async function publishMessage(
  orgId: string,
  clusterId: string,
  subject: string,
  data: string,
  headers?: Record<string, string>
): Promise<{ sequence: number; stream: string }> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const ack = await natsPublishMessage(clusterId, subject, data, headers);

  return {
    sequence: ack.seq,
    stream: ack.stream,
  };
}

export async function deleteMessage(
  orgId: string,
  clusterId: string,
  streamName: string,
  sequence: number
): Promise<void> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  await natsDeleteMessage(clusterId, streamName, sequence);
}

// ==================== Schema Inference ====================

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  nullable: boolean;
  children?: SchemaField[];
  examples?: unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
}

export interface InferredSchema {
  type: 'object' | 'array' | 'primitive';
  fields: SchemaField[];
  sampleCount: number;
  parseErrors: number;
  format?: string;
}

function inferType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    // Try to detect common formats
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return 'string:datetime';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'string:date';
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) return 'string:uuid';
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) return 'string:email';
    if (/^https?:\/\//.test(value)) return 'string:uri';
    return 'string';
  }
  return 'unknown';
}

function mergeTypes(types: Set<string>): string {
  if (types.size === 0) return 'unknown';
  if (types.size === 1) return types.values().next().value;

  // Handle nullable types
  const typesArr = Array.from(types);
  if (types.has('null') && types.size === 2) {
    const nonNull = typesArr.find(t => t !== 'null')!;
    return nonNull + '|null';
  }

  // Handle numeric types
  if (types.has('integer') && types.has('number')) {
    types.delete('integer');
  }

  return Array.from(types).join(' | ');
}

function analyzeField(
  name: string,
  values: unknown[],
  seenCount: number,
  totalSamples: number
): SchemaField {
  const types = new Set<string>();
  const examples: unknown[] = [];
  let children: SchemaField[] | undefined;
  const stringLengths: number[] = [];
  const numbers: number[] = [];
  const uniqueValues = new Set<string>();

  for (const value of values) {
    const type = inferType(value);
    types.add(type.split(':')[0] === 'string' ? type : type);

    if (examples.length < 3 && value !== null) {
      const strVal = JSON.stringify(value);
      if (!uniqueValues.has(strVal)) {
        uniqueValues.add(strVal);
        examples.push(value);
      }
    }

    if (typeof value === 'string') {
      stringLengths.push(value.length);
    }

    if (typeof value === 'number') {
      numbers.push(value);
    }
  }

  // Analyze nested objects
  const objectValues = values.filter(v => typeof v === 'object' && v !== null && !Array.isArray(v));
  if (objectValues.length > 0) {
    const allKeys = new Map<string, unknown[]>();
    const keyCounts = new Map<string, number>();

    for (const obj of objectValues as Record<string, unknown>[]) {
      for (const [key, val] of Object.entries(obj)) {
        if (!allKeys.has(key)) {
          allKeys.set(key, []);
          keyCounts.set(key, 0);
        }
        allKeys.get(key)!.push(val);
        keyCounts.set(key, keyCounts.get(key)! + 1);
      }
    }

    children = Array.from(allKeys.entries()).map(([key, vals]) =>
      analyzeField(key, vals, keyCounts.get(key)!, objectValues.length)
    );
  }

  // Analyze arrays
  const arrayValues = values.filter(v => Array.isArray(v));
  if (arrayValues.length > 0 && !children) {
    const allItems = (arrayValues as unknown[][]).flat();
    if (allItems.length > 0) {
      children = [analyzeField('[]', allItems, allItems.length, arrayValues.length)];
    }
  }

  // Detect enums (if limited unique values)
  const enumValues = uniqueValues.size <= 10 && uniqueValues.size < values.length / 2
    ? Array.from(uniqueValues).map(v => JSON.parse(v))
    : undefined;

  const field: SchemaField = {
    name,
    type: mergeTypes(types),
    required: seenCount === totalSamples,
    nullable: types.has('null'),
    examples,
  };

  if (children) field.children = children;
  if (enumValues) field.enum = enumValues;
  if (stringLengths.length > 0) {
    field.minLength = Math.min(...stringLengths);
    field.maxLength = Math.max(...stringLengths);
  }
  if (numbers.length > 0) {
    field.minimum = Math.min(...numbers);
    field.maximum = Math.max(...numbers);
  }

  return field;
}

export async function inferMessageSchema(
  orgId: string,
  clusterId: string,
  streamName: string,
  options?: { subject?: string; sampleSize?: number }
): Promise<InferredSchema> {
  const sampleSize = options?.sampleSize ?? 100;

  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Get messages for sampling
  const messages = await natsGetMessages(clusterId, streamName, {
    limit: sampleSize,
    subject: options?.subject,
  });

  if (messages.length === 0) {
    return {
      type: 'object',
      fields: [],
      sampleCount: 0,
      parseErrors: 0,
    };
  }

  // Parse messages and collect data
  const parsedValues: unknown[] = [];
  let parseErrors = 0;
  let format: string | undefined;

  for (const msg of messages) {
    try {
      const data = new TextDecoder().decode(msg.data);

      // Try to detect format
      if (!format) {
        if (data.startsWith('{') || data.startsWith('[')) {
          format = 'json';
        } else if (data.includes(',') && data.includes('\n')) {
          format = 'csv';
        } else {
          format = 'text';
        }
      }

      if (format === 'json') {
        const parsed = JSON.parse(data);
        parsedValues.push(parsed);
      } else {
        parsedValues.push(data);
      }
    } catch {
      parseErrors++;
    }
  }

  if (parsedValues.length === 0) {
    return {
      type: 'primitive',
      fields: [],
      sampleCount: messages.length,
      parseErrors,
      format: 'binary',
    };
  }

  // Determine root type
  const firstValue = parsedValues[0];
  let rootType: 'object' | 'array' | 'primitive';
  let fields: SchemaField[];

  if (typeof firstValue === 'object' && firstValue !== null && !Array.isArray(firstValue)) {
    rootType = 'object';
    const rootField = analyzeField('root', parsedValues, parsedValues.length, parsedValues.length);
    fields = rootField.children || [];
  } else if (Array.isArray(firstValue)) {
    rootType = 'array';
    const rootField = analyzeField('root', parsedValues, parsedValues.length, parsedValues.length);
    fields = rootField.children || [];
  } else {
    rootType = 'primitive';
    fields = [analyzeField('value', parsedValues, parsedValues.length, parsedValues.length)];
  }

  return {
    type: rootType,
    fields,
    sampleCount: parsedValues.length,
    parseErrors,
    format,
  };
}
