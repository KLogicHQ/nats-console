import type { FastifyPluginAsync } from 'fastify';
import {
  CreateStreamSchema,
  UpdateStreamSchema,
  PurgeStreamSchema,
  GetMessagesSchema,
  PublishMessageSchema,
} from '@nats-console/shared';
import * as streamService from './streams.service';
import { authenticate } from '../../common/middleware/auth';

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /clusters/:cid/streams - List streams
  fastify.get<{ Params: { cid: string } }>('/:cid/streams', async (request) => {
    const streams = await streamService.listStreams(
      request.user!.orgId,
      request.params.cid
    );
    return { streams };
  });

  // POST /clusters/:cid/streams - Create stream
  fastify.post<{ Params: { cid: string } }>('/:cid/streams', async (request, reply) => {
    const body = CreateStreamSchema.parse(request.body);
    const stream = await streamService.createStream(
      request.user!.orgId,
      request.params.cid,
      request.user!.sub,
      body
    );
    return reply.status(201).send({ stream });
  });

  // GET /clusters/:cid/streams/:name - Get stream
  fastify.get<{ Params: { cid: string; name: string } }>(
    '/:cid/streams/:name',
    async (request) => {
      const stream = await streamService.getStream(
        request.user!.orgId,
        request.params.cid,
        request.params.name
      );
      return { stream };
    }
  );

  // PATCH /clusters/:cid/streams/:name - Update stream
  fastify.patch<{ Params: { cid: string; name: string } }>(
    '/:cid/streams/:name',
    async (request) => {
      const body = UpdateStreamSchema.parse(request.body);
      const stream = await streamService.updateStream(
        request.user!.orgId,
        request.params.cid,
        request.params.name,
        body
      );
      return { stream };
    }
  );

  // DELETE /clusters/:cid/streams/:name - Delete stream
  fastify.delete<{ Params: { cid: string; name: string } }>(
    '/:cid/streams/:name',
    async (request, reply) => {
      await streamService.deleteStream(
        request.user!.orgId,
        request.params.cid,
        request.params.name
      );
      return reply.status(204).send();
    }
  );

  // GET /clusters/:cid/streams/:name/info - Stream info
  fastify.get<{ Params: { cid: string; name: string } }>(
    '/:cid/streams/:name/info',
    async (request) => {
      const stream = await streamService.getStream(
        request.user!.orgId,
        request.params.cid,
        request.params.name
      );
      return { stream };
    }
  );

  // POST /clusters/:cid/streams/:name/purge - Purge stream
  fastify.post<{ Params: { cid: string; name: string } }>(
    '/:cid/streams/:name/purge',
    async (request) => {
      const body = PurgeStreamSchema.parse(request.body || {});
      const result = await streamService.purgeStream(
        request.user!.orgId,
        request.params.cid,
        request.params.name,
        body
      );
      return result;
    }
  );

  // GET /clusters/:cid/streams/:name/messages - Browse messages
  fastify.get<{ Params: { cid: string; name: string }; Querystring: Record<string, string> }>(
    '/:cid/streams/:name/messages',
    async (request) => {
      const query = GetMessagesSchema.parse(request.query);
      const messages = await streamService.getMessages(
        request.user!.orgId,
        request.params.cid,
        request.params.name,
        query
      );
      return { messages };
    }
  );

  // POST /clusters/:cid/streams/:name/messages - Publish message
  fastify.post<{ Params: { cid: string; name: string } }>(
    '/:cid/streams/:name/messages',
    async (request, reply) => {
      const body = PublishMessageSchema.parse(request.body);
      const result = await streamService.publishMessage(
        request.user!.orgId,
        request.params.cid,
        body.subject,
        body.data,
        body.headers
      );
      return reply.status(201).send(result);
    }
  );

  // DELETE /clusters/:cid/streams/:name/messages/:seq - Delete message
  fastify.delete<{ Params: { cid: string; name: string; seq: string } }>(
    '/:cid/streams/:name/messages/:seq',
    async (request, reply) => {
      await streamService.deleteMessage(
        request.user!.orgId,
        request.params.cid,
        request.params.name,
        parseInt(request.params.seq)
      );
      return reply.status(204).send();
    }
  );

  // GET /clusters/:cid/streams/:name/messages/export - Export messages
  fastify.get<{
    Params: { cid: string; name: string };
    Querystring: {
      format?: 'json' | 'csv';
      start_seq?: string;
      limit?: string;
      subject?: string;
    };
  }>('/:cid/streams/:name/messages/export', async (request, reply) => {
    const { format = 'json', start_seq, limit = '1000', subject } = request.query;

    const messages = await streamService.getMessages(
      request.user!.orgId,
      request.params.cid,
      request.params.name,
      {
        startSeq: start_seq ? parseInt(start_seq) : undefined,
        limit: Math.min(parseInt(limit), 10000), // Max 10k messages per export
        subject,
      }
    );

    if (format === 'csv') {
      // CSV format
      const headers = ['sequence', 'subject', 'time', 'data'];
      const csvRows = [headers.join(',')];

      for (const msg of messages) {
        const row = [
          msg.sequence,
          `"${msg.subject.replace(/"/g, '""')}"`,
          msg.time,
          `"${String(msg.data).replace(/"/g, '""').replace(/\n/g, '\\n')}"`,
        ];
        csvRows.push(row.join(','));
      }

      reply.header('Content-Type', 'text/csv');
      reply.header(
        'Content-Disposition',
        `attachment; filename="${request.params.name}-messages.csv"`
      );
      return csvRows.join('\n');
    }

    // JSON format (default)
    reply.header('Content-Type', 'application/json');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${request.params.name}-messages.json"`
    );
    return JSON.stringify(messages, null, 2);
  });

  // POST /clusters/:cid/streams/:name/messages/replay - Replay messages to another subject
  fastify.post<{
    Params: { cid: string; name: string };
    Body: {
      targetSubject: string;
      startSeq?: number;
      endSeq?: number;
      limit?: number;
    };
  }>('/:cid/streams/:name/messages/replay', async (request) => {
    const { targetSubject, startSeq, endSeq, limit = 100 } = request.body as {
      targetSubject: string;
      startSeq?: number;
      endSeq?: number;
      limit?: number;
    };

    // Get messages to replay
    const messages = await streamService.getMessages(
      request.user!.orgId,
      request.params.cid,
      request.params.name,
      {
        startSeq,
        limit: Math.min(limit, 1000), // Max 1000 messages per replay
      }
    );

    // Filter by end sequence if specified
    const filteredMessages = endSeq
      ? messages.filter((m) => m.sequence <= endSeq)
      : messages;

    // Replay each message
    let replayedCount = 0;
    const errors: Array<{ sequence: number; error: string }> = [];

    for (const msg of filteredMessages) {
      try {
        await streamService.publishMessage(
          request.user!.orgId,
          request.params.cid,
          targetSubject,
          String(msg.data),
          msg.headers
        );
        replayedCount++;
      } catch (err) {
        errors.push({
          sequence: msg.sequence,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      replayed: replayedCount,
      total: filteredMessages.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

  // GET /clusters/:cid/streams/:name/schema - Infer message schema
  fastify.get<{
    Params: { cid: string; name: string };
    Querystring: { subject?: string; sample_size?: string };
  }>('/:cid/streams/:name/schema', async (request) => {
    const { subject, sample_size } = request.query;

    const schema = await streamService.inferMessageSchema(
      request.user!.orgId,
      request.params.cid,
      request.params.name,
      {
        subject,
        sampleSize: sample_size ? parseInt(sample_size) : undefined,
      }
    );

    return { schema };
  });
};
