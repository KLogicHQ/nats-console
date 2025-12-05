/**
 * Multi-scenario load test for NATS JetStream
 * Simulates different real-world traffic patterns including DLQ scenarios
 */
import { connect, StringCodec, JetStreamClient, NatsConnection, AckPolicy, DeliverPolicy } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const SCENARIO = process.env.SCENARIO || 'mixed'; // iot, ecommerce, analytics, financial, burst, mixed, dlq
const RATE = parseInt(process.env.RATE || '100'); // base messages per second
const DURATION = parseInt(process.env.DURATION || '60'); // seconds
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5'); // parallel publishers
const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE || '0.15'); // 15% failure rate for DLQ scenario

const sc = StringCodec();

interface Stats {
  sent: number;
  errors: number;
  dlqSent: number;
  dlqRetries: number;
  startTime: number;
  bySubject: Record<string, number>;
  latencies: number[];
}

const stats: Stats = {
  sent: 0,
  errors: 0,
  dlqSent: 0,
  dlqRetries: 0,
  startTime: Date.now(),
  bySubject: {},
  latencies: [],
};

// ==================== Payload Generators ====================

function generateIoTPayload() {
  const sensorTypes = ['temperature', 'humidity', 'pressure', 'motion'];
  const zones = ['zone-a', 'zone-b', 'zone-c', 'zone-d'];
  const sensorType = sensorTypes[Math.floor(Math.random() * sensorTypes.length)];
  const zone = zones[Math.floor(Math.random() * zones.length)];

  return {
    subject: `iot.${sensorType}.${zone}`,
    data: {
      deviceId: `SENSOR-${Math.floor(Math.random() * 10000).toString().padStart(5, '0')}`,
      sensorType,
      value: Math.round((Math.random() * 100) * 100) / 100,
      unit: sensorType === 'temperature' ? 'celsius' : sensorType === 'humidity' ? 'percent' : 'hPa',
      location: { zone, lat: 37.7749 + Math.random() * 0.1, lng: -122.4194 + Math.random() * 0.1 },
      batteryLevel: Math.floor(Math.random() * 100),
      timestamp: new Date().toISOString(),
    },
  };
}

function generateEcommercePayload() {
  const orderEvents = ['orders.created', 'orders.updated', 'orders.paid', 'orders.shipped', 'orders.delivered'];
  const inventoryEvents = ['inventory.sale', 'inventory.restock', 'inventory.adjustment'];
  const events = [...orderEvents, ...inventoryEvents];
  const subject = events[Math.floor(Math.random() * events.length)];

  if (subject.startsWith('orders.')) {
    return {
      subject,
      data: {
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        customerId: `CUST-${Math.floor(Math.random() * 100000).toString().padStart(6, '0')}`,
        items: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, () => ({
          sku: `SKU-${Math.floor(Math.random() * 1000)}`,
          quantity: Math.floor(Math.random() * 5) + 1,
          price: Math.round(Math.random() * 500 * 100) / 100,
        })),
        total: Math.round(Math.random() * 2000 * 100) / 100,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      },
    };
  } else {
    return {
      subject,
      data: {
        sku: `SKU-${Math.floor(Math.random() * 1000)}`,
        warehouseId: `WH-${['NYC', 'LAX', 'CHI', 'MIA'][Math.floor(Math.random() * 4)]}`,
        quantity: Math.floor(Math.random() * 100),
        timestamp: new Date().toISOString(),
      },
    };
  }
}

function generateAnalyticsPayload() {
  const eventTypes = ['activity.pageview', 'activity.click', 'activity.search', 'activity.conversion'];
  const subject = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const pages = ['/home', '/products', '/product/123', '/cart', '/checkout', '/account'];

  return {
    subject,
    data: {
      sessionId: `SESSION-${Math.random().toString(36).substring(2, 15)}`,
      userId: `USER-${Math.floor(Math.random() * 100000)}`,
      eventType: subject.split('.')[1],
      page: pages[Math.floor(Math.random() * pages.length)],
      metadata: {
        browser: ['Chrome', 'Firefox', 'Safari', 'Edge'][Math.floor(Math.random() * 4)],
        device: ['desktop', 'mobile', 'tablet'][Math.floor(Math.random() * 3)],
        referrer: Math.random() > 0.5 ? 'google.com' : 'direct',
      },
      timestamp: new Date().toISOString(),
    },
  };
}

