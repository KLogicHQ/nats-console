/**
 * Advanced multi-scenario consumer for realistic NATS JetStream testing
 * Supports different consumption patterns: batch, work queue, filtered, multi-stream
 */
import { connect, StringCodec, AckPolicy, DeliverPolicy, JetStreamClient, NatsConnection } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const MODE = process.env.MODE || 'interactive'; // interactive, batch, workqueue, filtered, multistream
const STREAM = process.env.STREAM || 'ORDERS';
const CONSUMER = process.env.CONSUMER;
const FILTER = process.env.FILTER; // e.g., 'orders.created'
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');
const PROCESSING_TIME = parseInt(process.env.PROCESSING_TIME || '100'); // ms

const sc = StringCodec();

interface ConsumerStats {
  processed: number;
  errors: number;
  avgProcessingTime: number;
  totalProcessingTime: number;
  startTime: number;
  bySubject: Record<string, number>;
}

const stats: ConsumerStats = {
  processed: 0,
  errors: 0,
  avgProcessingTime: 0,
  totalProcessingTime: 0,
  startTime: Date.now(),
  bySubject: {},
};

// ==================== Message Handlers ====================

function handleOrderMessage(data: any, subject: string): void {
  const action = subject.split('.')[1];
  switch (action) {
    case 'created':
      console.log(`  📦 New order: ${data.orderId} - $${data.total} (${data.items?.length || 0} items)`);
      break;
    case 'paid':
      console.log(`  💳 Payment received: ${data.orderId} - $${data.total}`);
      break;
    case 'shipped':
      console.log(`  🚚 Order shipped: ${data.orderId} to ${data.shippingAddress?.city || 'unknown'}`);
      break;
    case 'delivered':
      console.log(`  ✅ Order delivered: ${data.orderId}`);
      break;
    case 'cancelled':
      console.log(`  ❌ Order cancelled: ${data.orderId}`);
      break;
    default:
      console.log(`  📋 Order update: ${data.orderId} - ${action}`);
  }
}

function handlePaymentMessage(data: any, subject: string): void {
  const status = subject.split('.')[1];
  const icon = { initiated: '🔄', authorized: '✓', captured: '💰', failed: '❌', refunded: '↩️' }[status] || '💳';
  console.log(`  ${icon} Payment ${status}: ${data.paymentId} - $${data.amount} via ${data.method}`);
}

function handleIoTMessage(data: any, subject: string): void {
  const parts = subject.split('.');
  const sensorType = parts[1];
  const zone = parts[2];
  console.log(`  📡 Sensor [${zone}] ${sensorType}: ${data.value}${data.unit} (device: ${data.deviceId})`);
}

function handleChatMessage(data: any, subject: string): void {
  const type = subject.includes('dm') ? 'DM' : 'Room';
  console.log(`  💬 ${type}: "${data.content?.substring(0, 40)}..." from ${data.senderId}`);
}

function handleActivityMessage(data: any, subject: string): void {
  const eventType = subject.split('.')[1];
  const details = data.page || data.searchQuery || data.productId || '';
  console.log(`  📊 Activity [${eventType}]: User ${data.userId} - ${details}`);
}

function handleLogMessage(data: any, subject: string): void {
  const parts = subject.split('.');
  const level = parts[parts.length - 1]; // Handle both 'logs.info' and 'app.logs.info'
  const icons = { debug: '🔍', info: 'ℹ️', warn: '⚠️', error: '❌', fatal: '💀' };
  const icon = icons[level as keyof typeof icons] || '📝';
  console.log(`  ${icon} [${data.service}] ${data.message}`);
}

function handleNotificationMessage(data: any, subject: string): void {
  const channel = subject.split('.')[1];
  const icons = { email: '📧', sms: '📱', push: '🔔', webhook: '🔗', slack: '💬' };
  const icon = icons[channel as keyof typeof icons] || '📨';
  console.log(`  ${icon} Notification [${channel}]: ${data.recipient || data.to || 'unknown'}`);
}

