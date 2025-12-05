import { PrismaClient, IncidentStatus, NotificationChannelType } from '@prisma/client';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import Redis from 'ioredis';
import pino from 'pino';
import { config } from '../config';
import type { AlertSeverity } from '../../../shared/src/index';

const ALERTS_CHANNEL = 'alerts';

const logger = pino({ name: 'alert-processor' });

interface AlertRule {
  id: string;
  orgId: string;
  clusterId: string | null;
  name: string;
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
    window: number;
    aggregation: 'avg' | 'min' | 'max' | 'sum' | 'count';
  };
  threshold: {
    value: number;
    type: 'absolute' | 'percentage';
  };
  severity: AlertSeverity;
  isEnabled: boolean;
  cooldownMins: number;
  notificationChannels: Array<{
    channel: {
      id: string;
      name: string;
      type: NotificationChannelType;
      config: Record<string, unknown>;
      isEnabled: boolean;
    };
  }>;
}

interface AlertState {
  ruleId: string;
  lastFired: number | null;
  isFiring: boolean;
}

export class AlertProcessor {
  private prisma: PrismaClient;
  private clickhouse: ClickHouseClient;
  private redis: Redis;
  private alertStates: Map<string, AlertState> = new Map();
  private processInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.prisma = new PrismaClient();
    this.clickhouse = createClient({
      url: config.CLICKHOUSE_URL,
      database: config.CLICKHOUSE_DATABASE,
      username: config.CLICKHOUSE_USER,
      password: config.CLICKHOUSE_PASSWORD,
    });
    this.redis = new Redis(config.REDIS_URL);
  }

  async start(): Promise<void> {
    logger.info('Starting alert processor...');

    // Process alerts every minute
    this.processInterval = setInterval(() => this.processAlerts(), 60000);

    // Run immediately on start
    await this.processAlerts();

    logger.info('Alert processor started');
  }

  async stop(): Promise<void> {
    logger.info('Stopping alert processor...');

    if (this.processInterval) {
      clearInterval(this.processInterval);
    }

    await this.clickhouse.close();
    await this.redis.quit();
    await this.prisma.$disconnect();

    logger.info('Alert processor stopped');
  }

  isRunning(): boolean {
    return this.processInterval !== null;
  }

  private async processAlerts(): Promise<void> {
    try {
      // Get all enabled alert rules with their notification channels
      const rules = await this.prisma.alertRule.findMany({
        where: { isEnabled: true },
        include: {
          notificationChannels: {
            include: {
              channel: true,
            },
          },
        },
      });

      for (const rule of rules) {
        await this.evaluateRule(rule as unknown as AlertRule);
      }
    } catch (err) {
      logger.error({ err }, 'Error processing alerts');
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<void> {
    try {
      // Get current metric value
      const metricValue = await this.getMetricValue(rule);

      if (metricValue === null) {
        return; // No data available
      }

      // Check if threshold is exceeded
      const isExceeded = this.checkThreshold(metricValue, rule.condition.operator, rule.threshold.value);

      // Check for open incident
      const openIncident = await this.prisma.alertIncident.findFirst({
        where: {
          ruleId: rule.id,
          status: { in: [IncidentStatus.open, IncidentStatus.acknowledged] },
        },
      });

      if (isExceeded && !openIncident) {
        // Check cooldown using in-memory state
        let state = this.alertStates.get(rule.id);
        if (!state) {
          state = { ruleId: rule.id, lastFired: null, isFiring: false };
          this.alertStates.set(rule.id, state);
        }

        if (state.lastFired) {
          const cooldownMs = rule.cooldownMins * 60 * 1000;
          if (Date.now() - state.lastFired < cooldownMs) {
            return; // Still in cooldown
          }
        }

        // Fire alert - create new incident
        await this.fireAlert(rule, metricValue);
        state.isFiring = true;
        state.lastFired = Date.now();
      } else if (!isExceeded && openIncident) {
        // Resolve the incident
        await this.resolveAlert(rule, openIncident.id);
        const state = this.alertStates.get(rule.id);
        if (state) {
          state.isFiring = false;
        }
      }
    } catch (err) {
      logger.error({ ruleId: rule.id, err }, 'Error evaluating alert rule');
    }
  }

  private async getMetricValue(rule: AlertRule): Promise<number | null> {
    const { metric, aggregation, window } = rule.condition;

    // Parse metric name (e.g., "stream.ORDERS.messages_rate" or "consumer.ORDERS.processor.lag")
    const parts = metric.split('.');
    const metricType = parts[0];

    const windowStart = new Date(Date.now() - window * 1000);
    const windowEnd = new Date();

    try {
      if (metricType === 'stream' && parts.length >= 3) {
        const streamName = parts[1];
        const metricName = parts[2];

        const result = await this.clickhouse.query({
          query: `
            SELECT ${aggregation}(${metricName}) as value
            FROM stream_metrics
            WHERE stream_name = {streamName:String}
              ${rule.clusterId ? 'AND cluster_id = {clusterId:UUID}' : ''}
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}
          `,
          query_params: {
            streamName,
            clusterId: rule.clusterId,
            from: windowStart.toISOString(),
            to: windowEnd.toISOString(),
          },
          format: 'JSONEachRow',
        });

        const rows = await result.json<{ value: number }[]>();
        return rows[0]?.value ?? null;
      }

      if (metricType === 'consumer' && parts.length >= 4) {
        const streamName = parts[1];
        const consumerName = parts[2];
        const metricName = parts[3];

        const result = await this.clickhouse.query({
          query: `
            SELECT ${aggregation}(${metricName}) as value
            FROM consumer_metrics
            WHERE stream_name = {streamName:String}
              AND consumer_name = {consumerName:String}
              ${rule.clusterId ? 'AND cluster_id = {clusterId:UUID}' : ''}
              AND timestamp >= {from:DateTime64(3)}
              AND timestamp <= {to:DateTime64(3)}
          `,
          query_params: {
            streamName,
            consumerName,
            clusterId: rule.clusterId,
            from: windowStart.toISOString(),
            to: windowEnd.toISOString(),
          },
          format: 'JSONEachRow',
        });

        const rows = await result.json<{ value: number }[]>();
        return rows[0]?.value ?? null;
      }
    } catch (err) {
      logger.error({ metric, err }, 'Error querying metric');
    }

    return null;
  }

  private checkThreshold(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt':
        return value > threshold;
      case 'lt':
        return value < threshold;
      case 'gte':
        return value >= threshold;
      case 'lte':
        return value <= threshold;
      case 'eq':
        return value === threshold;
      case 'neq':
        return value !== threshold;
      default:
        return false;
    }
  }

  private async fireAlert(rule: AlertRule, metricValue: number): Promise<void> {
    logger.info(
      { ruleId: rule.id, ruleName: rule.name, metricValue, threshold: rule.threshold.value },
      'Alert fired'
    );

    // Create incident in Postgres
    const incident = await this.prisma.alertIncident.create({
      data: {
        ruleId: rule.id,
        status: IncidentStatus.open,
        metadata: {
          metricValue,
          threshold: rule.threshold.value,
          operator: rule.condition.operator,
          metric: rule.condition.metric,
        },
      },
    });

    // Insert alert event into ClickHouse
    await this.clickhouse.insert({
      table: 'alert_events',
      values: [
        {
          id: crypto.randomUUID(),
          org_id: rule.orgId,
          alert_rule_id: rule.id,
          cluster_id: rule.clusterId || '00000000-0000-0000-0000-000000000000',
          timestamp: new Date().toISOString(),
          severity: rule.severity,
          status: 'firing',
          metric_value: metricValue,
          threshold_value: rule.threshold.value,
          message: `Alert "${rule.name}" fired: value ${metricValue} exceeded threshold ${rule.threshold.value}`,
          notified_at: new Date().toISOString(),
          resolved_at: null,
        },
      ],
      format: 'JSONEachRow',
    });

    // Send notifications through configured channels
    const enabledChannels = rule.notificationChannels
      .filter(nc => nc.channel.isEnabled)
      .map(nc => nc.channel);

    for (const channel of enabledChannels) {
      await this.sendNotification(channel, rule, metricValue, 'firing', incident.id);
    }

    // Update incident with notification timestamp
    await this.prisma.alertIncident.update({
      where: { id: incident.id },
      data: { notifiedAt: new Date() },
    });

    // Broadcast to WebSocket clients via Redis
    await this.broadcastAlert({
      type: 'incident_created',
      incident: {
        id: incident.id,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        status: 'open',
        metricValue,
        threshold: rule.threshold.value,
        triggeredAt: new Date().toISOString(),
      },
    });
  }

  private async resolveAlert(rule: AlertRule, incidentId: string): Promise<void> {
    logger.info({ ruleId: rule.id, ruleName: rule.name, incidentId }, 'Alert resolved');

    // Update incident status in Postgres
    await this.prisma.alertIncident.update({
      where: { id: incidentId },
      data: {
        status: IncidentStatus.resolved,
        resolvedAt: new Date(),
      },
    });

    // Insert resolved event into ClickHouse
    await this.clickhouse.insert({
      table: 'alert_events',
      values: [
        {
          id: crypto.randomUUID(),
          org_id: rule.orgId,
          alert_rule_id: rule.id,
          cluster_id: rule.clusterId || '00000000-0000-0000-0000-000000000000',
          timestamp: new Date().toISOString(),
          severity: rule.severity,
          status: 'resolved',
          metric_value: 0,
          threshold_value: rule.threshold.value,
          message: `Alert "${rule.name}" resolved`,
          notified_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
        },
      ],
      format: 'JSONEachRow',
    });

    // Send resolved notifications
    const enabledChannels = rule.notificationChannels
      .filter(nc => nc.channel.isEnabled)
      .map(nc => nc.channel);

    for (const channel of enabledChannels) {
      await this.sendNotification(channel, rule, 0, 'resolved', incidentId);
    }

    // Broadcast to WebSocket clients via Redis
    await this.broadcastAlert({
      type: 'incident_resolved',
      incident: {
        id: incidentId,
        ruleId: rule.id,
        ruleName: rule.name,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
      },
    });
  }

  private async broadcastAlert(data: Record<string, unknown>): Promise<void> {
    try {
      await this.redis.publish(ALERTS_CHANNEL, JSON.stringify(data));
      logger.debug({ type: data.type }, 'Alert broadcasted to WebSocket clients');
    } catch (err) {
      logger.error({ err }, 'Error broadcasting alert to Redis');
    }
  }

  private async sendNotification(
    channel: { id: string; name: string; type: NotificationChannelType; config: Record<string, unknown> },
    rule: AlertRule,
    metricValue: number,
    status: 'firing' | 'resolved',
    incidentId: string
  ): Promise<void> {
    const message =
      status === 'firing'
        ? `🚨 Alert "${rule.name}" fired: value ${metricValue} exceeded threshold ${rule.threshold.value}`
        : `✅ Alert "${rule.name}" resolved`;

    try {
      switch (channel.type) {
        case 'webhook':
          await this.sendWebhook(channel.config.url as string, {
            rule: rule.name,
            severity: rule.severity,
            status,
            metricValue,
            threshold: rule.threshold.value,
            message,
            incidentId,
            timestamp: new Date().toISOString(),
          });
          break;

        case 'slack':
          await this.sendSlackNotification(channel.config, rule, metricValue, status, incidentId);
          break;

        case 'email':
          await this.sendEmailNotification(channel.config, rule, metricValue, status, incidentId);
          break;

        case 'teams':
          await this.sendTeamsNotification(channel.config, rule, metricValue, status, incidentId);
          break;

        case 'pagerduty':
          await this.sendPagerDutyNotification(channel.config, rule, metricValue, status, incidentId);
          break;

        case 'google_chat':
          await this.sendGoogleChatNotification(channel.config, rule, metricValue, status, incidentId);
          break;

        default:
          logger.warn({ channelType: channel.type }, 'Unknown notification channel');
      }

      logger.info({ channelId: channel.id, channelType: channel.type, status }, 'Notification sent');
    } catch (err) {
      logger.error({ channelId: channel.id, channelType: channel.type, err }, 'Failed to send notification');
    }
  }

  private async sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook request failed with status ${response.status}`);
    }
  }

  private async sendSlackNotification(
    config: Record<string, unknown>,
    rule: AlertRule,
    metricValue: number,
    status: 'firing' | 'resolved',
    incidentId: string
  ): Promise<void> {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const color = status === 'firing'
      ? (rule.severity === 'critical' ? '#dc2626' : rule.severity === 'warning' ? '#f59e0b' : '#3b82f6')
      : '#22c55e';

    const payload = {
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: status === 'firing' ? `🚨 Alert: ${rule.name}` : `✅ Resolved: ${rule.name}`,
                emoji: true,
              },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Severity:*\n${rule.severity}` },
                { type: 'mrkdwn', text: `*Status:*\n${status}` },
                { type: 'mrkdwn', text: `*Metric Value:*\n${metricValue}` },
                { type: 'mrkdwn', text: `*Threshold:*\n${rule.threshold.value}` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `Incident ID: ${incidentId}` },
              ],
            },
          ],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed with status ${response.status}`);
    }
  }

  private async sendEmailNotification(
    config: Record<string, unknown>,
    rule: AlertRule,
    metricValue: number,
    status: 'firing' | 'resolved',
    incidentId: string
  ): Promise<void> {
    const apiKey = config.apiKey as string || process.env.RESEND_API_KEY;
    const recipients = config.recipients as string[];
    const fromEmail = config.fromEmail as string || 'alerts@nats-console.local';

    if (!apiKey) {
      logger.warn('Resend API key not configured, skipping email notification');
      return;
    }

    if (!recipients?.length) {
      logger.warn('No email recipients configured');
      return;
    }

    const subject = status === 'firing'
      ? `🚨 Alert: ${rule.name} - ${rule.severity.toUpperCase()}`
      : `✅ Resolved: ${rule.name}`;

    const html = `
      <h2>${status === 'firing' ? '🚨 Alert Fired' : '✅ Alert Resolved'}</h2>
      <p><strong>Alert:</strong> ${rule.name}</p>
      <p><strong>Severity:</strong> ${rule.severity}</p>
      <p><strong>Status:</strong> ${status}</p>
      <p><strong>Metric Value:</strong> ${metricValue}</p>
      <p><strong>Threshold:</strong> ${rule.threshold.value}</p>
      <p><strong>Incident ID:</strong> ${incidentId}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Email notification failed: ${error}`);
    }
  }

  private async sendTeamsNotification(
    config: Record<string, unknown>,
    rule: AlertRule,
    metricValue: number,
    status: 'firing' | 'resolved',
    incidentId: string
  ): Promise<void> {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      throw new Error('Teams webhook URL not configured');
    }

    const themeColor = status === 'firing'
      ? (rule.severity === 'critical' ? 'dc2626' : rule.severity === 'warning' ? 'f59e0b' : '3b82f6')
      : '22c55e';

    const payload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor,
      summary: status === 'firing' ? `Alert: ${rule.name}` : `Resolved: ${rule.name}`,
      sections: [
        {
          activityTitle: status === 'firing' ? `🚨 Alert: ${rule.name}` : `✅ Resolved: ${rule.name}`,
          facts: [
            { name: 'Severity', value: rule.severity },
            { name: 'Status', value: status },
            { name: 'Metric Value', value: String(metricValue) },
            { name: 'Threshold', value: String(rule.threshold.value) },
            { name: 'Incident ID', value: incidentId },
          ],
          markdown: true,
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Teams notification failed with status ${response.status}`);
    }
  }

  private async sendPagerDutyNotification(
    config: Record<string, unknown>,
    rule: AlertRule,
    metricValue: number,
    status: 'firing' | 'resolved',
    incidentId: string
  ): Promise<void> {
    const routingKey = config.routingKey as string;
    if (!routingKey) {
      throw new Error('PagerDuty routing key not configured');
    }

    const severity = rule.severity === 'critical' ? 'critical' : rule.severity === 'warning' ? 'warning' : 'info';

    const payload = {
      routing_key: routingKey,
      event_action: status === 'firing' ? 'trigger' : 'resolve',
      dedup_key: `nats-console-${rule.id}`,
      payload: {
        summary: `${rule.name}: value ${metricValue} ${status === 'firing' ? 'exceeded' : 'back below'} threshold ${rule.threshold.value}`,
        severity,
        source: 'NATS Console',
        custom_details: {
          rule_name: rule.name,
          metric_value: metricValue,
          threshold: rule.threshold.value,
          incident_id: incidentId,
        },
      },
    };

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PagerDuty notification failed: ${error}`);
    }
  }

  private async sendGoogleChatNotification(
    config: Record<string, unknown>,
    rule: AlertRule,
    metricValue: number,
    status: 'firing' | 'resolved',
    incidentId: string
  ): Promise<void> {
    const webhookUrl = config.webhookUrl as string;
    if (!webhookUrl) {
      throw new Error('Google Chat webhook URL not configured');
    }

    const emoji = status === 'firing' ? '🚨' : '✅';
    const title = status === 'firing' ? `Alert: ${rule.name}` : `Resolved: ${rule.name}`;

    const payload = {
      cards: [
        {
          header: {
            title: `${emoji} ${title}`,
            subtitle: `Severity: ${rule.severity}`,
          },
          sections: [
            {
              widgets: [
                {
                  keyValue: {
                    topLabel: 'Metric Value',
                    content: String(metricValue),
                  },
                },
                {
                  keyValue: {
                    topLabel: 'Threshold',
                    content: String(rule.threshold.value),
                  },
                },
                {
                  keyValue: {
                    topLabel: 'Incident ID',
                    content: incidentId,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Google Chat notification failed with status ${response.status}`);
    }
  }
}
