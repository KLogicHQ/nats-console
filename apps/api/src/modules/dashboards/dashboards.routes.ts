import type { FastifyPluginAsync } from 'fastify';
import { CreateDashboardSchema, UpdateDashboardSchema } from '@nats-console/shared';
import { prisma } from '../../lib/prisma.js';
import { authenticate } from '../../common/middleware/auth.js';
import { NotFoundError } from '@nats-console/shared';

export const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /dashboards - List dashboards
  fastify.get('/', async (request) => {
    const dashboards = await prisma.dashboard.findMany({
      where: {
        OR: [
          { orgId: request.user!.orgId, userId: request.user!.sub },
          { orgId: request.user!.orgId, isShared: true },
        ],
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return { dashboards };
  });

  // POST /dashboards - Create dashboard
  fastify.post('/', async (request, reply) => {
    const body = CreateDashboardSchema.parse(request.body);

    const dashboard = await prisma.dashboard.create({
      data: {
        orgId: request.user!.orgId,
        userId: request.user!.sub,
        name: body.name,
        layout: body.layout as any,
        widgets: body.widgets as any,
        isShared: body.isShared,
      },
    });

    return reply.status(201).send({ dashboard });
  });

  // GET /dashboards/:id - Get dashboard
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: request.params.id,
        OR: [
          { orgId: request.user!.orgId, userId: request.user!.sub },
          { orgId: request.user!.orgId, isShared: true },
        ],
      },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (!dashboard) {
      throw new NotFoundError('Dashboard', request.params.id);
    }

    return { dashboard };
  });

  // PATCH /dashboards/:id - Update dashboard
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = UpdateDashboardSchema.parse(request.body);

    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
        userId: request.user!.sub,
      },
    });

    if (!dashboard) {
      throw new NotFoundError('Dashboard', request.params.id);
    }

    const updated = await prisma.dashboard.update({
      where: { id: request.params.id },
      data: {
        name: body.name,
        layout: body.layout as any,
        widgets: body.widgets as any,
        isShared: body.isShared,
      },
    });

    return { dashboard: updated };
  });

  // DELETE /dashboards/:id - Delete dashboard
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
        userId: request.user!.sub,
      },
    });

    if (!dashboard) {
      throw new NotFoundError('Dashboard', request.params.id);
    }

    await prisma.dashboard.delete({
      where: { id: request.params.id },
    });

    return reply.status(204).send();
  });

  // POST /dashboards/:id/clone - Clone dashboard
  fastify.post<{ Params: { id: string } }>('/:id/clone', async (request, reply) => {
    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id: request.params.id,
        OR: [
          { orgId: request.user!.orgId, userId: request.user!.sub },
          { orgId: request.user!.orgId, isShared: true },
        ],
      },
    });

    if (!dashboard) {
      throw new NotFoundError('Dashboard', request.params.id);
    }

    const cloned = await prisma.dashboard.create({
      data: {
        orgId: request.user!.orgId,
        userId: request.user!.sub,
        name: `${dashboard.name} (Copy)`,
        layout: dashboard.layout as any,
        widgets: dashboard.widgets as any,
        isShared: false,
      },
    });

    return reply.status(201).send({ dashboard: cloned });
  });
};