function handleGenericMessage(data: any, subject: string): void {
  const preview = JSON.stringify(data).substring(0, 80);
  console.log(`  📄 ${subject}: ${preview}...`);
}

function handleDLQMessage(data: any, subject: string): void {
  const parts = subject.split('.');
  // Handle both 'dlq.orders.validation_error' and 'retry.dlq.orders'
  const isRetry = parts[0] === 'retry' || parts[1] === 'retry';
  const sourceStream = isRetry ? (parts[0] === 'retry' ? parts[2] : parts[2]) : parts[1];
  const failureReason = isRetry ? 'retry' : parts[2];

  if (isRetry) {
    console.log(`  🔄 DLQ Retry [${sourceStream}]: Attempt #${data.retryMetadata?.retryNumber || '?'}`);
    console.log(`     Original: ${data.dlqMetadata?.originalSubject || 'unknown'}`);
    console.log(`     Error: ${data.dlqMetadata?.failureDetails || 'unknown'}`);
  } else {
    const icons: Record<string, string> = {
      validation_error: '❌',
      processing_timeout: '⏰',
      downstream_unavailable: '🔌',
      data_corruption: '💔',
      rate_limited: '🚫',
      schema_mismatch: '📋',
    };
    const icon = icons[failureReason] || '💀';
    console.log(`  ${icon} DLQ [${sourceStream}]: ${failureReason}`);
    console.log(`     ID: ${data.dlqMetadata?.id || 'unknown'}`);
    console.log(`     Error: ${data.dlqMetadata?.errorCode || 'unknown'} - ${data.dlqMetadata?.failureDetails || ''}`);
    console.log(`     Attempts: ${data.dlqMetadata?.attemptCount || 0}/${data.dlqMetadata?.maxAttempts || 5}`);
  }
}

function processMessage(data: any, subject: string): void {
  const stream = subject.split('.')[0];

  switch (stream) {
    case 'orders':
      handleOrderMessage(data, subject);
      break;
    case 'payment':
      handlePaymentMessage(data, subject);
      break;
    case 'iot':
      handleIoTMessage(data, subject);
      break;
    case 'chat':
      handleChatMessage(data, subject);
      break;
    case 'activity':
      handleActivityMessage(data, subject);
      break;
    case 'logs':
    case 'app': // Handle 'app.logs.*' subjects
      handleLogMessage(data, subject);
      break;
    case 'notify':
      handleNotificationMessage(data, subject);
      break;
    case 'dlq': // Handle DLQ messages
    case 'retry': // Handle retry.dlq.* messages
      handleDLQMessage(data, subject);
      break;
    default:
      handleGenericMessage(data, subject);
  }
}

// ==================== Consumer Modes ====================

async function runInteractiveMode(nc: NatsConnection) {
  console.log('\n📋 Interactive Mode - Processing messages one by one\n');

  const js = nc.jetstream();
  const consumerName = CONSUMER || `interactive-${Date.now()}`;

  console.log(`Stream: ${STREAM}`);
  console.log(`Consumer: ${consumerName}`);
  if (FILTER) console.log(`Filter: ${FILTER}`);
  console.log('\n' + '─'.repeat(70) + '\n');

  let consumer;
  try {
    consumer = await js.consumers.get(STREAM, consumerName);
    console.log(`Using existing consumer: ${consumerName}\n`);
  } catch {
    console.log(`Creating ephemeral consumer...\n`);
    const config: any = {
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.New,
    };
    if (FILTER) config.filter_subject = FILTER;
    consumer = await js.consumers.get(STREAM, config);
  }

  const messages = await consumer.consume({ max_messages: BATCH_SIZE });

  for await (const msg of messages) {
    const startProcess = Date.now();

    try {
      const data = JSON.parse(sc.decode(msg.data));
      console.log(`[${msg.seq}] ${msg.subject}:`);
      processMessage(data, msg.subject);

      // Simulate processing time
      await sleep(PROCESSING_TIME);
      msg.ack();

      stats.processed++;
      stats.bySubject[msg.subject] = (stats.bySubject[msg.subject] || 0) + 1;
    } catch (err: any) {
      console.error(`  ❌ Error processing message: ${err.message}`);
      msg.nak();
      stats.errors++;
    }

    stats.totalProcessingTime += Date.now() - startProcess;
    stats.avgProcessingTime = stats.totalProcessingTime / stats.processed;
  }
}

