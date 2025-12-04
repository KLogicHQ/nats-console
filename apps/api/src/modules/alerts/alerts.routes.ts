import type { FastifyPluginAsync } from 'fastify';
import { CreateAlertRuleSchema, UpdateAlertRuleSchema } from '../../../../shared/src/index';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '../../../../shared/src/index';

export const alertRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /alerts/rules - List alert rules
  fastify.get('/rules', async (request) => {
    const rules = await prisma.alertRule.findMany({
      where: { orgId: request.user!.orgId },
      include: { cluster: true },
      orderBy: { createdAt: 'desc' },
    });

    return { rules };
  });

  // POST /alerts/rules - Create alert rule
  fastify.post('/rules', async (request, reply) => {
    const body = CreateAlertRuleSchema.parse(request.body);

    const rule = await prisma.alertRule.create({
      data: {
        orgId: request.user!.orgId,
        clusterId: body.clusterId,
        name: body.name,
        condition: body.condition as any,
        threshold: body.threshold as any,
        severity: body.severity,
        channels: body.channels as any,
        isEnabled: body.isEnabled,
        cooldownMins: body.cooldownMins,
      },
    });

    return reply.status(201).send({ rule });
  });

  // GET /alerts/rules/:id - Get alert rule
  fastify.get<{ Params: { id: string } }>('/rules/:id', async (request) => {
    const rule = await prisma.alertRule.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
      include: { cluster: true },
    });

    if (!rule) {
      throw new NotFoundError('Alert rule', request.params.id);
    }

    return { rule };
  });

  // PATCH /alerts/rules/:id - Update alert rule
  fastify.patch<{ Params: { id: string } }>('/rules/:id', async (request) => {
    const body = UpdateAlertRuleSchema.parse(request.body);

    const rule = await prisma.alertRule.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!rule) {
      throw new NotFoundError('Alert rule', request.params.id);
    }

    const updated = await prisma.alertRule.update({
      where: { id: request.params.id },
      data: {
        name: body.name,
        clusterId: body.clusterId,
        condition: body.condition as any,
        threshold: body.threshold as any,
        severity: body.severity,
        channels: body.channels as any,
        isEnabled: body.isEnabled,
        cooldownMins: body.cooldownMins,
      },
    });

    return { rule: updated };
  });

  // DELETE /alerts/rules/:id - Delete alert rule
  fastify.delete<{ Params: { id: string } }>('/rules/:id', async (request, reply) => {
    const rule = await prisma.alertRule.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!rule) {
      throw new NotFoundError('Alert rule', request.params.id);
    }

    await prisma.alertRule.delete({
      where: { id: request.params.id },
    });

    return reply.status(204).send();
  });

  // GET /alerts/events - List alert events
  fastify.get<{
    Querystring: { ruleId?: string; from?: string; to?: string; limit?: string };
  }>('/events', async (request) => {
    // TODO: Query from ClickHouse
    return { events: [] };
  });

  // POST /alerts/test - Test alert rule
  fastify.post('/test', async (request) => {
    const body = CreateAlertRuleSchema.parse(request.body);
    // TODO: Implement test alert
    return { success: true, message: 'Test alert sent' };
  });
};
