import type { FastifyPluginAsync } from 'fastify';
import { CreateClusterSchema, UpdateClusterSchema } from '@nats-console/shared';
import * as clusterService from './clusters.service';
import { authenticate, requirePermission } from '../../common/middleware/auth';

export const clusterRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /clusters - List clusters
  fastify.get('/', async (request) => {
    const clusters = await clusterService.listClusters(request.user!.orgId);
    return { clusters };
  });

  // POST /clusters - Create cluster
  fastify.post('/', async (request, reply) => {
    const body = CreateClusterSchema.parse(request.body);
    const cluster = await clusterService.createCluster(
      request.user!.orgId,
      request.user!.sub,
      body
    );
    return reply.status(201).send({ cluster });
  });

  // GET /clusters/:id - Get cluster
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const cluster = await clusterService.getClusterWithConnections(
      request.user!.orgId,
      request.params.id
    );
    return { cluster };
  });

  // PATCH /clusters/:id - Update cluster
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = UpdateClusterSchema.parse(request.body);
    const cluster = await clusterService.updateCluster(
      request.user!.orgId,
      request.params.id,
      body
    );
    return { cluster };
  });

  // DELETE /clusters/:id - Delete cluster
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await clusterService.deleteCluster(request.user!.orgId, request.params.id);
    return reply.status(204).send();
  });

  // GET /clusters/:id/health - Cluster health check
  fastify.get<{ Params: { id: string } }>('/:id/health', async (request) => {
    const health = await clusterService.checkHealth(
      request.user!.orgId,
      request.params.id
    );
    return health;
  });

  // GET /clusters/:id/info - Cluster detailed info
  fastify.get<{ Params: { id: string } }>('/:id/info', async (request) => {
    const info = await clusterService.getClusterInfo(
      request.user!.orgId,
      request.params.id
    );
    return info;
  });

  // POST /clusters/:id/connect - Connect to cluster
  fastify.post<{ Params: { id: string } }>('/:id/connect', async (request) => {
    await clusterService.connectToCluster(request.params.id);
    return { success: true };
  });

  // POST /clusters/:id/disconnect - Disconnect from cluster
  fastify.post<{ Params: { id: string } }>('/:id/disconnect', async (request) => {
    await clusterService.disconnectFromCluster(request.params.id);
    return { success: true };
  });
};