async function runBatchMode(nc: NatsConnection) {
  console.log('\n📦 Batch Mode - Processing messages in batches\n');

  const js = nc.jetstream();
  const consumerName = CONSUMER || `batch-${Date.now()}`;

  console.log(`Stream: ${STREAM}`);
  console.log(`Consumer: ${consumerName}`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log('\n' + '─'.repeat(70) + '\n');

  let consumer;
  try {
    consumer = await js.consumers.get(STREAM, consumerName);
  } catch {
    const config: any = {
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
    };
    if (FILTER) config.filter_subject = FILTER;
    consumer = await js.consumers.get(STREAM, config);
  }

  while (true) {
    const batch = await consumer.fetch({ max_messages: BATCH_SIZE, expires: 5000 });
    const messages: any[] = [];

    for await (const msg of batch) {
      messages.push(msg);
    }

    if (messages.length === 0) {
      console.log('No messages in batch, waiting...');
      await sleep(2000);
      continue;
    }

    console.log(`\n📦 Processing batch of ${messages.length} messages:`);

    for (const msg of messages) {
      try {
        const data = JSON.parse(sc.decode(msg.data));
        processMessage(data, msg.subject);
        msg.ack();
        stats.processed++;
        stats.bySubject[msg.subject] = (stats.bySubject[msg.subject] || 0) + 1;
      } catch (err: any) {
        console.error(`  ❌ Error: ${err.message}`);
        msg.nak();
        stats.errors++;
      }
    }

    console.log(`✅ Batch complete: ${messages.length} processed\n`);
  }
}

async function runWorkQueueMode(nc: NatsConnection) {
  console.log('\n⚙️ Work Queue Mode - Competing consumer pattern\n');

  const js = nc.jetstream();
  const workerId = `worker-${process.pid}`;
  const consumerName = CONSUMER || 'work-queue-consumer';

  console.log(`Stream: ${STREAM}`);
  console.log(`Consumer: ${consumerName}`);
  console.log(`Worker ID: ${workerId}`);
  console.log('\n' + '─'.repeat(70) + '\n');

  let consumer;
  try {
    consumer = await js.consumers.get(STREAM, consumerName);
  } catch {
    console.log('Consumer not found. Create it using setup-streams first.');
    return;
  }

  const messages = await consumer.consume({ max_messages: 1 });

  for await (const msg of messages) {
    const startProcess = Date.now();

    try {
      const data = JSON.parse(sc.decode(msg.data));
      console.log(`[${workerId}] Processing: ${msg.subject}`);
      processMessage(data, msg.subject);

      // Simulate variable processing time
      const processingTime = PROCESSING_TIME + Math.floor(Math.random() * PROCESSING_TIME);
      await sleep(processingTime);

      msg.ack();
      stats.processed++;
      console.log(`[${workerId}] ✅ Completed in ${Date.now() - startProcess}ms\n`);
    } catch (err: any) {
      console.error(`[${workerId}] ❌ Failed: ${err.message}`);
      msg.nak();
      stats.errors++;
    }
  }
}

async function runFilteredMode(nc: NatsConnection) {
  console.log('\n🔍 Filtered Mode - Processing specific subjects only\n');

  const js = nc.jetstream();
  const filter = FILTER || 'orders.created';

  console.log(`Stream: ${STREAM}`);
  console.log(`Filter: ${filter}`);
  console.log('\n' + '─'.repeat(70) + '\n');

  const consumer = await js.consumers.get(STREAM, {
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.New,
    filter_subject: filter,
  });

  const messages = await consumer.consume({ max_messages: BATCH_SIZE });

  for await (const msg of messages) {
    try {
      const data = JSON.parse(sc.decode(msg.data));
      console.log(`[${msg.seq}] Filtered match: ${msg.subject}`);
      processMessage(data, msg.subject);
      msg.ack();
      stats.processed++;
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      msg.nak();
      stats.errors++;
    }
  }
}

async function runMultiStreamMode(nc: NatsConnection) {
  console.log('\n🌐 Multi-Stream Mode - Consuming from multiple streams\n');

  const js = nc.jetstream();
  const streams = ['ORDERS', 'PAYMENTS', 'IOT_SENSORS', 'APP_LOGS'];

  console.log(`Streams: ${streams.join(', ')}`);
  console.log('\n' + '─'.repeat(70) + '\n');

  const consumers = await Promise.all(
    streams.map(async (streamName) => {
      try {
        const consumer = await js.consumers.get(streamName, {
          ack_policy: AckPolicy.Explicit,
          deliver_policy: DeliverPolicy.New,
        });
        return { streamName, consumer };
      } catch (err: any) {
        console.warn(`⚠️ Could not connect to stream ${streamName}: ${err.message}`);
        return null;
      }
    })
  );

  const activeConsumers = consumers.filter(Boolean) as Array<{ streamName: string; consumer: any }>;

  if (activeConsumers.length === 0) {
    console.error('No streams available. Run setup-streams first.');
    return;
  }

  console.log(`Connected to ${activeConsumers.length} streams\n`);

  // Process from all streams concurrently
  const processors = activeConsumers.map(async ({ streamName, consumer }) => {
    const messages = await consumer.consume({ max_messages: BATCH_SIZE });

    for await (const msg of messages) {
      try {
        const data = JSON.parse(sc.decode(msg.data));
        console.log(`[${streamName}] ${msg.subject}:`);
        processMessage(data, msg.subject);
        msg.ack();
        stats.processed++;
        stats.bySubject[`${streamName}:${msg.subject}`] = (stats.bySubject[`${streamName}:${msg.subject}`] || 0) + 1;
      } catch (err: any) {
        console.error(`[${streamName}] Error: ${err.message}`);
        msg.nak();
        stats.errors++;
      }
    }
  });

  await Promise.all(processors);
}

// ==================== Main ====================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         NATS JetStream - Advanced Multi-Mode Consumer        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`Connecting to NATS at ${NATS_URL}`);
  console.log(`Mode: ${MODE}`);
  console.log('');

  const nc = await connect({ servers: NATS_URL });

  // Stats reporter
  const statsInterval = setInterval(() => {
    const runtime = Math.round((Date.now() - stats.startTime) / 1000);
    const rate = runtime > 0 ? (stats.processed / runtime).toFixed(2) : '0';
    console.log('\n' + '═'.repeat(70));
    console.log(`📊 Stats: ${stats.processed} processed, ${stats.errors} errors, ${rate} msg/s`);
    console.log(`   Avg processing: ${stats.avgProcessingTime.toFixed(0)}ms, Runtime: ${runtime}s`);
    console.log('═'.repeat(70) + '\n');
  }, 15000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n📊 Final Stats:');
    console.log('─'.repeat(50));
    console.log(`Total processed: ${stats.processed}`);
    console.log(`Total errors: ${stats.errors}`);
    console.log(`Avg processing time: ${stats.avgProcessingTime.toFixed(2)}ms`);
    console.log('\nBy subject:');
    for (const [subject, count] of Object.entries(stats.bySubject)) {
      console.log(`  ${subject}: ${count}`);
    }
    console.log('─'.repeat(50));

    clearInterval(statsInterval);
    await nc.drain();
    console.log('\nConsumer stopped.');
    process.exit(0);
  });

  // Run selected mode
  switch (MODE) {
    case 'interactive':
      await runInteractiveMode(nc);
      break;
    case 'batch':
      await runBatchMode(nc);
      break;
    case 'workqueue':
      await runWorkQueueMode(nc);
      break;
    case 'filtered':
      await runFilteredMode(nc);
      break;
    case 'multistream':
      await runMultiStreamMode(nc);
      break;
    default:
      console.error(`Unknown mode: ${MODE}`);
      console.error('Available modes: interactive, batch, workqueue, filtered, multistream');
      process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
