import type { FastifyPluginAsync } from 'fastify';
import { CreateDashboardSchema, UpdateDashboardSchema } from '../../../../shared/src/index';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '../../../../shared/src/index';

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
        description: body.description,
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

    // Only include fields that were provided in the request
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.layout !== undefined) updateData.layout = body.layout;
    if (body.widgets !== undefined) updateData.widgets = body.widgets;
    if (body.isShared !== undefined) updateData.isShared = body.isShared;

    const updated = await prisma.dashboard.update({
      where: { id: request.params.id },
      data: updateData,
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
