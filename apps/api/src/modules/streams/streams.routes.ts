import type { FastifyPluginAsync } from 'fastify';
import {
  CreateStreamSchema,
  UpdateStreamSchema,
  PurgeStreamSchema,
  GetMessagesSchema,
  PublishMessageSchema,
} from '@nats-console/shared';
import * as streamService from './streams.service.js';
import { authenticate } from '../../common/middleware/auth.js';

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
};
