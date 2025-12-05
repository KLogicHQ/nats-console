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
import { getClickHouseClient } from '../../lib/clickhouse';

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

    const config = channel.config as Record<string, unknown>;
    const testMessage = {
      rule: 'Test Alert Rule',
      severity: 'info',
      status: 'test',
      metricValue: 42,
      threshold: 100,
      message: 'This is a test notification from NATS Console',
      incidentId: 'test-' + Date.now(),
      timestamp: new Date().toISOString(),
    };

    try {
      switch (channel.type) {
        case 'webhook': {
          const url = config.url as string;
          if (!url) throw new Error('Webhook URL not configured');
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testMessage),
          });
          if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
          break;
        }

        case 'slack': {
          const webhookUrl = config.webhookUrl as string;
          if (!webhookUrl) throw new Error('Slack webhook URL not configured');
          const payload = {
            attachments: [{
              color: '#3b82f6',
              blocks: [
                { type: 'header', text: { type: 'plain_text', text: '🧪 Test Notification', emoji: true } },
                { type: 'section', text: { type: 'mrkdwn', text: 'This is a test notification from NATS Console. Your Slack integration is working correctly!' } },
              ],
            }],
          };
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error(`Slack returned ${response.status}`);
          break;
        }

        case 'email': {
          const apiKey = (config.apiKey as string) || process.env.RESEND_API_KEY;
          const recipients = config.recipients as string[];
          if (!apiKey) throw new Error('Email API key not configured');
          if (!recipients?.length) throw new Error('No email recipients configured');
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              from: (config.fromEmail as string) || 'alerts@nats-console.local',
              to: recipients,
              subject: '🧪 Test Notification - NATS Console',
              html: '<h2>Test Notification</h2><p>This is a test notification from NATS Console. Your email integration is working correctly!</p>',
            }),
          });
          if (!response.ok) throw new Error(`Email API returned ${response.status}`);
          break;
        }

        case 'teams': {
          const webhookUrl = config.webhookUrl as string;
          if (!webhookUrl) throw new Error('Teams webhook URL not configured');
          const payload = {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            themeColor: '3b82f6',
            summary: 'Test Notification',
            sections: [{
              activityTitle: '🧪 Test Notification',
              text: 'This is a test notification from NATS Console. Your Teams integration is working correctly!',
            }],
          };
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error(`Teams returned ${response.status}`);
          break;
        }

        case 'pagerduty': {
          const routingKey = config.routingKey as string;
          if (!routingKey) throw new Error('PagerDuty routing key not configured');
          const payload = {
            routing_key: routingKey,
            event_action: 'trigger',
            dedup_key: `nats-console-test-${Date.now()}`,
            payload: {
              summary: 'Test notification from NATS Console',
              severity: 'info',
              source: 'NATS Console',
              custom_details: { test: true },
            },
          };
          const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error(`PagerDuty returned ${response.status}`);
          break;
        }

        case 'google_chat': {
          const webhookUrl = config.webhookUrl as string;
          if (!webhookUrl) throw new Error('Google Chat webhook URL not configured');
          const payload = {
            cards: [{
              header: { title: '🧪 Test Notification', subtitle: 'NATS Console' },
              sections: [{
                widgets: [{ textParagraph: { text: 'This is a test notification. Your Google Chat integration is working correctly!' } }],
              }],
            }],
          };
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error(`Google Chat returned ${response.status}`);
          break;
        }

        default:
          throw new Error(`Unknown channel type: ${channel.type}`);
      }

      return { success: true, message: 'Test notification sent successfully' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Failed to send test notification' };
    }
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
    const { ruleId, from, to, limit = '100' } = request.query;
    const ch = getClickHouseClient();

    const conditions = ['org_id = {orgId:UUID}'];
    const params: Record<string, unknown> = { orgId: request.user!.orgId };

    if (ruleId) {
      conditions.push('alert_rule_id = {ruleId:UUID}');
      params.ruleId = ruleId;
    }

    if (from) {
      conditions.push('timestamp >= {from:DateTime64(3)}');
      params.from = new Date(from).toISOString();
    }

    if (to) {
      conditions.push('timestamp <= {to:DateTime64(3)}');
      params.to = new Date(to).toISOString();
    }

    const whereClause = conditions.join(' AND ');

    try {
      const result = await ch.query({
        query: `
          SELECT
            id,
            org_id,
            alert_rule_id,
            cluster_id,
            timestamp,
            severity,
            status,
            metric_value,
            threshold_value,
            message,
            notified_at,
            resolved_at
          FROM alert_events
          WHERE ${whereClause}
          ORDER BY timestamp DESC
          LIMIT ${parseInt(limit)}
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await result.json() as Record<string, unknown>[];
      const events = rows.map((row) => ({
        id: row.id,
        orgId: row.org_id,
        ruleId: row.alert_rule_id,
        clusterId: row.cluster_id,
        timestamp: row.timestamp,
        severity: row.severity,
        status: row.status,
        metricValue: Number(row.metric_value),
        thresholdValue: Number(row.threshold_value),
        message: row.message,
        notifiedAt: row.notified_at,
        resolvedAt: row.resolved_at,
      }));

      return { events };
    } catch (err) {
      fastify.log.error({ err }, 'Error querying alert events');
      return { events: [] };
    }
  });

  // POST /alerts/test - Test alert rule evaluation
  fastify.post<{ Body: z.infer<typeof CreateAlertRuleSchema> }>('/test', async (request) => {
    const body = CreateAlertRuleSchema.parse(request.body);
    const ch = getClickHouseClient();

    const { metric, aggregation, window } = body.condition;
    const parts = metric.split('.');
    const metricType = parts[0];

    const windowStart = new Date(Date.now() - window * 1000);
    const windowEnd = new Date();

    try {
      let metricValue: number | null = null;

      if (metricType === 'stream' && parts.length >= 3) {
        const streamName = parts[1];
        const metricName = parts[2];

        const result = await ch.query({
          query: `
            SELECT ${aggregation}(${metricName}) as value
            FROM stream_metrics
            WHERE stream_name = {streamName:String}
              ${body.clusterId ? 'AND cluster_id = {clusterId:UUID}' : ''}
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}
          `,
          query_params: {
            streamName,
            clusterId: body.clusterId,
            from: windowStart.toISOString(),
            to: windowEnd.toISOString(),
          },
          format: 'JSONEachRow',
        });

        const rows = await result.json() as { value: number }[];
        metricValue = rows[0]?.value ?? null;
      } else if (metricType === 'consumer' && parts.length >= 4) {
        const streamName = parts[1];
        const consumerName = parts[2];
        const metricName = parts[3];

        const result = await ch.query({
          query: `
            SELECT ${aggregation}(${metricName}) as value
            FROM consumer_metrics
            WHERE stream_name = {streamName:String}
              AND consumer_name = {consumerName:String}
              ${body.clusterId ? 'AND cluster_id = {clusterId:UUID}' : ''}
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}
          `,
          query_params: {
            streamName,
            consumerName,
            clusterId: body.clusterId,
            from: windowStart.toISOString(),
            to: windowEnd.toISOString(),
          },
          format: 'JSONEachRow',
        });

        const rows = await result.json() as { value: number }[];
        metricValue = rows[0]?.value ?? null;
      }

      if (metricValue === null) {
        return {
          success: true,
          wouldFire: false,
          message: 'No metric data available for the specified window',
          metricValue: null,
          threshold: body.threshold.value,
        };
      }

      // Check threshold
      const { operator } = body.condition;
      let wouldFire = false;
      switch (operator) {
        case 'gt': wouldFire = metricValue > body.threshold.value; break;
        case 'lt': wouldFire = metricValue < body.threshold.value; break;
        case 'gte': wouldFire = metricValue >= body.threshold.value; break;
        case 'lte': wouldFire = metricValue <= body.threshold.value; break;
        case 'eq': wouldFire = metricValue === body.threshold.value; break;
        case 'neq': wouldFire = metricValue !== body.threshold.value; break;
      }

      return {
        success: true,
        wouldFire,
        message: wouldFire
          ? `Alert would fire: ${metricValue} ${operator} ${body.threshold.value}`
          : `Alert would not fire: ${metricValue} ${operator} ${body.threshold.value}`,
        metricValue,
        threshold: body.threshold.value,
      };
    } catch (err: any) {
      return {
        success: false,
        wouldFire: false,
        message: err.message || 'Failed to evaluate alert rule',
        metricValue: null,
        threshold: body.threshold.value,
      };
    }
  });
};
