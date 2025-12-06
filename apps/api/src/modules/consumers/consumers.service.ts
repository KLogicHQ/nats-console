import { prisma } from '../../lib/prisma';
import {
  listConsumers as natsListConsumers,
  getConsumerInfo as natsGetConsumerInfo,
  createConsumer as natsCreateConsumer,
  updateConsumer as natsUpdateConsumer,
  deleteConsumer as natsDeleteConsumer,
  pauseConsumer as natsPauseConsumer,
  resumeConsumer as natsResumeConsumer,
  listStreams as natsListStreams,
} from '../../lib/nats';
import { NotFoundError } from '@nats-console/shared';
import type { ConsumerInfo, CreateConsumerInput, UpdateConsumerInput, NatsConsumerConfig } from '@nats-console/shared';
import { ConsumerInfo as NatsConsumerInfo } from 'nats';

// Transform NATS ConsumerInfo to shared ConsumerInfo type
function transformConsumerInfo(natsInfo: NatsConsumerInfo): ConsumerInfo {
  const config = natsInfo.config;
  return {
    name: natsInfo.name,
    streamName: natsInfo.stream_name,
    created: new Date(natsInfo.created),
    config: {
      name: config.name || natsInfo.name,
      durableName: config.durable_name,
      description: config.description,
      deliverPolicy: (config.deliver_policy || 'all') as NatsConsumerConfig['deliverPolicy'],
      optStartSeq: config.opt_start_seq,
      optStartTime: config.opt_start_time,
      ackPolicy: (config.ack_policy || 'explicit') as NatsConsumerConfig['ackPolicy'],
      ackWait: config.ack_wait || 0,
      maxDeliver: config.max_deliver || -1,
      backoff: config.backoff,
      filterSubject: config.filter_subject,
      filterSubjects: config.filter_subjects,
      replayPolicy: (config.replay_policy || 'instant') as NatsConsumerConfig['replayPolicy'],
      rateLimit: config.rate_limit_bps,
      sampleFreq: config.sample_freq,
      maxWaiting: config.max_waiting || 512,
      maxAckPending: config.max_ack_pending || 1000,
      headersOnly: config.headers_only,
      maxBatch: config.max_batch,
      maxExpires: config.max_expires,
      inactiveThreshold: config.inactive_threshold,
      numReplicas: config.num_replicas || 0,
      memStorage: config.mem_storage,
    },
    delivered: {
      consumerSeq: natsInfo.delivered.consumer_seq,
      streamSeq: natsInfo.delivered.stream_seq,
      lastActive: natsInfo.delivered.last_active ? new Date(natsInfo.delivered.last_active) : undefined,
    },
    ackFloor: {
      consumerSeq: natsInfo.ack_floor.consumer_seq,
      streamSeq: natsInfo.ack_floor.stream_seq,
      lastActive: natsInfo.ack_floor.last_active ? new Date(natsInfo.ack_floor.last_active) : undefined,
    },
    numAckPending: natsInfo.num_ack_pending,
    numRedelivered: natsInfo.num_redelivered,
    numWaiting: natsInfo.num_waiting,
    numPending: natsInfo.num_pending,
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
    pushBound: natsInfo.push_bound,
  };
}

// Extended consumer info with stream name
export interface ConsumerInfoWithStream extends ConsumerInfo {
  streamName: string;
}

// ==================== Consumer Operations ====================

export async function listConsumers(
  orgId: string,
  clusterId: string,
  streamName: string
): Promise<ConsumerInfo[]> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const natsConsumers = await natsListConsumers(clusterId, streamName);
  return natsConsumers.map(transformConsumerInfo);
}

export async function listAllConsumers(
  orgId: string,
  clusterId: string
): Promise<ConsumerInfoWithStream[]> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Get all streams
  const streams = await natsListStreams(clusterId);

  // Get consumers from each stream
  const allConsumers: ConsumerInfoWithStream[] = [];
  for (const stream of streams) {
    try {
      const natsConsumers = await natsListConsumers(clusterId, stream.config.name);
      for (const natsConsumer of natsConsumers) {
        const consumer = transformConsumerInfo(natsConsumer);
        allConsumers.push({
          ...consumer,
          streamName: stream.config.name,
        });
      }
    } catch {
      // Skip streams that have issues
    }
  }

  return allConsumers;
}

export async function getConsumer(
  orgId: string,
  clusterId: string,
  streamName: string,
  consumerName: string
): Promise<ConsumerInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  try {
    const natsConsumer = await natsGetConsumerInfo(clusterId, streamName, consumerName);
    return transformConsumerInfo(natsConsumer);
  } catch {
    throw new NotFoundError('Consumer', consumerName);
  }
}

