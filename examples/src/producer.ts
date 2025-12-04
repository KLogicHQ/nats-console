/**
 * Sample producer that publishes messages to various streams
 */
import { connect, StringCodec, JetStreamClient } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const sc = StringCodec();

interface Order {
  id: string;
  customerId: string;
  items: { productId: string; quantity: number; price: number }[];
  total: number;
  status: string;
  createdAt: string;
}

interface LogEntry {
  level: string;
  message: string;
  service: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface Event {
  type: string;
  source: string;
  data: Record<string, unknown>;
  timestamp: string;
}

async function main() {
  console.log('Connecting to NATS at', NATS_URL);
  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();

  console.log('Starting message producer...\n');
  console.log('Press Ctrl+C to stop\n');

  let orderCount = 0;
  let eventCount = 0;
  let logCount = 0;

  // Produce orders every 2 seconds
  const orderInterval = setInterval(async () => {
    const order = generateOrder(++orderCount);
    const subjects = ['orders.created', 'orders.updated', 'orders.shipped', 'orders.completed'];
    const subject = subjects[Math.floor(Math.random() * subjects.length)];

    try {
      const ack = await js.publish(subject, sc.encode(JSON.stringify(order)));
      console.log(`[ORDER] Published to ${subject}: seq=${ack.seq}`);
    } catch (err) {
      console.error('[ORDER] Failed to publish:', err);
    }
  }, 2000);

  // Produce events every 1 second
  const eventInterval = setInterval(async () => {
    const event = generateEvent(++eventCount);

    try {
      const ack = await js.publish(`events.${event.type}`, sc.encode(JSON.stringify(event)));
      console.log(`[EVENT] Published events.${event.type}: seq=${ack.seq}`);
    } catch (err) {
      console.error('[EVENT] Failed to publish:', err);
    }
  }, 1000);

  // Produce logs every 500ms
  const logInterval = setInterval(async () => {
    const log = generateLog(++logCount);

    try {
      const ack = await js.publish(`logs.${log.level}`, sc.encode(JSON.stringify(log)));
      console.log(`[LOG] Published logs.${log.level}: seq=${ack.seq}`);
    } catch (err) {
      console.error('[LOG] Failed to publish:', err);
    }
  }, 500);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    clearInterval(orderInterval);
    clearInterval(eventInterval);
    clearInterval(logInterval);
    await nc.drain();
    console.log('Producer stopped.');
    process.exit(0);
  });

  // Keep alive
  await nc.closed();
}

function generateOrder(count: number): Order {
  const statuses = ['pending', 'processing', 'shipped', 'delivered'];
  const itemCount = Math.floor(Math.random() * 5) + 1;
  const items = Array.from({ length: itemCount }, (_, i) => ({
    productId: `PROD-${Math.floor(Math.random() * 1000)}`,
    quantity: Math.floor(Math.random() * 5) + 1,
    price: Math.round(Math.random() * 100 * 100) / 100,
  }));

  return {
    id: `ORD-${count.toString().padStart(6, '0')}`,
    customerId: `CUST-${Math.floor(Math.random() * 10000)}`,
    items,
    total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    status: statuses[Math.floor(Math.random() * statuses.length)],
    createdAt: new Date().toISOString(),
  };
}

function generateEvent(count: number): Event {
  const types = ['user.login', 'user.logout', 'page.view', 'button.click', 'api.call', 'error.occurred'];
  const services = ['web-app', 'mobile-app', 'api-gateway', 'auth-service'];

  return {
    type: types[Math.floor(Math.random() * types.length)],
    source: services[Math.floor(Math.random() * services.length)],
    data: {
      userId: `USER-${Math.floor(Math.random() * 1000)}`,
      sessionId: `SESSION-${Math.random().toString(36).substring(7)}`,
      count,
    },
    timestamp: new Date().toISOString(),
  };
}

function generateLog(count: number): LogEntry {
  const levels = ['info', 'info', 'info', 'warn', 'error']; // Weighted towards info
  const services = ['api-server', 'web-server', 'worker', 'scheduler', 'database'];
  const messages = {
    info: ['Request processed', 'Cache hit', 'User authenticated', 'Job completed', 'Connection established'],
    warn: ['High memory usage', 'Slow query detected', 'Rate limit approaching', 'Retry attempt'],
    error: ['Connection failed', 'Query timeout', 'Invalid input', 'Service unavailable'],
  };

  const level = levels[Math.floor(Math.random() * levels.length)];
  const messageList = messages[level as keyof typeof messages];

  return {
    level,
    message: messageList[Math.floor(Math.random() * messageList.length)],
    service: services[Math.floor(Math.random() * services.length)],
    timestamp: new Date().toISOString(),
    metadata: {
      requestId: Math.random().toString(36).substring(7),
      count,
    },
  };
}

main().catch(console.error);
