import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CreateAlertRuleSchema,
  UpdateAlertRuleSchema,
  CreateNotificationChannelSchema,
  UpdateNotificationChannelSchema,
  NotFoundError,
  IncidentStatusSchema,
} from '../../../../shared/src/index';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { IncidentStatus } from '@prisma/client';

// Incident Schemas
const UpdateIncidentSchema = z.object({
  status: IncidentStatusSchema,
});

export const alertRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // ==================== Alert Rules ====================

  // GET /alerts/rules - List alert rules
  fastify.get('/rules', async (request) => {
    const rules = await prisma.alertRule.findMany({
      where: { orgId: request.user!.orgId },
      include: {
        cluster: true,
        notificationChannels: {
          include: { channel: true },
        },
      },
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
        isEnabled: body.isEnabled,
        cooldownMins: body.cooldownMins,
        notificationChannels: body.channelIds?.length
          ? {
              create: body.channelIds.map((channelId: string) => ({
                channelId,
              })),
            }
          : undefined,
      },
      include: {
        notificationChannels: {
          include: { channel: true },
        },
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
      include: {
        cluster: true,
        notificationChannels: {
          include: { channel: true },
        },
        incidents: {
          orderBy: { triggeredAt: 'desc' },
          take: 10,
        },
      },
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

    // If channelIds provided, update the associations
    if (body.channelIds) {
      // Delete existing associations
      await prisma.alertRuleNotificationChannel.deleteMany({
        where: { ruleId: request.params.id },
      });

      // Create new associations
      if (body.channelIds.length > 0) {
        await prisma.alertRuleNotificationChannel.createMany({
          data: body.channelIds.map((channelId: string) => ({
            ruleId: request.params.id,
            channelId,
          })),
        });
      }
    }

    const updated = await prisma.alertRule.update({
      where: { id: request.params.id },
      data: {
        name: body.name,
        clusterId: body.clusterId,
        condition: body.condition as any,
        threshold: body.threshold as any,
        severity: body.severity,
        isEnabled: body.isEnabled,
        cooldownMins: body.cooldownMins,
      },
      include: {
        notificationChannels: {
          include: { channel: true },
        },
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

  // ==================== Notification Channels ====================

  // GET /alerts/channels - List notification channels
  fastify.get('/channels', async (request) => {
    const channels = await prisma.notificationChannel.findMany({
      where: { orgId: request.user!.orgId },
      orderBy: { createdAt: 'desc' },
    });

    return { channels };
  });

  // POST /alerts/channels - Create notification channel
  fastify.post('/channels', async (request, reply) => {
    const body = CreateNotificationChannelSchema.parse(request.body);

    const channel = await prisma.notificationChannel.create({
      data: {
        orgId: request.user!.orgId,
        name: body.name,
        type: body.type,
        config: body.config,
        isEnabled: body.isEnabled,
      },
    });

    return reply.status(201).send({ channel });
  });

  // GET /alerts/channels/:id - Get notification channel
  fastify.get<{ Params: { id: string } }>('/channels/:id', async (request) => {
    const channel = await prisma.notificationChannel.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
      include: {
        alertRules: {
          include: { rule: true },
        },
      },
    });

    if (!channel) {
      throw new NotFoundError('Notification channel', request.params.id);
    }

    return { channel };
  });

  // PATCH /alerts/channels/:id - Update notification channel
  fastify.patch<{ Params: { id: string } }>('/channels/:id', async (request) => {
    const body = UpdateNotificationChannelSchema.parse(request.body);

    const channel = await prisma.notificationChannel.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!channel) {
      throw new NotFoundError('Notification channel', request.params.id);
    }

    const updated = await prisma.notificationChannel.update({
      where: { id: request.params.id },
      data: body,
    });

    return { channel: updated };
  });

  // DELETE /alerts/channels/:id - Delete notification channel
  fastify.delete<{ Params: { id: string } }>('/channels/:id', async (request, reply) => {
    const channel = await prisma.notificationChannel.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!channel) {
      throw new NotFoundError('Notification channel', request.params.id);
    }

    await prisma.notificationChannel.delete({
      where: { id: request.params.id },
    });

    return reply.status(204).send();
  });

  // POST /alerts/channels/:id/test - Test notification channel
  fastify.post<{ Params: { id: string } }>('/channels/:id/test', async (request) => {
    const channel = await prisma.notificationChannel.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!channel) {
      throw new NotFoundError('Notification channel', request.params.id);
    }

    // TODO: Implement actual test notification
    return { success: true, message: 'Test notification sent' };
  });

  // ==================== Incidents ====================

  // GET /alerts/incidents - List incidents
  fastify.get<{
    Querystring: { ruleId?: string; status?: IncidentStatus; limit?: string; offset?: string };
  }>('/incidents', async (request) => {
    const { ruleId, status, limit = '50', offset = '0' } = request.query;

    const where: any = {};

    if (ruleId) {
      where.ruleId = ruleId;
    }

    if (status) {
      where.status = status;
    }

    // Filter by org through the rule
    where.rule = { orgId: request.user!.orgId };

    const [incidents, total] = await Promise.all([
      prisma.alertIncident.findMany({
        where,
        include: {
          rule: {
            select: {
              id: true,
              name: true,
              severity: true,
            },
          },
        },
        orderBy: { triggeredAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.alertIncident.count({ where }),
    ]);

    return { incidents, total };
  });

  // GET /alerts/incidents/:id - Get incident
  fastify.get<{ Params: { id: string } }>('/incidents/:id', async (request) => {
    const incident = await prisma.alertIncident.findFirst({
      where: {
        id: request.params.id,
        rule: { orgId: request.user!.orgId },
      },
      include: {
        rule: true,
      },
    });

    if (!incident) {
      throw new NotFoundError('Incident', request.params.id);
    }

    return { incident };
  });

  // PATCH /alerts/incidents/:id - Update incident status
  fastify.patch<{ Params: { id: string } }>('/incidents/:id', async (request) => {
    const body = UpdateIncidentSchema.parse(request.body);

    const incident = await prisma.alertIncident.findFirst({
      where: {
        id: request.params.id,
        rule: { orgId: request.user!.orgId },
      },
    });

    if (!incident) {
      throw new NotFoundError('Incident', request.params.id);
    }

    const data: any = { status: body.status };

    // Update timestamps based on status change
    if (body.status === IncidentStatus.acknowledged && !incident.acknowledgedAt) {
      data.acknowledgedAt = new Date();
    } else if (body.status === IncidentStatus.resolved && !incident.resolvedAt) {
      data.resolvedAt = new Date();
    } else if (body.status === IncidentStatus.closed && !incident.closedAt) {
      data.closedAt = new Date();
      if (!incident.resolvedAt) {
        data.resolvedAt = new Date();
      }
    }

    const updated = await prisma.alertIncident.update({
      where: { id: request.params.id },
      data,
      include: { rule: true },
    });

    return { incident: updated };
  });

  // POST /alerts/incidents/:id/acknowledge - Acknowledge incident
  fastify.post<{ Params: { id: string } }>('/incidents/:id/acknowledge', async (request) => {
    const incident = await prisma.alertIncident.findFirst({
      where: {
        id: request.params.id,
        rule: { orgId: request.user!.orgId },
      },
    });

    if (!incident) {
      throw new NotFoundError('Incident', request.params.id);
    }

    const updated = await prisma.alertIncident.update({
      where: { id: request.params.id },
      data: {
        status: IncidentStatus.acknowledged,
        acknowledgedAt: new Date(),
      },
      include: { rule: true },
    });

    return { incident: updated };
  });

  // POST /alerts/incidents/:id/resolve - Resolve incident
  fastify.post<{ Params: { id: string } }>('/incidents/:id/resolve', async (request) => {
    const incident = await prisma.alertIncident.findFirst({
      where: {
        id: request.params.id,
        rule: { orgId: request.user!.orgId },
      },
    });

    if (!incident) {
      throw new NotFoundError('Incident', request.params.id);
    }

    const updated = await prisma.alertIncident.update({
      where: { id: request.params.id },
      data: {
        status: IncidentStatus.resolved,
        resolvedAt: new Date(),
      },
      include: { rule: true },
    });

    return { incident: updated };
  });

  // POST /alerts/incidents/:id/close - Close incident
  fastify.post<{ Params: { id: string } }>('/incidents/:id/close', async (request) => {
    const incident = await prisma.alertIncident.findFirst({
      where: {
        id: request.params.id,
        rule: { orgId: request.user!.orgId },
      },
    });

    if (!incident) {
      throw new NotFoundError('Incident', request.params.id);
    }

    const updated = await prisma.alertIncident.update({
      where: { id: request.params.id },
      data: {
        status: IncidentStatus.closed,
        closedAt: new Date(),
        resolvedAt: incident.resolvedAt || new Date(),
      },
      include: { rule: true },
    });

    return { incident: updated };
  });

  // GET /alerts/events - List alert events from ClickHouse
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
