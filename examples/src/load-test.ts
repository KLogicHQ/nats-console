/**
 * Load test script for stress testing NATS JetStream
 */
import { connect, StringCodec, JetStreamClient } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const STREAM = process.env.STREAM || 'ORDERS';
const RATE = parseInt(process.env.RATE || '100'); // messages per second
const DURATION = parseInt(process.env.DURATION || '60'); // seconds
const sc = StringCodec();

interface Stats {
  sent: number;
  errors: number;
  startTime: number;
}

async function main() {
  console.log('=== NATS JetStream Load Test ===\n');
  console.log(`Target: ${NATS_URL}`);
  console.log(`Stream: ${STREAM}`);
  console.log(`Rate: ${RATE} msg/s`);
  console.log(`Duration: ${DURATION} seconds`);
  console.log(`Expected messages: ${RATE * DURATION}\n`);

  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();

  const stats: Stats = {
    sent: 0,
    errors: 0,
    startTime: Date.now(),
  };

  const interval = 1000 / RATE; // ms between messages
  let running = true;

  // Stop after duration
  setTimeout(() => {
    running = false;
  }, DURATION * 1000);

  // Progress reporter
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const actualRate = stats.sent / elapsed;
    console.log(
      `Progress: ${stats.sent} sent, ${stats.errors} errors, ` +
      `${actualRate.toFixed(1)} msg/s (target: ${RATE})`
    );
  }, 5000);

  console.log('Starting load test...\n');

  // Main sending loop
  while (running) {
    const startLoop = Date.now();

    try {
      const message = {
        id: `LOAD-${stats.sent + 1}`,
        timestamp: new Date().toISOString(),
        data: generatePayload(),
      };

      await js.publish(`${STREAM.toLowerCase()}.load-test`, sc.encode(JSON.stringify(message)));
      stats.sent++;
    } catch (err) {
      stats.errors++;
    }

    // Rate limiting
    const loopTime = Date.now() - startLoop;
    if (loopTime < interval) {
      await sleep(interval - loopTime);
    }
  }

  clearInterval(progressInterval);

  // Final stats
  const totalTime = (Date.now() - stats.startTime) / 1000;
  const actualRate = stats.sent / totalTime;

  console.log('\n=== Load Test Complete ===\n');
  console.log(`Total messages sent: ${stats.sent}`);
  console.log(`Total errors: ${stats.errors}`);
  console.log(`Duration: ${totalTime.toFixed(2)} seconds`);
  console.log(`Actual rate: ${actualRate.toFixed(1)} msg/s`);
  console.log(`Success rate: ${((stats.sent / (stats.sent + stats.errors)) * 100).toFixed(2)}%`);

  await nc.close();
}

function generatePayload(): Record<string, unknown> {
  return {
    value: Math.random() * 1000,
    tags: ['load-test', 'performance'],
    metadata: {
      host: 'load-tester',
      pid: process.pid,
      memory: process.memoryUsage().heapUsed,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
