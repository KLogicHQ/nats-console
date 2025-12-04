import { prisma } from '../../lib/prisma.js';
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
} from '../../lib/nats.js';
import { NotFoundError } from '@nats-console/shared';
import type {
  StreamInfo,
  StreamConfig,
  StreamMessage,
  CreateStreamInput,
  UpdateStreamInput,
  PurgeStreamInput,
  GetMessagesInput,
} from '@nats-console/shared';

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

  return natsListStreams(clusterId);
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
    return await natsGetStreamInfo(clusterId, streamName);
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
  const streamInfo = await natsCreateStream(clusterId, {
    name: input.name,
    subjects: input.subjects,
    retention: input.retention,
    max_consumers: input.maxConsumers,
    max_msgs: input.maxMsgs,
    max_bytes: input.maxBytes,
    max_age: input.maxAge,
    max_msg_size: input.maxMsgSize,
    storage: input.storage,
    num_replicas: input.replicas,
    no_ack: input.noAck,
    discard: input.discard,
    duplicate_window: input.duplicateWindow,
    placement: input.placement,
    mirror: input.mirror,
    sources: input.sources,
    sealed: input.sealed,
    deny_delete: input.denyDelete,
    deny_purge: input.denyPurge,
    allow_rollup_hdrs: input.allowRollup,
  });

  // Store config in database for tracking
  await prisma.streamConfig.create({
    data: {
      clusterId,
      streamName: input.name,
      configSnapshot: streamInfo.config as any,
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
  const streamInfo = await natsUpdateStream(clusterId, {
    name: streamName,
    subjects: input.subjects ?? currentStream.config.subjects,
    retention: input.retention ?? currentStream.config.retention,
    max_consumers: input.maxConsumers ?? currentStream.config.max_consumers,
    max_msgs: input.maxMsgs ?? currentStream.config.max_msgs,
    max_bytes: input.maxBytes ?? currentStream.config.max_bytes,
    max_age: input.maxAge ?? currentStream.config.max_age,
    max_msg_size: input.maxMsgSize ?? currentStream.config.max_msg_size,
    storage: input.storage ?? currentStream.config.storage,
    num_replicas: input.replicas ?? currentStream.config.num_replicas,
    discard: input.discard ?? currentStream.config.discard,
  });

  // Update config in database
  await prisma.streamConfig.updateMany({
    where: { clusterId, streamName },
    data: {
      configSnapshot: streamInfo.config as any,
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

  return messages.map((msg) => ({
    subject: msg.subject,
    sequence: msg.seq,
    time: msg.time,
    data: new TextDecoder().decode(msg.data),
    headers: msg.header
      ? Object.fromEntries(
          Array.from(msg.header.keys()).map((k) => [k, msg.header!.get(k)])
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
          Array.from(msg.header.keys()).map((k) => [k, msg.header!.get(k)])
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
