/**
 * Setup test streams and consumers for NATS Console testing
 */
import { connect, JetStreamManager, RetentionPolicy, StorageType, AckPolicy, DeliverPolicy } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';

async function main() {
  console.log('Connecting to NATS at', NATS_URL);
  const nc = await connect({ servers: NATS_URL });
  const jsm = await nc.jetstreamManager();

  console.log('\n=== Setting up test streams ===\n');

  // Stream 1: ORDERS - typical e-commerce order stream
  await createStreamIfNotExists(jsm, {
    name: 'ORDERS',
    subjects: ['orders.>', 'orders.created', 'orders.updated', 'orders.shipped', 'orders.completed'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 100000,
    max_bytes: 100 * 1024 * 1024, // 100MB
    max_age: 7 * 24 * 60 * 60 * 1e9, // 7 days in nanoseconds
    description: 'E-commerce order events',
  });

  // Stream 2: EVENTS - generic event stream
  await createStreamIfNotExists(jsm, {
    name: 'EVENTS',
    subjects: ['events.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 50000,
    description: 'Generic application events',
  });

  // Stream 3: LOGS - log aggregation stream
  await createStreamIfNotExists(jsm, {
    name: 'LOGS',
    subjects: ['logs.>', 'logs.info', 'logs.warn', 'logs.error'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 1000000,
    max_bytes: 500 * 1024 * 1024, // 500MB
    max_age: 3 * 24 * 60 * 60 * 1e9, // 3 days
    description: 'Application logs',
  });

  // Stream 4: METRICS - time-series metrics
  await createStreamIfNotExists(jsm, {
    name: 'METRICS',
    subjects: ['metrics.>'],
    retention: RetentionPolicy.Limits,
    storage: StorageType.Memory,
    max_msgs: 100000,
    max_age: 1 * 60 * 60 * 1e9, // 1 hour
    description: 'Real-time metrics (memory storage)',
  });

  // Stream 5: NOTIFICATIONS - work queue pattern
  await createStreamIfNotExists(jsm, {
    name: 'NOTIFICATIONS',
    subjects: ['notify.email', 'notify.sms', 'notify.push'],
    retention: RetentionPolicy.WorkQueue,
    storage: StorageType.File,
    description: 'Notification work queue',
  });

  console.log('\n=== Setting up test consumers ===\n');

  // Consumers for ORDERS stream
  await createConsumerIfNotExists(jsm, 'ORDERS', {
    durable_name: 'order-processor',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subject: 'orders.created',
    description: 'Processes new orders',
  });

  await createConsumerIfNotExists(jsm, 'ORDERS', {
    durable_name: 'shipping-service',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subject: 'orders.shipped',
    description: 'Handles shipping notifications',
  });

  await createConsumerIfNotExists(jsm, 'ORDERS', {
    durable_name: 'analytics-collector',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    description: 'Collects all order events for analytics',
  });

  // Consumers for EVENTS stream
  await createConsumerIfNotExists(jsm, 'EVENTS', {
    durable_name: 'event-logger',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    description: 'Logs all events',
  });

  // Consumers for LOGS stream
  await createConsumerIfNotExists(jsm, 'LOGS', {
    durable_name: 'error-alerter',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.New,
    filter_subject: 'logs.error',
    description: 'Alerts on error logs',
  });

  // Consumers for NOTIFICATIONS stream
  await createConsumerIfNotExists(jsm, 'NOTIFICATIONS', {
    durable_name: 'email-sender',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subject: 'notify.email',
    description: 'Sends email notifications',
  });

  await createConsumerIfNotExists(jsm, 'NOTIFICATIONS', {
    durable_name: 'sms-sender',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    filter_subject: 'notify.sms',
    description: 'Sends SMS notifications',
  });

  console.log('\n=== Setup complete ===\n');

  // List all streams
  console.log('Streams:');
  for await (const si of jsm.streams()) {
    console.log(`  - ${si.config.name}: ${si.state.messages} messages, ${(si.state.bytes / 1024).toFixed(2)} KB`);
  }

  await nc.close();
}

async function createStreamIfNotExists(jsm: JetStreamManager, config: any) {
  try {
    await jsm.streams.info(config.name);
    console.log(`Stream ${config.name} already exists, updating...`);
    await jsm.streams.update(config.name, config);
  } catch (err: any) {
    if (err.message.includes('not found')) {
      console.log(`Creating stream ${config.name}...`);
      await jsm.streams.add(config);
    } else {
      throw err;
    }
  }
}

async function createConsumerIfNotExists(jsm: JetStreamManager, stream: string, config: any) {
  try {
    await jsm.consumers.info(stream, config.durable_name);
    console.log(`Consumer ${stream}/${config.durable_name} already exists`);
  } catch (err: any) {
    if (err.message.includes('not found')) {
      console.log(`Creating consumer ${stream}/${config.durable_name}...`);
      await jsm.consumers.add(stream, config);
    } else {
      throw err;
    }
  }
}

main().catch(console.error);