export async function createConsumer(
  orgId: string,
  clusterId: string,
  streamName: string,
  userId: string,
  input: CreateConsumerInput
): Promise<ConsumerInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Get stream config from database
  const streamConfig = await prisma.streamConfig.findFirst({
    where: { clusterId, streamName },
  });

  // Build consumer config, filtering out undefined values
  const consumerConfig: Record<string, unknown> = {
    name: input.name,
    durable_name: input.durableName || input.name,
  };

  // Add optional fields only if defined
  if (input.description) consumerConfig.description = input.description;
  if (input.deliverPolicy) consumerConfig.deliver_policy = mapDeliverPolicy(input.deliverPolicy);
  if (input.optStartSeq !== undefined) consumerConfig.opt_start_seq = input.optStartSeq;
  if (input.optStartTime) consumerConfig.opt_start_time = input.optStartTime;
  if (input.ackPolicy) consumerConfig.ack_policy = mapAckPolicy(input.ackPolicy);
  if (input.ackWait !== undefined) consumerConfig.ack_wait = input.ackWait;
  if (input.maxDeliver !== undefined) consumerConfig.max_deliver = input.maxDeliver;
  if (input.backoff) consumerConfig.backoff = input.backoff;
  if (input.filterSubject) consumerConfig.filter_subject = input.filterSubject;
  if (input.filterSubjects) consumerConfig.filter_subjects = input.filterSubjects;
  if (input.replayPolicy) consumerConfig.replay_policy = mapReplayPolicy(input.replayPolicy);
  if (input.rateLimit !== undefined) consumerConfig.rate_limit_bps = input.rateLimit;
  if (input.sampleFreq) consumerConfig.sample_freq = input.sampleFreq;
  if (input.maxWaiting !== undefined) consumerConfig.max_waiting = input.maxWaiting;
  if (input.maxAckPending !== undefined) consumerConfig.max_ack_pending = input.maxAckPending;
  if (input.headersOnly !== undefined) consumerConfig.headers_only = input.headersOnly;
  if (input.maxBatch !== undefined) consumerConfig.max_batch = input.maxBatch;
  if (input.maxExpires !== undefined) consumerConfig.max_expires = input.maxExpires;
  if (input.inactiveThreshold !== undefined) consumerConfig.inactive_threshold = input.inactiveThreshold;
  if (input.numReplicas !== undefined) consumerConfig.num_replicas = input.numReplicas;
  if (input.memStorage !== undefined) consumerConfig.mem_storage = input.memStorage;

  // Create consumer in NATS
  const natsConsumerInfo = await natsCreateConsumer(clusterId, streamName, consumerConfig as any);
  const consumerInfo = transformConsumerInfo(natsConsumerInfo);

  // Store config in database for tracking
  if (streamConfig) {
    await prisma.consumerConfig.create({
      data: {
        streamConfigId: streamConfig.id,
        consumerName: input.name,
        configSnapshot: natsConsumerInfo.config as any,
        createdBy: userId,
        isManaged: true,
        tags: input.tags || [],
      },
    });
  }

  return consumerInfo;
}

export async function updateConsumer(
  orgId: string,
  clusterId: string,
  streamName: string,
  consumerName: string,
  input: UpdateConsumerInput
): Promise<ConsumerInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Get current consumer info
  const currentConsumer = await natsGetConsumerInfo(clusterId, streamName, consumerName);

  // Update consumer in NATS
  const natsConsumerInfo = await natsUpdateConsumer(clusterId, streamName, {
    name: consumerName,
    durable_name: consumerName,
    description: input.description ?? currentConsumer.config.description,
    ack_wait: input.ackWait ?? currentConsumer.config.ack_wait,
    max_deliver: input.maxDeliver ?? currentConsumer.config.max_deliver,
    max_ack_pending: input.maxAckPending ?? currentConsumer.config.max_ack_pending,
    max_waiting: input.maxWaiting ?? currentConsumer.config.max_waiting,
  });
  const consumerInfo = transformConsumerInfo(natsConsumerInfo);

  // Update config in database
  const streamConfig = await prisma.streamConfig.findFirst({
    where: { clusterId, streamName },
  });

  if (streamConfig) {
    await prisma.consumerConfig.updateMany({
      where: { streamConfigId: streamConfig.id, consumerName },
      data: {
        configSnapshot: natsConsumerInfo.config as any,
        tags: input.tags,
      },
    });
  }

  return consumerInfo;
}

export async function deleteConsumer(
  orgId: string,
  clusterId: string,
  streamName: string,
  consumerName: string
): Promise<void> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  // Delete from NATS
  await natsDeleteConsumer(clusterId, streamName, consumerName);

  // Delete from database
  const streamConfig = await prisma.streamConfig.findFirst({
    where: { clusterId, streamName },
  });

  if (streamConfig) {
    await prisma.consumerConfig.deleteMany({
      where: { streamConfigId: streamConfig.id, consumerName },
    });
  }
}

// ==================== Helpers ====================

function mapDeliverPolicy(policy: string): any {
  const map: Record<string, string> = {
    all: 'all',
    last: 'last',
    new: 'new',
    byStartSequence: 'by_start_sequence',
    byStartTime: 'by_start_time',
    lastPerSubject: 'last_per_subject',
  };
  return map[policy] || 'all';
}

function mapAckPolicy(policy: string): any {
  const map: Record<string, string> = {
    none: 'none',
    all: 'all',
    explicit: 'explicit',
  };
  return map[policy] || 'explicit';
}

function mapReplayPolicy(policy: string): any {
  const map: Record<string, string> = {
    instant: 'instant',
    original: 'original',
  };
  return map[policy] || 'instant';
}

// ==================== Pause/Resume Operations ====================

export async function pauseConsumer(
  orgId: string,
  clusterId: string,
  streamName: string,
  consumerName: string,
  pauseUntil?: Date
): Promise<ConsumerInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const natsConsumer = await natsPauseConsumer(clusterId, streamName, consumerName, pauseUntil);
  return transformConsumerInfo(natsConsumer);
}

export async function resumeConsumer(
  orgId: string,
  clusterId: string,
  streamName: string,
  consumerName: string
): Promise<ConsumerInfo> {
  // Verify cluster belongs to org
  const cluster = await prisma.natsCluster.findFirst({
    where: { id: clusterId, orgId },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster', clusterId);
  }

  const natsConsumer = await natsResumeConsumer(clusterId, streamName, consumerName);
  return transformConsumerInfo(natsConsumer);
}
