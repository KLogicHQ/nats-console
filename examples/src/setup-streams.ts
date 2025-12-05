/**
 * Setup realistic test streams and consumers for NATS Console
 * Covers common industry use cases: E-commerce, IoT, Financial, Chat, Analytics
 */
import {
  connect,
  JetStreamManager,
  RetentionPolicy,
  StorageType,
  AckPolicy,
  DeliverPolicy,
  DiscardPolicy,
  ReplayPolicy,
} from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';

// ==================== Stream Configurations ====================

const STREAM_CONFIGS = [
  // E-Commerce: Order Processing Pipeline
  {
    name: 'ORDERS',
    subjects: ['orders.created', 'orders.updated', 'orders.paid', 'orders.shipped', 'orders.delivered', 'orders.cancelled', 'orders.refunded'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500000,
    max_bytes: 500 * 1024 * 1024, // 500MB
    max_age: 30 * 24 * 60 * 60 * 1e9, // 30 days
    max_msg_size: 64 * 1024, // 64KB per message
    discard: DiscardPolicy.Old,
    description: 'E-commerce order lifecycle events',
  },

  // E-Commerce: Inventory Management
  {
    name: 'INVENTORY',
    subjects: ['inventory.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 1000000,
    max_bytes: 200 * 1024 * 1024,
    max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days
    description: 'Inventory stock updates and reservations',
  },

  // IoT: Sensor Data (High Volume)
  {
    name: 'IOT_SENSORS',
    subjects: ['iot.temperature.>', 'iot.humidity.>', 'iot.pressure.>', 'iot.motion.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500000,
    max_bytes: 100 * 1024 * 1024, // 100MB (reduced for dev)
    max_age: 24 * 60 * 60 * 1e9, // 24 hours
    max_msg_size: 1024, // 1KB - small sensor payloads
    discard: DiscardPolicy.Old,
    description: 'IoT sensor telemetry data',
  },

  // IoT: Device Commands (Work Queue)
  {
    name: 'IOT_COMMANDS',
    subjects: ['iot.cmd.>'],
    retention: RetentionPolicy.WorkQueue,
    storage: StorageType.File,
    max_msgs: 100000,
    description: 'IoT device command queue',
  },

  // Financial: Payment Transactions
  {
    name: 'PAYMENTS',
    subjects: ['payment.initiated', 'payment.authorized', 'payment.captured', 'payment.failed', 'payment.refunded'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 1000000,
    max_bytes: 1024 * 1024 * 1024, // 1GB
    max_age: 90 * 24 * 60 * 60 * 1e9, // 90 days for compliance
    num_replicas: 1,
    description: 'Payment transaction events',
  },

  // Financial: Fraud Detection (Real-time)
  {
    name: 'FRAUD_DETECTION',
    subjects: ['fraud.check', 'fraud.alert', 'fraud.decision'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory, // Memory for low latency
    max_msgs: 50000,
    max_age: 1 * 60 * 60 * 1e9, // 1 hour
    description: 'Real-time fraud detection events',
  },

  // Chat/Messaging: User Messages
  {
    name: 'CHAT_MESSAGES',
    subjects: ['chat.room.>', 'chat.dm.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500000,
    max_bytes: 100 * 1024 * 1024, // 100MB (reduced for dev)
    max_age: 30 * 24 * 60 * 60 * 1e9, // 30 days for dev
    description: 'Chat and direct message history',
  },

  // Chat: Presence & Typing Indicators (Ephemeral)
  {
    name: 'CHAT_PRESENCE',
    subjects: ['presence.online', 'presence.offline', 'presence.typing'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory,
    max_msgs: 10000,
    max_age: 5 * 60 * 1e9, // 5 minutes
    description: 'Ephemeral presence and typing indicators',
  },

  // Analytics: User Activity Tracking
  {
    name: 'USER_ACTIVITY',
    subjects: ['activity.pageview', 'activity.click', 'activity.search', 'activity.conversion'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500000,
    max_bytes: 100 * 1024 * 1024, // 100MB (reduced for dev)
    max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days
    description: 'User behavior analytics events',
  },

  // Notifications: Multi-channel (Work Queue)
  {
    name: 'NOTIFICATIONS',
    subjects: ['notify.email', 'notify.sms', 'notify.push', 'notify.webhook', 'notify.slack'],
    retention: RetentionPolicy.WorkQueue,
    storage: StorageType.File,
    max_msgs: 500000,
    max_bytes: 100 * 1024 * 1024,
    description: 'Multi-channel notification work queue',
  },

  // System: Application Logs
  {
    name: 'APP_LOGS',
    subjects: ['app.logs.debug', 'app.logs.info', 'app.logs.warn', 'app.logs.error', 'app.logs.fatal'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500000,
    max_bytes: 100 * 1024 * 1024, // 100MB (reduced for dev)
    max_age: 3 * 24 * 60 * 60 * 1e9, // 3 days
    description: 'Application log aggregation',
  },

  // System: Audit Trail (Compliance)
  {
    name: 'AUDIT_TRAIL',
    subjects: ['audit.user.>', 'audit.admin.>', 'audit.system.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500000,
    max_bytes: 100 * 1024 * 1024, // 100MB (reduced for dev)
    max_age: 30 * 24 * 60 * 60 * 1e9, // 30 days for dev
    description: 'Audit trail for compliance and security',
  },

  // System: Metrics (Time-series)
  {
    name: 'METRICS',
    subjects: ['metrics.cpu', 'metrics.memory', 'metrics.disk', 'metrics.network', 'metrics.custom.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory,
    max_msgs: 500000,
    max_age: 2 * 60 * 60 * 1e9, // 2 hours
    description: 'Real-time system and application metrics',
  },

  // Dead Letter Queue: Failed messages from all streams
  {
    name: 'DLQ',
    subjects: ['dlq.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 1000000,
    max_bytes: 1024 * 1024 * 1024, // 1GB
    max_age: 30 * 24 * 60 * 60 * 1e9, // 30 days - keep failed messages for investigation
    description: 'Dead letter queue for failed messages requiring manual investigation',
  },

  // DLQ Processing Queue: Messages being reprocessed
  {
    name: 'DLQ_RETRY',
    subjects: ['retry.dlq.>'],
    retention: RetentionPolicy.WorkQueue,
    storage: StorageType.File,
    max_msgs: 100000,
    description: 'Work queue for DLQ message reprocessing',
  },
];

// ==================== Consumer Configurations ====================

const CONSUMER_CONFIGS = [
  // Order Processing Consumers
  { stream: 'ORDERS', durable_name: 'order-validator', filter_subject: 'orders.created', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Validates new orders' },
  { stream: 'ORDERS', durable_name: 'payment-initiator', filter_subject: 'orders.created', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Initiates payment for orders' },
  { stream: 'ORDERS', durable_name: 'inventory-reserver', filter_subject: 'orders.paid', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Reserves inventory after payment' },
  { stream: 'ORDERS', durable_name: 'fulfillment-service', filter_subject: 'orders.paid', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Handles order fulfillment' },
  { stream: 'ORDERS', durable_name: 'shipping-notifier', filter_subject: 'orders.shipped', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Sends shipping notifications' },
  { stream: 'ORDERS', durable_name: 'order-analytics', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Collects all order events for analytics' },

  // Inventory Consumers
  { stream: 'INVENTORY', durable_name: 'stock-alerter', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Alerts on low stock' },
  { stream: 'INVENTORY', durable_name: 'warehouse-sync', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Syncs with warehouse systems' },

  // IoT Consumers
  { stream: 'IOT_SENSORS', durable_name: 'temperature-analyzer', filter_subject: 'iot.temperature.>', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Analyzes temperature data' },
  { stream: 'IOT_SENSORS', durable_name: 'anomaly-detector', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Detects sensor anomalies' },
  { stream: 'IOT_SENSORS', durable_name: 'data-archiver', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Archives sensor data to cold storage' },
  { stream: 'IOT_COMMANDS', durable_name: 'command-executor', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Executes device commands' },

  // Payment Consumers
  { stream: 'PAYMENTS', durable_name: 'fraud-checker', filter_subject: 'payment.initiated', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Checks payments for fraud' },
  { stream: 'PAYMENTS', durable_name: 'accounting-sync', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Syncs with accounting system' },
  { stream: 'PAYMENTS', durable_name: 'receipt-generator', filter_subject: 'payment.captured', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Generates payment receipts' },

  // Fraud Detection Consumers
  { stream: 'FRAUD_DETECTION', durable_name: 'ml-scorer', filter_subject: 'fraud.check', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'ML-based fraud scoring' },
  { stream: 'FRAUD_DETECTION', durable_name: 'alert-handler', filter_subject: 'fraud.alert', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Handles fraud alerts' },

  // Chat Consumers
  { stream: 'CHAT_MESSAGES', durable_name: 'message-indexer', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Indexes messages for search' },
  { stream: 'CHAT_MESSAGES', durable_name: 'moderation-bot', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Content moderation' },
  { stream: 'CHAT_MESSAGES', durable_name: 'notification-sender', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Sends push notifications' },

  // Notification Consumers
  { stream: 'NOTIFICATIONS', durable_name: 'email-sender', filter_subject: 'notify.email', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Sends email notifications' },
  { stream: 'NOTIFICATIONS', durable_name: 'sms-sender', filter_subject: 'notify.sms', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Sends SMS notifications' },
  { stream: 'NOTIFICATIONS', durable_name: 'push-sender', filter_subject: 'notify.push', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Sends push notifications' },
  { stream: 'NOTIFICATIONS', durable_name: 'webhook-dispatcher', filter_subject: 'notify.webhook', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Dispatches webhooks' },
  { stream: 'NOTIFICATIONS', durable_name: 'slack-sender', filter_subject: 'notify.slack', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Sends Slack notifications' },

  // Analytics Consumers
  { stream: 'USER_ACTIVITY', durable_name: 'realtime-dashboard', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Real-time analytics dashboard' },
  { stream: 'USER_ACTIVITY', durable_name: 'clickstream-processor', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Processes clickstream data' },
  { stream: 'USER_ACTIVITY', durable_name: 'conversion-tracker', filter_subject: 'activity.conversion', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Tracks conversions' },

  // Log Consumers
  { stream: 'APP_LOGS', durable_name: 'error-alerter', filter_subject: 'app.logs.error', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Alerts on errors' },
  { stream: 'APP_LOGS', durable_name: 'fatal-alerter', filter_subject: 'app.logs.fatal', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Critical alerts on fatal errors' },
  { stream: 'APP_LOGS', durable_name: 'log-aggregator', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Aggregates logs for analysis' },

  // Audit Consumers
  { stream: 'AUDIT_TRAIL', durable_name: 'compliance-reporter', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Generates compliance reports' },
  { stream: 'AUDIT_TRAIL', durable_name: 'security-monitor', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Monitors security events' },

  // Metrics Consumers
  { stream: 'METRICS', durable_name: 'metrics-aggregator', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Aggregates metrics' },
  { stream: 'METRICS', durable_name: 'threshold-alerter', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.New, description: 'Alerts on threshold breaches' },

  // DLQ Consumers - with max_deliver for retry limits
  { stream: 'DLQ', durable_name: 'dlq-orders', filter_subject: 'dlq.orders.>', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Failed order messages' },
  { stream: 'DLQ', durable_name: 'dlq-payments', filter_subject: 'dlq.payments.>', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Failed payment messages' },
  { stream: 'DLQ', durable_name: 'dlq-notifications', filter_subject: 'dlq.notifications.>', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Failed notification messages' },
  { stream: 'DLQ', durable_name: 'dlq-iot', filter_subject: 'dlq.iot.>', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'Failed IoT messages' },
  { stream: 'DLQ', durable_name: 'dlq-all', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, description: 'All DLQ messages for monitoring' },
  { stream: 'DLQ_RETRY', durable_name: 'retry-processor', ack_policy: AckPolicy.Explicit, deliver_policy: DeliverPolicy.All, max_deliver: 3, description: 'Processes retry queue with 3 attempt limit' },
];

// ==================== Main Setup Function ====================

async function main() {
  console.log('Connecting to NATS at', NATS_URL);
  const nc = await connect({ servers: NATS_URL });
  const jsm = await nc.jetstreamManager();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         NATS JetStream - Realistic Streams Setup            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Create streams
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━ Creating Streams ━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const config of STREAM_CONFIGS) {
    await createStreamIfNotExists(jsm, config);
  }

  // Create consumers
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━ Creating Consumers ━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const config of CONSUMER_CONFIGS) {
    await createConsumerIfNotExists(jsm, config.stream, config);
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      Setup Complete!                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('Stream Summary:');
  console.log('─'.repeat(70));
  for await (const si of jsm.streams.list()) {
    const sizeKB = (si.state.bytes / 1024).toFixed(2);
    const storage = si.config.storage === StorageType.Memory ? '💾 Memory' : '📁 File';
    console.log(`  ${si.config.name.padEnd(20)} │ ${storage.padEnd(12)} │ ${si.state.messages.toString().padStart(8)} msgs │ ${sizeKB.padStart(10)} KB`);
  }

  console.log('\nConsumer Summary:');
  console.log('─'.repeat(70));
  let totalConsumers = 0;
  for await (const si of jsm.streams.list()) {
    const consumers = await jsm.consumers.list(si.config.name).next();
    if (consumers.length > 0) {
      console.log(`  ${si.config.name}:`);
      for (const c of consumers) {
        console.log(`    └─ ${c.name} (${c.config.filter_subject || 'all subjects'})`);
        totalConsumers++;
      }
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`Total: ${STREAM_CONFIGS.length} streams, ${totalConsumers} consumers`);
  console.log('═'.repeat(70) + '\n');

  await nc.close();
}

async function createStreamIfNotExists(jsm: JetStreamManager, config: any) {
  try {
    const info = await jsm.streams.info(config.name);
    console.log(`  ✓ ${config.name} (exists - ${info.state.messages} messages)`);
    // Update configuration
    await jsm.streams.update(config.name, config);
  } catch (err: any) {
    if (err.message.includes('not found')) {
      await jsm.streams.add(config);
      console.log(`  + ${config.name} (created)`);
    } else {
      console.error(`  ✗ ${config.name}: ${err.message}`);
    }
  }
}

async function createConsumerIfNotExists(jsm: JetStreamManager, stream: string, config: any) {
  const { stream: _, ...consumerConfig } = config;
  try {
    await jsm.consumers.info(stream, config.durable_name);
    console.log(`  ✓ ${stream}/${config.durable_name}`);
  } catch (err: any) {
    if (err.message.includes('not found')) {
      await jsm.consumers.add(stream, consumerConfig);
      console.log(`  + ${stream}/${config.durable_name}`);
    } else {
      console.error(`  ✗ ${stream}/${config.durable_name}: ${err.message}`);
    }
  }
}

main().catch(console.error);
