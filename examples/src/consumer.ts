/**
 * Sample consumer that processes messages from streams
 */
import { connect, StringCodec, AckPolicy, DeliverPolicy, JetStreamClient, ConsumerMessages } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const sc = StringCodec();

const STREAM = process.env.STREAM || 'ORDERS';
const CONSUMER = process.env.CONSUMER || 'test-consumer';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10');

async function main() {
  console.log('Connecting to NATS at', NATS_URL);
  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  console.log(`\nConsuming from stream: ${STREAM}`);
  console.log(`Consumer name: ${CONSUMER}`);
  console.log(`Batch size: ${BATCH_SIZE}\n`);

  // Create ephemeral consumer or use existing durable
  let consumer;
  try {
    consumer = await js.consumers.get(STREAM, CONSUMER);
    console.log(`Using existing consumer: ${CONSUMER}`);
  } catch (err) {
    console.log(`Creating ephemeral consumer...`);
    consumer = await js.consumers.get(STREAM, {
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
    } as any);
  }

  console.log('Waiting for messages... (Press Ctrl+C to stop)\n');

  let messageCount = 0;
  let lastReport = Date.now();

  // Process messages
  const messages = await consumer.consume({ max_messages: BATCH_SIZE });

  for await (const msg of messages) {
    messageCount++;
    const data = JSON.parse(sc.decode(msg.data));

    console.log(`[${msg.seq}] ${msg.subject}:`);
    console.log(`  Data: ${JSON.stringify(data).substring(0, 100)}...`);

    // Simulate processing time
    await sleep(Math.random() * 100);

    // Acknowledge the message
    msg.ack();

    // Report stats every 5 seconds
    if (Date.now() - lastReport > 5000) {
      console.log(`\n--- Processed ${messageCount} messages ---\n`);
      lastReport = Date.now();
    }
  }

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await nc.drain();
    console.log(`Consumer stopped. Processed ${messageCount} messages.`);
    process.exit(0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
