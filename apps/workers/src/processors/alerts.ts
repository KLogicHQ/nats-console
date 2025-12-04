import { PrismaClient } from '@prisma/client';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import pino from 'pino';
import { config } from '../config.js';
import type { AlertSeverity } from '@nats-console/shared';

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
  channels: Array<{ type: string; config: Record<string, unknown> }>;
  isEnabled: boolean;
  cooldownMins: number;
}

interface AlertState {
  ruleId: string;
  lastFired: number | null;
  isFiring: boolean;
}

export class AlertProcessor {
  private prisma: PrismaClient;
  private clickhouse: ClickHouseClient;
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
    await this.prisma.$disconnect();

    logger.info('Alert processor stopped');
  }

  private async processAlerts(): Promise<void> {
    try {
      // Get all enabled alert rules
      const rules = await this.prisma.alertRule.findMany({
        where: { isEnabled: true },
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

      // Get current alert state
      let state = this.alertStates.get(rule.id);
      if (!state) {
        state = { ruleId: rule.id, lastFired: null, isFiring: false };
        this.alertStates.set(rule.id, state);
      }

      if (isExceeded && !state.isFiring) {
        // Check cooldown
        if (state.lastFired) {
          const cooldownMs = rule.cooldownMins * 60 * 1000;
          if (Date.now() - state.lastFired < cooldownMs) {
            return; // Still in cooldown
          }
        }

        // Fire alert
        await this.fireAlert(rule, metricValue);
        state.isFiring = true;
        state.lastFired = Date.now();
      } else if (!isExceeded && state.isFiring) {
        // Resolve alert
        await this.resolveAlert(rule);
        state.isFiring = false;
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

    // Send notifications
    for (const channel of rule.channels) {
      await this.sendNotification(channel, rule, metricValue, 'firing');
    }
  }

  private async resolveAlert(rule: AlertRule): Promise<void> {
    logger.info({ ruleId: rule.id, ruleName: rule.name }, 'Alert resolved');

    // Insert resolved event
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
    for (const channel of rule.channels) {
      await this.sendNotification(channel, rule, 0, 'resolved');
    }
  }

  private async sendNotification(
    channel: { type: string; config: Record<string, unknown> },
    rule: AlertRule,
    metricValue: number,
    status: 'firing' | 'resolved'
  ): Promise<void> {
    const message =
      status === 'firing'
        ? `🚨 Alert "${rule.name}" fired: value ${metricValue} exceeded threshold ${rule.threshold.value}`
        : `✅ Alert "${rule.name}" resolved`;

    switch (channel.type) {
      case 'webhook':
        await this.sendWebhook(channel.config.url as string, {
          rule: rule.name,
          severity: rule.severity,
          status,
          metricValue,
          threshold: rule.threshold.value,
          message,
          timestamp: new Date().toISOString(),
        });
        break;

      case 'slack':
        // TODO: Implement Slack notification
        logger.info({ channel: 'slack', message }, 'Would send Slack notification');
        break;

      case 'email':
        // TODO: Implement email notification
        logger.info({ channel: 'email', message }, 'Would send email notification');
        break;

      case 'pagerduty':
        // TODO: Implement PagerDuty notification
        logger.info({ channel: 'pagerduty', message }, 'Would send PagerDuty notification');
        break;

      default:
        logger.warn({ channelType: channel.type }, 'Unknown notification channel');
    }
  }

  private async sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.error({ url, status: response.status }, 'Webhook request failed');
      }
    } catch (err) {
      logger.error({ url, err }, 'Error sending webhook');
    }
  }
}
