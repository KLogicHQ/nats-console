import { prisma } from '../../lib/prisma.js';
import {
  listConsumers as natsListConsumers,
  getConsumerInfo as natsGetConsumerInfo,
  createConsumer as natsCreateConsumer,
  updateConsumer as natsUpdateConsumer,
  deleteConsumer as natsDeleteConsumer,
} from '../../lib/nats.js';
import { NotFoundError } from '@nats-console/shared';
import type { ConsumerInfo, CreateConsumerInput, UpdateConsumerInput } from '@nats-console/shared';

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

  return natsListConsumers(clusterId, streamName);
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
    return await natsGetConsumerInfo(clusterId, streamName, consumerName);
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

  // Create consumer in NATS
  const consumerInfo = await natsCreateConsumer(clusterId, streamName, {
    name: input.name,
    durable_name: input.durableName || input.name,
    description: input.description,
    deliver_policy: mapDeliverPolicy(input.deliverPolicy),
    opt_start_seq: input.optStartSeq,
    opt_start_time: input.optStartTime,
    ack_policy: mapAckPolicy(input.ackPolicy),
    ack_wait: input.ackWait,
    max_deliver: input.maxDeliver,
    backoff: input.backoff,
    filter_subject: input.filterSubject,
    filter_subjects: input.filterSubjects,
    replay_policy: mapReplayPolicy(input.replayPolicy),
    rate_limit_bps: input.rateLimit,
    sample_freq: input.sampleFreq,
    max_waiting: input.maxWaiting,
    max_ack_pending: input.maxAckPending,
    headers_only: input.headersOnly,
    max_batch: input.maxBatch,
    max_expires: input.maxExpires,
    inactive_threshold: input.inactiveThreshold,
    num_replicas: input.numReplicas,
    mem_storage: input.memStorage,
  });

  // Store config in database for tracking
  if (streamConfig) {
    await prisma.consumerConfig.create({
      data: {
        streamConfigId: streamConfig.id,
        consumerName: input.name,
        configSnapshot: consumerInfo.config as any,
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
  const consumerInfo = await natsUpdateConsumer(clusterId, streamName, {
    name: consumerName,
    durable_name: consumerName,
    description: input.description ?? currentConsumer.config.description,
    ack_wait: input.ackWait ?? currentConsumer.config.ack_wait,
    max_deliver: input.maxDeliver ?? currentConsumer.config.max_deliver,
    max_ack_pending: input.maxAckPending ?? currentConsumer.config.max_ack_pending,
    max_waiting: input.maxWaiting ?? currentConsumer.config.max_waiting,
  });

  // Update config in database
  const streamConfig = await prisma.streamConfig.findFirst({
    where: { clusterId, streamName },
  });

  if (streamConfig) {
    await prisma.consumerConfig.updateMany({
      where: { streamConfigId: streamConfig.id, consumerName },
      data: {
        configSnapshot: consumerInfo.config as any,
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