function generateFinancialPayload() {
  const paymentEvents = ['payment.initiated', 'payment.authorized', 'payment.captured', 'payment.failed'];
  const fraudEvents = ['fraud.check', 'fraud.alert'];
  const events = [...paymentEvents, ...fraudEvents];
  const subject = events[Math.floor(Math.random() * events.length)];

  if (subject.startsWith('payment.')) {
    return {
      subject,
      data: {
        paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        amount: Math.round(Math.random() * 10000 * 100) / 100,
        currency: ['USD', 'EUR', 'GBP', 'JPY'][Math.floor(Math.random() * 4)],
        method: ['credit_card', 'debit_card', 'paypal', 'crypto'][Math.floor(Math.random() * 4)],
        cardLast4: Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
        status: subject.split('.')[1],
        timestamp: new Date().toISOString(),
      },
    };
  } else {
    return {
      subject,
      data: {
        paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        riskScore: Math.floor(Math.random() * 100),
        flags: ['high_amount', 'new_device', 'unusual_location', 'velocity_check'].slice(0, Math.floor(Math.random() * 3) + 1),
        decision: Math.random() > 0.1 ? 'approve' : 'decline',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

function generateLogPayload() {
  const levels = ['app.logs.info', 'app.logs.info', 'app.logs.info', 'app.logs.warn', 'app.logs.error'];
  const subject = levels[Math.floor(Math.random() * levels.length)];
  const services = ['api-gateway', 'user-service', 'order-service', 'payment-service', 'inventory-service'];

  return {
    subject,
    data: {
      level: subject.split('.')[2],
      service: services[Math.floor(Math.random() * services.length)],
      message: [
        'Request processed',
        'Database query executed',
        'Cache hit',
        'Authentication successful',
        'Job completed',
        'Connection established',
      ][Math.floor(Math.random() * 6)],
      traceId: `trace-${Math.random().toString(36).substring(2, 15)}`,
      duration: Math.floor(Math.random() * 500),
      timestamp: new Date().toISOString(),
    },
  };
}

function generateMetricPayload() {
  const metricTypes = ['metrics.cpu', 'metrics.memory', 'metrics.disk', 'metrics.network'];
  const subject = metricTypes[Math.floor(Math.random() * metricTypes.length)];
  const hosts = ['prod-web-01', 'prod-web-02', 'prod-api-01', 'prod-api-02', 'prod-db-01'];

  return {
    subject,
    data: {
      host: hosts[Math.floor(Math.random() * hosts.length)],
      metricType: subject.split('.')[1],
      value: Math.round(Math.random() * 100 * 100) / 100,
      unit: subject.includes('network') ? 'mbps' : 'percent',
      tags: { env: 'production', region: 'us-west-2' },
      timestamp: new Date().toISOString(),
    },
  };
}

function generateMixedPayload() {
  const generators = [
    generateIoTPayload,
    generateEcommercePayload,
    generateAnalyticsPayload,
    generateFinancialPayload,
    generateLogPayload,
    generateMetricPayload,
  ];
  const weights = [30, 15, 25, 10, 15, 5]; // IoT highest, then analytics
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return generators[i]();
  }
  return generators[0]();
}

// ==================== DLQ Payload Generators ====================

type FailureReason = 'validation_error' | 'processing_timeout' | 'downstream_unavailable' | 'data_corruption' | 'rate_limited' | 'schema_mismatch';

function generateDLQPayload() {
  // Generate a base payload that will "fail" and go to DLQ
  const failureReasons: FailureReason[] = [
    'validation_error',
    'processing_timeout',
    'downstream_unavailable',
    'data_corruption',
    'rate_limited',
    'schema_mismatch',
  ];

  const sourceStreams = ['orders', 'payments', 'notifications', 'iot', 'inventory'];
  const sourceStream = sourceStreams[Math.floor(Math.random() * sourceStreams.length)];
  const failureReason = failureReasons[Math.floor(Math.random() * failureReasons.length)];

  const originalMessage = generateOriginalFailedMessage(sourceStream);

  return {
    subject: `dlq.${sourceStream}.${failureReason}`,
    data: {
      dlqMetadata: {
        id: `DLQ-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        originalSubject: originalMessage.subject,
        sourceStream: sourceStream.toUpperCase(),
        failureReason,
        failureDetails: generateFailureDetails(failureReason),
        attemptCount: Math.floor(Math.random() * 5) + 1,
        maxAttempts: 5,
        firstFailedAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
        lastFailedAt: new Date().toISOString(),
        consumerName: `${sourceStream}-processor`,
        errorCode: generateErrorCode(failureReason),
      },
      originalPayload: originalMessage.data,
    },
  };
}

function generateOriginalFailedMessage(sourceStream: string): { subject: string; data: any } {
  switch (sourceStream) {
    case 'orders':
      return {
        subject: `orders.${['created', 'updated', 'paid'][Math.floor(Math.random() * 3)]}`,
        data: {
          orderId: `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          customerId: `CUST-${Math.floor(Math.random() * 100000)}`,
          total: Math.round(Math.random() * 5000 * 100) / 100,
          // Simulate problematic data
          items: Math.random() > 0.5 ? null : [], // Missing items - validation failure
          currency: Math.random() > 0.7 ? 'INVALID' : 'USD',
        },
      };
    case 'payments':
      return {
        subject: `payment.${['initiated', 'authorized', 'failed'][Math.floor(Math.random() * 3)]}`,
        data: {
          paymentId: `PAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          amount: Math.random() > 0.8 ? -100 : Math.round(Math.random() * 10000 * 100) / 100, // Negative amount
          method: Math.random() > 0.9 ? 'unknown_method' : 'credit_card',
          cardLast4: Math.random() > 0.8 ? '' : '1234', // Missing card info
        },
      };
    case 'notifications':
      return {
        subject: `notify.${['email', 'sms', 'push'][Math.floor(Math.random() * 3)]}`,
        data: {
          recipient: Math.random() > 0.7 ? '' : `user${Math.floor(Math.random() * 1000)}@example.com`,
          template: Math.random() > 0.8 ? 'nonexistent_template' : 'order_confirmation',
          retryCount: Math.floor(Math.random() * 5),
        },
      };
    case 'iot':
      return {
        subject: `iot.${['temperature', 'humidity'][Math.floor(Math.random() * 2)]}.zone-${['a', 'b', 'c'][Math.floor(Math.random() * 3)]}`,
        data: {
          deviceId: `SENSOR-${Math.floor(Math.random() * 10000)}`,
          value: Math.random() > 0.7 ? NaN : Math.random() * 100, // Invalid sensor reading
          batteryLevel: Math.random() > 0.8 ? -1 : Math.floor(Math.random() * 100),
        },
      };
    case 'inventory':
    default:
      return {
        subject: `inventory.${['sale', 'restock', 'adjustment'][Math.floor(Math.random() * 3)]}`,
        data: {
          sku: Math.random() > 0.8 ? '' : `SKU-${Math.floor(Math.random() * 1000)}`,
          quantity: Math.random() > 0.7 ? -999 : Math.floor(Math.random() * 100),
          warehouseId: Math.random() > 0.9 ? 'UNKNOWN' : `WH-${['NYC', 'LAX', 'CHI'][Math.floor(Math.random() * 3)]}`,
        },
      };
  }
}

function generateFailureDetails(reason: FailureReason): string {
  const details: Record<FailureReason, string[]> = {
    validation_error: [
      'Required field "items" is null or undefined',
      'Invalid currency code: expected ISO 4217 format',
      'Amount must be a positive number',
      'Customer ID format invalid',
      'Missing required field: recipient',
    ],
    processing_timeout: [
      'Processing exceeded 30s timeout',
      'Database query timed out after 10s',
      'External API call timed out',
      'Lock acquisition timeout',
      'Connection pool exhausted',
    ],
    downstream_unavailable: [
      'Payment gateway returned 503',
      'Inventory service unreachable',
      'Email provider connection refused',
      'Database replica lag exceeded threshold',
      'Rate limit exceeded on downstream API',
    ],
    data_corruption: [
      'JSON parse error: unexpected token',
      'Checksum mismatch on message payload',
      'Invalid UTF-8 sequence detected',
      'Message truncated: incomplete data',
      'Encryption key mismatch',
    ],
    rate_limited: [
      'Consumer rate limit exceeded (1000/s)',
      'Account API quota exhausted',
      'Circuit breaker open: too many failures',
      'Backpressure from downstream consumer',
      'Throttled: burst limit exceeded',
    ],
    schema_mismatch: [
      'Expected schema v2, received v1',
      'Missing required field in new schema',
      'Type mismatch: expected number, got string',
      'Unknown enum value in status field',
      'Deprecated field still present',
    ],
  };

  const options = details[reason];
  return options[Math.floor(Math.random() * options.length)];
}

function generateErrorCode(reason: FailureReason): string {
  const codes: Record<FailureReason, string[]> = {
    validation_error: ['E_VALIDATION_001', 'E_VALIDATION_002', 'E_VALIDATION_003'],
    processing_timeout: ['E_TIMEOUT_001', 'E_TIMEOUT_002', 'E_TIMEOUT_DB'],
    downstream_unavailable: ['E_DOWNSTREAM_503', 'E_DOWNSTREAM_CONN', 'E_DOWNSTREAM_TIMEOUT'],
    data_corruption: ['E_CORRUPT_JSON', 'E_CORRUPT_CHECKSUM', 'E_CORRUPT_ENCODING'],
    rate_limited: ['E_RATELIMIT_001', 'E_RATELIMIT_BURST', 'E_RATELIMIT_QUOTA'],
    schema_mismatch: ['E_SCHEMA_VERSION', 'E_SCHEMA_FIELD', 'E_SCHEMA_TYPE'],
  };

  const options = codes[reason];
  return options[Math.floor(Math.random() * options.length)];
}

function generateDLQRetryPayload() {
  // Messages queued for retry processing
  const dlqMessage = generateDLQPayload();

  return {
    subject: `retry.dlq.${dlqMessage.data.dlqMetadata.sourceStream.toLowerCase()}`,
    data: {
      ...dlqMessage.data,
      retryMetadata: {
        scheduledAt: new Date().toISOString(),
        retryNumber: Math.floor(Math.random() * 3) + 1,
        backoffMs: Math.pow(2, Math.floor(Math.random() * 3) + 1) * 1000,
        priority: ['low', 'normal', 'high'][Math.floor(Math.random() * 3)],
      },
    },
  };
}

// ==================== Load Test Scenarios ====================

interface ScenarioConfig {
  name: string;
  generator: () => { subject: string; data: any };
  rateMultiplier: number;
  burstConfig?: { burstRate: number; burstDuration: number; normalDuration: number };
}

const SCENARIOS: Record<string, ScenarioConfig> = {
  iot: {
    name: 'IoT High-Frequency Sensor Data',
    generator: generateIoTPayload,
    rateMultiplier: 10, // 10x base rate for IoT
  },
  ecommerce: {
    name: 'E-Commerce Order Flow',
    generator: generateEcommercePayload,
    rateMultiplier: 1,
  },
  analytics: {
    name: 'User Activity Analytics',
    generator: generateAnalyticsPayload,
    rateMultiplier: 5, // High volume clickstream
  },
  financial: {
    name: 'Financial Transactions',
    generator: generateFinancialPayload,
    rateMultiplier: 2,
  },
  burst: {
    name: 'Burst Traffic Pattern',
    generator: generateMixedPayload,
    rateMultiplier: 1,
    burstConfig: {
      burstRate: 10, // 10x during burst
      burstDuration: 5, // 5 seconds burst
      normalDuration: 15, // 15 seconds normal
    },
  },
  mixed: {
    name: 'Mixed Real-World Traffic',
    generator: generateMixedPayload,
    rateMultiplier: 3,
  },
  dlq: {
    name: 'Dead Letter Queue Simulation',
    generator: generateDLQPayload,
    rateMultiplier: 2,
  },
  'dlq-heavy': {
    name: 'Heavy DLQ Traffic (Failure Scenario)',
    generator: () => {
      // 70% DLQ messages, 20% retry messages, 10% regular messages that "fail"
      const rand = Math.random();
      if (rand < 0.7) return generateDLQPayload();
      if (rand < 0.9) return generateDLQRetryPayload();
      return generateMixedPayload();
    },
    rateMultiplier: 5,
  },
};

// ==================== Publishers ====================

async function publishMessage(js: JetStreamClient, payload: { subject: string; data: any }): Promise<number> {
  const start = Date.now();
  try {
    await js.publish(payload.subject, sc.encode(JSON.stringify(payload.data)));
    const latency = Date.now() - start;
    stats.sent++;
    stats.bySubject[payload.subject] = (stats.bySubject[payload.subject] || 0) + 1;
    stats.latencies.push(latency);
    if (stats.latencies.length > 10000) stats.latencies.shift(); // Keep last 10k for percentiles

    // Track DLQ-specific stats
    if (payload.subject.startsWith('retry.dlq.')) {
      stats.dlqRetries++;
    } else if (payload.subject.startsWith('dlq.')) {
      stats.dlqSent++;
    }

    return latency;
  } catch (err: any) {
    stats.errors++;
    throw err;
  }
}

async function runPublisher(
  js: JetStreamClient,
  publisherId: number,
  scenario: ScenarioConfig,
  messagesPerSecond: number,
  durationSeconds: number
): Promise<void> {
  const interval = 1000 / messagesPerSecond;
  const endTime = Date.now() + durationSeconds * 1000;
  let burstMode = false;
  let lastBurstToggle = Date.now();

  while (Date.now() < endTime) {
    const loopStart = Date.now();

    // Handle burst mode
    let currentRate = messagesPerSecond;
    if (scenario.burstConfig) {
      const elapsed = (Date.now() - lastBurstToggle) / 1000;
      if (burstMode && elapsed >= scenario.burstConfig.burstDuration) {
        burstMode = false;
        lastBurstToggle = Date.now();
      } else if (!burstMode && elapsed >= scenario.burstConfig.normalDuration) {
        burstMode = true;
        lastBurstToggle = Date.now();
      }
      currentRate = burstMode ? messagesPerSecond * scenario.burstConfig.burstRate : messagesPerSecond;
    }

    const payload = scenario.generator();
    try {
      await publishMessage(js, payload);
    } catch {
      // Error already counted
    }

    const loopTime = Date.now() - loopStart;
    const adjustedInterval = 1000 / currentRate;
    if (loopTime < adjustedInterval) {
      await sleep(adjustedInterval - loopTime);
    }
  }
}

// ==================== Main ====================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           NATS JetStream - Multi-Scenario Load Test              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const scenario = SCENARIOS[SCENARIO];
  if (!scenario) {
    console.error(`Unknown scenario: ${SCENARIO}`);
    console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  const effectiveRate = RATE * scenario.rateMultiplier;
  const ratePerPublisher = Math.ceil(effectiveRate / CONCURRENCY);
  const expectedMessages = effectiveRate * DURATION;

  console.log(`Scenario: ${scenario.name}`);
  console.log(`Target: ${NATS_URL}`);
  console.log(`Base Rate: ${RATE} msg/s × ${scenario.rateMultiplier}x = ${effectiveRate} msg/s`);
  console.log(`Concurrency: ${CONCURRENCY} publishers (${ratePerPublisher} msg/s each)`);
  console.log(`Duration: ${DURATION} seconds`);
  console.log(`Expected: ~${expectedMessages.toLocaleString()} messages`);
  if (scenario.burstConfig) {
    console.log(`Burst Pattern: ${scenario.burstConfig.burstRate}x for ${scenario.burstConfig.burstDuration}s every ${scenario.burstConfig.normalDuration}s`);
  }
  console.log('\n' + '─'.repeat(70) + '\n');

  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();

  stats.startTime = Date.now();

  // Progress reporter
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const actualRate = stats.sent / elapsed;
    const remaining = DURATION - elapsed;

    // Calculate percentiles
    const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
    const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
    const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

    const dlqInfo = stats.dlqSent > 0 ? ` | DLQ: ${stats.dlqSent} (${stats.dlqRetries} retries)` : '';
    console.log(
      `⏱  ${elapsed.toFixed(0)}s | Sent: ${stats.sent.toLocaleString()} | Rate: ${actualRate.toFixed(0)} msg/s | ` +
      `Errors: ${stats.errors} | Latency p50/p95/p99: ${p50}/${p95}/${p99}ms${dlqInfo} | Remaining: ${remaining.toFixed(0)}s`
    );
  }, 5000);

  console.log('🚀 Starting load test...\n');

  // Launch publishers
  const publishers = Array.from({ length: CONCURRENCY }, (_, i) =>
    runPublisher(js, i, scenario, ratePerPublisher, DURATION)
  );

  await Promise.all(publishers);
  clearInterval(progressInterval);

  // Final stats
  const totalTime = (Date.now() - stats.startTime) / 1000;
  const actualRate = stats.sent / totalTime;
  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const avgLatency = sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length || 0;
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
  const maxLatency = sortedLatencies[sortedLatencies.length - 1] || 0;

  console.log('\n' + '═'.repeat(70));
  console.log('                        LOAD TEST COMPLETE');
  console.log('═'.repeat(70) + '\n');

  console.log('📊 Summary:');
  console.log('─'.repeat(50));
  console.log(`  Total messages sent:    ${stats.sent.toLocaleString()}`);
  console.log(`  Total errors:           ${stats.errors}`);
  console.log(`  Success rate:           ${((stats.sent / (stats.sent + stats.errors)) * 100).toFixed(2)}%`);
  console.log(`  Duration:               ${totalTime.toFixed(2)}s`);
  console.log(`  Actual throughput:      ${actualRate.toFixed(1)} msg/s`);
  console.log(`  Target throughput:      ${effectiveRate} msg/s`);
  console.log(`  Throughput efficiency:  ${((actualRate / effectiveRate) * 100).toFixed(1)}%`);

  // DLQ-specific stats
  if (stats.dlqSent > 0) {
    console.log('\n💀 Dead Letter Queue Stats:');
    console.log('─'.repeat(50));
    console.log(`  DLQ messages sent:      ${stats.dlqSent.toLocaleString()}`);
    console.log(`  DLQ retries sent:       ${stats.dlqRetries.toLocaleString()}`);
    console.log(`  DLQ % of total:         ${((stats.dlqSent / stats.sent) * 100).toFixed(1)}%`);
  }

  console.log('\n⏱  Latency:');
  console.log('─'.repeat(50));
  console.log(`  Average:                ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50 (median):           ${p50}ms`);
  console.log(`  P95:                    ${p95}ms`);
  console.log(`  P99:                    ${p99}ms`);
  console.log(`  Max:                    ${maxLatency}ms`);

  console.log('\n📈 Messages by Subject:');
  console.log('─'.repeat(50));
  const sortedSubjects = Object.entries(stats.bySubject).sort((a, b) => b[1] - a[1]);
  for (const [subject, count] of sortedSubjects.slice(0, 15)) {
    const percentage = ((count / stats.sent) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(parseFloat(percentage) / 5));
    console.log(`  ${subject.padEnd(30)} ${count.toString().padStart(8)} (${percentage.padStart(5)}%) ${bar}`);
  }
  if (sortedSubjects.length > 15) {
    console.log(`  ... and ${sortedSubjects.length - 15} more subjects`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  await nc.close();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
