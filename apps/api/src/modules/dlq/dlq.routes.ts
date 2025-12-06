import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as streamService from '../streams/streams.service';
import { authenticate } from '../../common/middleware/auth';
import {
  listStreams as natsListStreams,
  getStreamInfo as natsGetStreamInfo,
} from '../../lib/nats';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '@nats-console/shared';

// Schema for replaying DLQ messages
const ReplayDlqMessageSchema = z.object({
  targetSubject: z.string().min(1, 'Target subject is required'),
  preserveHeaders: z.boolean().default(true),
});

const ReplayBatchSchema = z.object({
  sequences: z.array(z.number().int().positive()),
  targetSubject: z.string().optional(),
  preserveHeaders: z.boolean().default(true),
});

export const dlqRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /dlq/streams - List all DLQ streams across all clusters
  fastify.get('/streams', async (request) => {
    const orgId = request.user!.orgId;

    // Get all clusters for the org
    const clusters = await prisma.natsCluster.findMany({
      where: { orgId },
    });

    const dlqStreams: Array<{
      clusterId: string;
      clusterName: string;
      streamName: string;
      messageCount: number;
      bytesTotal: number;
      firstSeq?: number;
      lastSeq?: number;
      subjects: string[];
      sourceStream?: string;
    }> = [];

    // For each cluster, find DLQ streams
    for (const cluster of clusters) {
      try {
        const streams = await natsListStreams(cluster.id);

        for (const stream of streams) {
          // Check if stream is a DLQ (ends with _DLQ or _dlq, or has DLQ tag)
          const isDlq =
            stream.config.name.endsWith('_DLQ') ||
            stream.config.name.endsWith('_dlq') ||
            stream.config.name.includes('.dlq.') ||
            stream.config.name.includes('.DLQ.');

          if (isDlq) {
            // Try to determine source stream from name
            let sourceStream: string | undefined;
            if (stream.config.name.endsWith('_DLQ')) {
              sourceStream = stream.config.name.slice(0, -4);
            } else if (stream.config.name.endsWith('_dlq')) {
              sourceStream = stream.config.name.slice(0, -4);
            }

            dlqStreams.push({
              clusterId: cluster.id,
              clusterName: cluster.name,
              streamName: stream.config.name,
              messageCount: stream.state.messages,
              bytesTotal: stream.state.bytes,
              firstSeq: stream.state.first_seq,
              lastSeq: stream.state.last_seq,
              subjects: stream.config.subjects || [],
              sourceStream,
            });
          }
        }
      } catch (err) {
        // Skip clusters that can't be reached
        fastify.log.warn({ clusterId: cluster.id, err }, 'Failed to list streams for cluster');
      }
    }

    return { dlqStreams };
  });

  // GET /dlq/:clusterId/:streamName - Get DLQ stream details
  fastify.get<{ Params: { clusterId: string; streamName: string } }>(
    '/:clusterId/:streamName',
    async (request) => {
      const { clusterId, streamName } = request.params;
      const orgId = request.user!.orgId;

      const stream = await streamService.getStream(orgId, clusterId, streamName);

      return { stream };
    }
  );

  // GET /dlq/:clusterId/:streamName/messages - Browse DLQ messages
  fastify.get<{
    Params: { clusterId: string; streamName: string };
    Querystring: { startSeq?: string; limit?: string; subject?: string };
  }>('/:clusterId/:streamName/messages', async (request) => {
    const { clusterId, streamName } = request.params;
    const { startSeq, limit = '100', subject } = request.query;
    const orgId = request.user!.orgId;

    const messages = await streamService.getMessages(orgId, clusterId, streamName, {
      startSeq: startSeq ? parseInt(startSeq) : undefined,
      limit: Math.min(parseInt(limit), 500),
      subject,
    });

    // Enhance messages with DLQ-specific info
    const enhancedMessages = messages.map((msg) => {
      // Try to extract original subject from headers
      const originalSubject = msg.headers?.['Nats-Original-Subject'] || msg.headers?.['X-Original-Subject'];
      const deliveryCount = msg.headers?.['Nats-Num-Delivered'] || msg.headers?.['X-Delivery-Count'];
      const failureReason = msg.headers?.['Nats-Failure-Reason'] || msg.headers?.['X-Failure-Reason'];

      return {
        ...msg,
        originalSubject,
        deliveryCount: deliveryCount ? parseInt(deliveryCount) : undefined,
        failureReason,
      };
    });

    return { messages: enhancedMessages };
  });

  // POST /dlq/:clusterId/:streamName/messages/:seq/replay - Replay a single DLQ message
  fastify.post<{
    Params: { clusterId: string; streamName: string; seq: string };
    Body: { targetSubject?: string; preserveHeaders?: boolean };
  }>('/:clusterId/:streamName/messages/:seq/replay', async (request) => {
    const { clusterId, streamName, seq } = request.params;
    const { targetSubject, preserveHeaders = true } = request.body || {};
    const orgId = request.user!.orgId;

    // Get the message
    const message = await streamService.getMessage(orgId, clusterId, streamName, parseInt(seq));

    if (!message) {
      throw new NotFoundError('Message', seq);
    }

    // Determine target subject
    const target =
      targetSubject ||
      (message.headers?.['Nats-Original-Subject'] as string) ||
      (message.headers?.['X-Original-Subject'] as string);

    if (!target) {
      throw new Error('Target subject not specified and original subject not found in headers');
    }

    // Prepare headers for replay
    let replayHeaders: Record<string, string> | undefined;
    if (preserveHeaders && message.headers) {
      replayHeaders = { ...message.headers };
      // Add replay metadata
      replayHeaders['X-Replayed-From'] = streamName;
      replayHeaders['X-Replayed-Seq'] = String(message.sequence);
      replayHeaders['X-Replayed-At'] = new Date().toISOString();
    } else {
      replayHeaders = {
        'X-Replayed-From': streamName,
        'X-Replayed-Seq': String(message.sequence),
        'X-Replayed-At': new Date().toISOString(),
      };
    }

    // Publish to target subject
    const result = await streamService.publishMessage(
      orgId,
      clusterId,
      target,
      message.data,
      replayHeaders
    );

    return {
      replayed: true,
      targetSubject: target,
      newSequence: result.sequence,
      stream: result.stream,
    };
  });

  // POST /dlq/:clusterId/:streamName/replay-batch - Replay multiple DLQ messages
  fastify.post<{
    Params: { clusterId: string; streamName: string };
    Body: { sequences: number[]; targetSubject?: string; preserveHeaders?: boolean };
  }>('/:clusterId/:streamName/replay-batch', async (request) => {
    const { clusterId, streamName } = request.params;
    const body = ReplayBatchSchema.parse(request.body);
    const orgId = request.user!.orgId;

    const results: Array<{
      sequence: number;
      success: boolean;
      newSequence?: number;
      error?: string;
    }> = [];

    for (const seq of body.sequences) {
      try {
        const message = await streamService.getMessage(orgId, clusterId, streamName, seq);

        if (!message) {
          results.push({ sequence: seq, success: false, error: 'Message not found' });
          continue;
        }

        // Determine target subject
        const target =
          body.targetSubject ||
          (message.headers?.['Nats-Original-Subject'] as string) ||
          (message.headers?.['X-Original-Subject'] as string);

        if (!target) {
          results.push({ sequence: seq, success: false, error: 'No target subject' });
          continue;
        }

        // Prepare headers
        const replayHeaders: Record<string, string> = body.preserveHeaders && message.headers
          ? { ...message.headers }
          : {};
        replayHeaders['X-Replayed-From'] = streamName;
        replayHeaders['X-Replayed-Seq'] = String(seq);
        replayHeaders['X-Replayed-At'] = new Date().toISOString();

        const result = await streamService.publishMessage(
          orgId,
          clusterId,
          target,
          message.data,
          replayHeaders
        );

        results.push({ sequence: seq, success: true, newSequence: result.sequence });
      } catch (err) {
        results.push({
          sequence: seq,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      total: body.sequences.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  });

  // DELETE /dlq/:clusterId/:streamName/messages/:seq - Delete a DLQ message
  fastify.delete<{
    Params: { clusterId: string; streamName: string; seq: string };
  }>('/:clusterId/:streamName/messages/:seq', async (request, reply) => {
    const { clusterId, streamName, seq } = request.params;
    const orgId = request.user!.orgId;

    await streamService.deleteMessage(orgId, clusterId, streamName, parseInt(seq));

    return reply.status(204).send();
  });

  // DELETE /dlq/:clusterId/:streamName/purge - Purge all DLQ messages
  fastify.delete<{
    Params: { clusterId: string; streamName: string };
    Querystring: { subject?: string };
  }>('/:clusterId/:streamName/purge', async (request) => {
    const { clusterId, streamName } = request.params;
    const { subject } = request.query;
    const orgId = request.user!.orgId;

    const result = await streamService.purgeStream(orgId, clusterId, streamName, { filter: subject });

    return result;
  });

  // POST /dlq/create - Create a new DLQ stream
  fastify.post<{
    Body: {
      clusterId: string;
      sourceStreamName: string;
      retention?: 'limits' | 'interest' | 'workqueue';
      maxAge?: number;
      maxMsgs?: number;
      maxBytes?: number;
    };
  }>('/create', async (request) => {
    const { clusterId, sourceStreamName, retention = 'limits', maxAge, maxMsgs, maxBytes } = request.body;
    const orgId = request.user!.orgId;
    const userId = request.user!.sub;

    // Create DLQ stream with naming convention
    const dlqName = `${sourceStreamName}_DLQ`;
    const dlqSubjects = [`${sourceStreamName}.dlq.>`];

    const stream = await streamService.createStream(orgId, clusterId, userId, {
      name: dlqName,
      subjects: dlqSubjects,
      retention,
      maxAge: maxAge ?? 604800000000000, // 7 days default
      maxMsgs: maxMsgs ?? -1,
      maxBytes: maxBytes ?? -1,
      maxMsgSize: -1,
      maxConsumers: -1,
      storage: 'file',
      replicas: 1,
      noAck: false,
      discard: 'old',
      duplicateWindow: 120000000000,
    });

    return { stream };
  });
};
