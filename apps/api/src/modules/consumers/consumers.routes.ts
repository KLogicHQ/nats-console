import type { FastifyPluginAsync } from 'fastify';
import { CreateConsumerSchema, UpdateConsumerSchema } from '@nats-console/shared';
import * as consumerService from './consumers.service';
import { authenticate } from '../../common/middleware/auth';

export const consumerRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /clusters/:cid/consumers - List ALL consumers across all streams
  fastify.get<{ Params: { cid: string } }>(
    '/:cid/consumers',
    async (request) => {
      const consumers = await consumerService.listAllConsumers(
        request.user!.orgId,
        request.params.cid
      );
      return { consumers };
    }
  );

  // GET /clusters/:cid/streams/:sid/consumers - List consumers
  fastify.get<{ Params: { cid: string; sid: string } }>(
    '/:cid/streams/:sid/consumers',
    async (request) => {
      const consumers = await consumerService.listConsumers(
        request.user!.orgId,
        request.params.cid,
        request.params.sid
      );
      return { consumers };
    }
  );

  // POST /clusters/:cid/streams/:sid/consumers - Create consumer
  fastify.post<{ Params: { cid: string; sid: string } }>(
    '/:cid/streams/:sid/consumers',
    async (request, reply) => {
      const body = CreateConsumerSchema.parse(request.body);
      const consumer = await consumerService.createConsumer(
        request.user!.orgId,
        request.params.cid,
        request.params.sid,
        request.user!.sub,
        body
      );
      return reply.status(201).send({ consumer });
    }
  );

  // GET /clusters/:cid/streams/:sid/consumers/:name - Get consumer
  fastify.get<{ Params: { cid: string; sid: string; name: string } }>(
    '/:cid/streams/:sid/consumers/:name',
    async (request) => {
      const consumer = await consumerService.getConsumer(
        request.user!.orgId,
        request.params.cid,
        request.params.sid,
        request.params.name
      );
      return { consumer };
    }
  );

  // PATCH /clusters/:cid/streams/:sid/consumers/:name - Update consumer
  fastify.patch<{ Params: { cid: string; sid: string; name: string } }>(
    '/:cid/streams/:sid/consumers/:name',
    async (request) => {
      const body = UpdateConsumerSchema.parse(request.body);
      const consumer = await consumerService.updateConsumer(
        request.user!.orgId,
        request.params.cid,
        request.params.sid,
        request.params.name,
        body
      );
      return { consumer };
    }
  );

  // DELETE /clusters/:cid/streams/:sid/consumers/:name - Delete consumer
  fastify.delete<{ Params: { cid: string; sid: string; name: string } }>(
    '/:cid/streams/:sid/consumers/:name',
    async (request, reply) => {
      await consumerService.deleteConsumer(
        request.user!.orgId,
        request.params.cid,
        request.params.sid,
        request.params.name
      );
      return reply.status(204).send();
    }
  );

  // GET /clusters/:cid/streams/:sid/consumers/:name/info - Consumer info
  fastify.get<{ Params: { cid: string; sid: string; name: string } }>(
    '/:cid/streams/:sid/consumers/:name/info',
    async (request) => {
      const consumer = await consumerService.getConsumer(
        request.user!.orgId,
        request.params.cid,
        request.params.sid,
        request.params.name
      );
      return { consumer };
    }
  );

  // POST /clusters/:cid/streams/:sid/consumers/:name/pause - Pause consumer
  fastify.post<{
    Params: { cid: string; sid: string; name: string };
    Body: { pauseUntil?: string };
  }>(
    '/:cid/streams/:sid/consumers/:name/pause',
    async (request) => {
      const pauseUntil = request.body?.pauseUntil
        ? new Date(request.body.pauseUntil)
        : undefined;
      const consumer = await consumerService.pauseConsumer(
        request.user!.orgId,
        request.params.cid,
        request.params.sid,
        request.params.name,
        pauseUntil
      );
      return { consumer, paused: true };
    }
  );

  // POST /clusters/:cid/streams/:sid/consumers/:name/resume - Resume consumer
  fastify.post<{ Params: { cid: string; sid: string; name: string } }>(
    '/:cid/streams/:sid/consumers/:name/resume',
    async (request) => {
      const consumer = await consumerService.resumeConsumer(
        request.user!.orgId,
        request.params.cid,
        request.params.sid,
        request.params.name
      );
      return { consumer, resumed: true };
    }
  );
};
