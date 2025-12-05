import type { FastifyPluginAsync } from 'fastify';
import { CreateSavedQuerySchema, UpdateSavedQuerySchema } from '../../../../shared/src/index';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '../../../../shared/src/index';

export const savedQueryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /saved-queries - List saved queries
  fastify.get('/', async (request) => {
    const savedQueries = await prisma.savedQuery.findMany({
      where: {
        OR: [
          { orgId: request.user!.orgId, userId: request.user!.sub },
          { orgId: request.user!.orgId, isShared: true },
        ],
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return { savedQueries };
  });

  // POST /saved-queries - Create saved query
  fastify.post('/', async (request, reply) => {
    const body = CreateSavedQuerySchema.parse(request.body);

    const savedQuery = await prisma.savedQuery.create({
      data: {
        orgId: request.user!.orgId,
        userId: request.user!.sub,
        name: body.name,
        query: body.query,
        description: body.description,
        isShared: body.isShared,
      },
    });

    return reply.status(201).send({ savedQuery });
  });

  // GET /saved-queries/:id - Get saved query
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const savedQuery = await prisma.savedQuery.findFirst({
      where: {
        id: request.params.id,
        OR: [
          { orgId: request.user!.orgId, userId: request.user!.sub },
          { orgId: request.user!.orgId, isShared: true },
        ],
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (!savedQuery) {
      throw new NotFoundError('SavedQuery', request.params.id);
    }

    return { savedQuery };
  });

  // PATCH /saved-queries/:id - Update saved query
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = UpdateSavedQuerySchema.parse(request.body);

    const savedQuery = await prisma.savedQuery.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
        userId: request.user!.sub,
      },
    });

    if (!savedQuery) {
      throw new NotFoundError('SavedQuery', request.params.id);
    }

    const updated = await prisma.savedQuery.update({
      where: { id: request.params.id },
      data: {
        name: body.name,
        query: body.query,
        description: body.description,
        isShared: body.isShared,
      },
    });

    return { savedQuery: updated };
  });

  // DELETE /saved-queries/:id - Delete saved query
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const savedQuery = await prisma.savedQuery.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
        userId: request.user!.sub,
      },
    });

    if (!savedQuery) {
      throw new NotFoundError('SavedQuery', request.params.id);
    }

    await prisma.savedQuery.delete({
      where: { id: request.params.id },
    });

    return reply.status(204).send();
  });

  // POST /saved-queries/:id/clone - Clone saved query
  fastify.post<{ Params: { id: string } }>('/:id/clone', async (request, reply) => {
    const savedQuery = await prisma.savedQuery.findFirst({
      where: {
        id: request.params.id,
        OR: [
          { orgId: request.user!.orgId, userId: request.user!.sub },
          { orgId: request.user!.orgId, isShared: true },
        ],
      },
    });

    if (!savedQuery) {
      throw new NotFoundError('SavedQuery', request.params.id);
    }

    const cloned = await prisma.savedQuery.create({
      data: {
        orgId: request.user!.orgId,
        userId: request.user!.sub,
        name: `${savedQuery.name} (Copy)`,
        query: savedQuery.query,
        description: savedQuery.description,
        isShared: false,
      },
    });

    return reply.status(201).send({ savedQuery: cloned });
  });

  // POST /saved-queries/:id/execute - Execute saved query (placeholder for query execution logic)
  fastify.post<{ Params: { id: string } }>('/:id/execute', async (request) => {
    const savedQuery = await prisma.savedQuery.findFirst({
      where: {
        id: request.params.id,
        OR: [
          { orgId: request.user!.orgId, userId: request.user!.sub },
          { orgId: request.user!.orgId, isShared: true },
        ],
      },
    });

    if (!savedQuery) {
      throw new NotFoundError('SavedQuery', request.params.id);
    }

    // Parse the query JSON to get the query configuration
    let queryConfig;
    try {
      queryConfig = JSON.parse(savedQuery.query);
    } catch {
      return { error: 'Invalid query configuration', results: [] };
    }

    // For now, return a placeholder response
    // In a full implementation, this would execute the query against ClickHouse or the appropriate data source
    return {
      savedQuery,
      queryConfig,
      message: 'Query execution is available. Configure the query type and parameters.',
      results: [],
    };
  });
};
