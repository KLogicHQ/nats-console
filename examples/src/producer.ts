/**
 * Multi-scenario message producer for realistic NATS JetStream testing
 * Supports: E-commerce, IoT, Financial, Chat, Analytics use cases
 */
import { connect, StringCodec, JetStreamClient } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const SCENARIO = process.env.SCENARIO || 'all'; // all, ecommerce, iot, financial, chat, analytics
const sc = StringCodec();

// ==================== Data Types ====================

interface Order {
  orderId: string;
  customerId: string;
  items: Array<{ sku: string; name: string; quantity: number; price: number }>;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  shippingAddress: { city: string; country: string; zipCode: string };
  status: string;
  createdAt: string;
}

interface InventoryUpdate {
  sku: string;
  warehouseId: string;
  previousQuantity: number;
  newQuantity: number;
  changeReason: string;
  timestamp: string;
}

interface SensorReading {
  deviceId: string;
  sensorType: string;
  value: number;
  unit: string;
  location: { lat: number; lng: number; zone: string };
  batteryLevel: number;
  signalStrength: number;
  timestamp: string;
}

interface Payment {
  paymentId: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: string;
  method: string;
  cardLast4?: string;
  status: string;
  gatewayResponse?: string;
  timestamp: string;
}

interface ChatMessage {
  messageId: string;
  roomId?: string;
  senderId: string;
  recipientId?: string;
  content: string;
  messageType: string;
  attachments?: Array<{ type: string; url: string }>;
  timestamp: string;
}

interface UserActivity {
  sessionId: string;
  userId: string;
  eventType: string;
  page?: string;
  element?: string;
  searchQuery?: string;
  productId?: string;
  metadata: Record<string, unknown>;
  userAgent: string;
  ip: string;
  timestamp: string;
}

interface LogEntry {
  level: string;
  service: string;
  message: string;
  traceId: string;
  spanId: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

interface MetricData {
  host: string;
  metricType: string;
  value: number;
  unit: string;
  tags: Record<string, string>;
  timestamp: string;
}

// ==================== Data Generators ====================

const PRODUCTS = [
  { sku: 'LAPTOP-001', name: 'MacBook Pro 16"', price: 2499 },
  { sku: 'PHONE-001', name: 'iPhone 15 Pro', price: 1199 },
  { sku: 'TABLET-001', name: 'iPad Pro 12.9"', price: 1099 },
  { sku: 'WATCH-001', name: 'Apple Watch Ultra', price: 799 },
  { sku: 'HEADPHONES-001', name: 'AirPods Max', price: 549 },
  { sku: 'KEYBOARD-001', name: 'Magic Keyboard', price: 299 },
  { sku: 'MOUSE-001', name: 'Magic Mouse', price: 99 },
  { sku: 'CHARGER-001', name: 'MagSafe Charger', price: 39 },
];

const CITIES = [
  { city: 'New York', country: 'US', zipCode: '10001' },
  { city: 'Los Angeles', country: 'US', zipCode: '90001' },
  { city: 'London', country: 'UK', zipCode: 'SW1A 1AA' },
  { city: 'Tokyo', country: 'JP', zipCode: '100-0001' },
  { city: 'Sydney', country: 'AU', zipCode: '2000' },
  { city: 'Berlin', country: 'DE', zipCode: '10115' },
];

const WAREHOUSES = ['WH-NYC-01', 'WH-LAX-01', 'WH-LDN-01', 'WH-TKY-01'];
const IOT_ZONES = ['zone-a', 'zone-b', 'zone-c', 'zone-d'];
const SERVICES = ['api-gateway', 'user-service', 'order-service', 'payment-service', 'inventory-service', 'notification-service'];
const HOSTS = ['prod-web-01', 'prod-web-02', 'prod-api-01', 'prod-api-02', 'prod-worker-01'];

let counters = { order: 0, payment: 0, message: 0, sensor: 0, activity: 0, log: 0 };

function generateOrder(): Order {
  const itemCount = Math.floor(Math.random() * 4) + 1;
  const items = Array.from({ length: itemCount }, () => {
    const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
    return { ...product, quantity: Math.floor(Math.random() * 3) + 1 };
  });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal * 0.08 * 100) / 100;
  const shipping = subtotal > 500 ? 0 : 29.99;

  return {
    orderId: `ORD-${Date.now()}-${++counters.order}`,
    customerId: `CUST-${Math.floor(Math.random() * 100000).toString().padStart(6, '0')}`,
    items,
    subtotal,
    tax,
    shipping,
    total: Math.round((subtotal + tax + shipping) * 100) / 100,
    currency: 'USD',
    shippingAddress: CITIES[Math.floor(Math.random() * CITIES.length)],
    status: 'created',
    createdAt: new Date().toISOString(),
  };
}

function generateInventoryUpdate(): InventoryUpdate {
  const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
  const previousQuantity = Math.floor(Math.random() * 1000);
  const change = Math.floor(Math.random() * 50) * (Math.random() > 0.3 ? -1 : 1);
  const reasons = ['sale', 'restock', 'return', 'adjustment', 'damaged'];

  return {
    sku: product.sku,
    warehouseId: WAREHOUSES[Math.floor(Math.random() * WAREHOUSES.length)],
    previousQuantity,
    newQuantity: Math.max(0, previousQuantity + change),
    changeReason: reasons[Math.floor(Math.random() * reasons.length)],
    timestamp: new Date().toISOString(),
  };
}

function generateSensorReading(sensorType: string): SensorReading {
  const values: Record<string, { min: number; max: number; unit: string }> = {
    temperature: { min: -20, max: 50, unit: 'celsius' },
    humidity: { min: 0, max: 100, unit: 'percent' },
    pressure: { min: 900, max: 1100, unit: 'hPa' },
    motion: { min: 0, max: 1, unit: 'boolean' },
  };
  const config = values[sensorType] || values.temperature;

  return {
    deviceId: `SENSOR-${Math.floor(Math.random() * 1000).toString().padStart(4, '0')}`,
    sensorType,
    value: Math.round((config.min + Math.random() * (config.max - config.min)) * 100) / 100,
    unit: config.unit,
    location: {
      lat: 37.7749 + (Math.random() - 0.5) * 0.1,
      lng: -122.4194 + (Math.random() - 0.5) * 0.1,
      zone: IOT_ZONES[Math.floor(Math.random() * IOT_ZONES.length)],
    },
    batteryLevel: Math.floor(Math.random() * 100),
    signalStrength: -30 - Math.floor(Math.random() * 70),
    timestamp: new Date().toISOString(),
  };
}

function generatePayment(orderId?: string): Payment {
  const methods = ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay'];
  const statuses = ['initiated', 'authorized', 'captured', 'failed'];
  const status = statuses[Math.floor(Math.random() * statuses.length)];

  return {
    paymentId: `PAY-${Date.now()}-${++counters.payment}`,
    orderId: orderId || `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    customerId: `CUST-${Math.floor(Math.random() * 100000).toString().padStart(6, '0')}`,
    amount: Math.round((Math.random() * 5000 + 50) * 100) / 100,
    currency: 'USD',
    method: methods[Math.floor(Math.random() * methods.length)],
    cardLast4: Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
    status,
    gatewayResponse: status === 'failed' ? 'Insufficient funds' : 'Approved',
    timestamp: new Date().toISOString(),
  };
}

function generateChatMessage(isDM: boolean = false): ChatMessage {
  const messageTypes = ['text', 'text', 'text', 'image', 'file', 'emoji'];
  const messages = [
    'Hey, how are you?',
    'Did you see the latest update?',
    'Let me check and get back to you',
    'Sounds good!',
    'Can we schedule a meeting?',
    'Thanks for the help!',
    'I have a question about the project',
    'The deployment looks successful',
  ];

  return {
    messageId: `MSG-${Date.now()}-${++counters.message}`,
    roomId: isDM ? undefined : `room-${Math.floor(Math.random() * 100)}`,
    senderId: `USER-${Math.floor(Math.random() * 1000)}`,
    recipientId: isDM ? `USER-${Math.floor(Math.random() * 1000)}` : undefined,
    content: messages[Math.floor(Math.random() * messages.length)],
    messageType: messageTypes[Math.floor(Math.random() * messageTypes.length)],
    timestamp: new Date().toISOString(),
  };
}

function generateUserActivity(): UserActivity {
  const eventTypes = ['pageview', 'click', 'search', 'conversion'];
  const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const pages = ['/home', '/products', '/product/123', '/cart', '/checkout', '/account', '/search'];

  const activity: UserActivity = {
    sessionId: `SESSION-${Math.random().toString(36).substring(2, 15)}`,
    userId: `USER-${Math.floor(Math.random() * 10000)}`,
    eventType,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    metadata: {},
    timestamp: new Date().toISOString(),
  };

  switch (eventType) {
    case 'pageview':
      activity.page = pages[Math.floor(Math.random() * pages.length)];
      break;
    case 'click':
      activity.page = pages[Math.floor(Math.random() * pages.length)];
      activity.element = ['button', 'link', 'image', 'card'][Math.floor(Math.random() * 4)];
      break;
    case 'search':
      activity.searchQuery = ['laptop', 'phone', 'headphones', 'tablet'][Math.floor(Math.random() * 4)];
      break;
    case 'conversion':
      activity.productId = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)].sku;
      activity.metadata = { revenue: Math.round(Math.random() * 500 * 100) / 100 };
      break;
  }

  return activity;
}

function generateLog(): LogEntry {
  const levels = ['info', 'info', 'info', 'info', 'warn', 'error'];
  const level = levels[Math.floor(Math.random() * levels.length)];
  const messages: Record<string, string[]> = {
    info: ['Request processed successfully', 'User authenticated', 'Cache hit', 'Database query executed', 'Job completed'],
    warn: ['High memory usage detected', 'Slow query detected', 'Rate limit approaching', 'Retry attempt', 'Connection pool low'],
    error: ['Connection refused', 'Query timeout', 'Invalid request payload', 'Authentication failed', 'Service unavailable'],
  };

  return {
    level,
    service: SERVICES[Math.floor(Math.random() * SERVICES.length)],
    message: messages[level][Math.floor(Math.random() * messages[level].length)],
    traceId: `trace-${Math.random().toString(36).substring(2, 15)}`,
    spanId: `span-${Math.random().toString(36).substring(2, 10)}`,
    metadata: {
      requestId: Math.random().toString(36).substring(2, 10),
      duration: Math.floor(Math.random() * 1000),
    },
    timestamp: new Date().toISOString(),
  };
}

function generateMetric(): MetricData {
  const types = ['cpu', 'memory', 'disk', 'network'];
  const metricType = types[Math.floor(Math.random() * types.length)];
  const host = HOSTS[Math.floor(Math.random() * HOSTS.length)];

  const configs: Record<string, { value: () => number; unit: string }> = {
    cpu: { value: () => Math.random() * 100, unit: 'percent' },
    memory: { value: () => Math.random() * 100, unit: 'percent' },
    disk: { value: () => Math.random() * 100, unit: 'percent' },
    network: { value: () => Math.random() * 1000, unit: 'mbps' },
  };

  return {
    host,
    metricType,
    value: Math.round(configs[metricType].value() * 100) / 100,
    unit: configs[metricType].unit,
    tags: { environment: 'production', region: 'us-west-2' },
    timestamp: new Date().toISOString(),
  };
}

// ==================== Scenario Runners ====================

async function runEcommerceScenario(js: JetStreamClient) {
  // Order lifecycle
  const order = generateOrder();
  const orderSubjects = ['orders.created', 'orders.paid', 'orders.shipped', 'orders.delivered'];
  const subject = orderSubjects[Math.floor(Math.random() * orderSubjects.length)];
  await js.publish(subject, sc.encode(JSON.stringify(order)));
  console.log(`[ECOM] ${subject} - Order ${order.orderId} ($${order.total})`);

  // Inventory update
  const inventory = generateInventoryUpdate();
  await js.publish(`inventory.${inventory.changeReason}`, sc.encode(JSON.stringify(inventory)));
  console.log(`[ECOM] inventory.${inventory.changeReason} - ${inventory.sku} (${inventory.newQuantity} units)`);
}

async function runIoTScenario(js: JetStreamClient) {
  const sensorTypes = ['temperature', 'humidity', 'pressure', 'motion'];
  const sensorType = sensorTypes[Math.floor(Math.random() * sensorTypes.length)];
  const reading = generateSensorReading(sensorType);

  await js.publish(`iot.${sensorType}.${reading.location.zone}`, sc.encode(JSON.stringify(reading)));
  console.log(`[IOT] iot.${sensorType}.${reading.location.zone} - Device ${reading.deviceId}: ${reading.value}${reading.unit}`);
}

async function runFinancialScenario(js: JetStreamClient) {
  const payment = generatePayment();
  const subject = `payment.${payment.status}`;
  await js.publish(subject, sc.encode(JSON.stringify(payment)));
  console.log(`[FIN] ${subject} - ${payment.paymentId} ($${payment.amount}) via ${payment.method}`);

  // Fraud check for new payments
  if (payment.status === 'initiated' && Math.random() > 0.7) {
    const fraudCheck = {
      paymentId: payment.paymentId,
      riskScore: Math.floor(Math.random() * 100),
      flags: ['high_amount', 'new_device', 'unusual_location'].slice(0, Math.floor(Math.random() * 3)),
      timestamp: new Date().toISOString(),
    };
    await js.publish('fraud.check', sc.encode(JSON.stringify(fraudCheck)));
    console.log(`[FIN] fraud.check - ${payment.paymentId} (risk: ${fraudCheck.riskScore})`);
  }
}

async function runChatScenario(js: JetStreamClient) {
  const isDM = Math.random() > 0.6;
  const message = generateChatMessage(isDM);

  const subject = isDM ? `chat.dm.${message.senderId}` : `chat.room.${message.roomId}`;
  await js.publish(subject, sc.encode(JSON.stringify(message)));
  console.log(`[CHAT] ${subject} - "${message.content.substring(0, 30)}..."`);

  // Presence updates
  if (Math.random() > 0.8) {
    const presenceTypes = ['presence.online', 'presence.offline', 'presence.typing'];
    const presence = {
      userId: message.senderId,
      roomId: message.roomId,
      timestamp: new Date().toISOString(),
    };
    const presenceSubject = presenceTypes[Math.floor(Math.random() * presenceTypes.length)];
    await js.publish(presenceSubject, sc.encode(JSON.stringify(presence)));
    console.log(`[CHAT] ${presenceSubject} - User ${message.senderId}`);
  }
}

async function runAnalyticsScenario(js: JetStreamClient) {
  const activity = generateUserActivity();
  await js.publish(`activity.${activity.eventType}`, sc.encode(JSON.stringify(activity)));
  console.log(`[ANALYTICS] activity.${activity.eventType} - User ${activity.userId} on ${activity.page || activity.searchQuery || 'conversion'}`);
}

async function runSystemScenario(js: JetStreamClient) {
  // Logs
  const log = generateLog();
  await js.publish(`logs.${log.level}`, sc.encode(JSON.stringify(log)));
  console.log(`[SYS] logs.${log.level} - ${log.service}: ${log.message}`);

  // Metrics
  const metric = generateMetric();
  await js.publish(`metrics.${metric.metricType}`, sc.encode(JSON.stringify(metric)));
  console.log(`[SYS] metrics.${metric.metricType} - ${metric.host}: ${metric.value}${metric.unit}`);

  // Audit trail
  if (Math.random() > 0.9) {
    const auditTypes = ['user.login', 'user.logout', 'admin.config_change', 'system.startup'];
    const auditType = auditTypes[Math.floor(Math.random() * auditTypes.length)];
    const audit = {
      eventType: auditType,
      userId: `USER-${Math.floor(Math.random() * 1000)}`,
      ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      details: { action: auditType.split('.')[1] },
      timestamp: new Date().toISOString(),
    };
    await js.publish(`audit.${auditType}`, sc.encode(JSON.stringify(audit)));
    console.log(`[SYS] audit.${auditType} - User ${audit.userId}`);
  }
}

// ==================== Main ====================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          NATS JetStream - Multi-Scenario Producer           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`Connecting to NATS at ${NATS_URL}`);
  console.log(`Scenario: ${SCENARIO}\n`);

  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();

  console.log('Starting message production... (Press Ctrl+C to stop)\n');
  console.log('─'.repeat(70) + '\n');

  const scenarios: Record<string, { fn: (js: JetStreamClient) => Promise<void>; interval: number }> = {
    ecommerce: { fn: runEcommerceScenario, interval: 2000 },
    iot: { fn: runIoTScenario, interval: 100 },
    financial: { fn: runFinancialScenario, interval: 1500 },
    chat: { fn: runChatScenario, interval: 500 },
    analytics: { fn: runAnalyticsScenario, interval: 200 },
    system: { fn: runSystemScenario, interval: 1000 },
  };

  const intervals: NodeJS.Timeout[] = [];

  if (SCENARIO === 'all') {
    // Run all scenarios
    for (const [name, config] of Object.entries(scenarios)) {
      const interval = setInterval(async () => {
        try {
          await config.fn(js);
        } catch (err: any) {
          console.error(`[${name.toUpperCase()}] Error: ${err.message}`);
        }
      }, config.interval);
      intervals.push(interval);
    }
  } else if (scenarios[SCENARIO]) {
    const config = scenarios[SCENARIO];
    const interval = setInterval(async () => {
      try {
        await config.fn(js);
      } catch (err: any) {
        console.error(`[${SCENARIO.toUpperCase()}] Error: ${err.message}`);
      }
    }, config.interval);
    intervals.push(interval);
  } else {
    console.error(`Unknown scenario: ${SCENARIO}`);
    console.error(`Available: all, ecommerce, iot, financial, chat, analytics, system`);
    process.exit(1);
  }

  // Stats reporter
  const statsInterval = setInterval(() => {
    console.log('\n' + '─'.repeat(70));
    console.log(`Stats: Orders=${counters.order} Payments=${counters.payment} Messages=${counters.message} Sensors=${counters.sensor} Activities=${counters.activity} Logs=${counters.log}`);
    console.log('─'.repeat(70) + '\n');
  }, 10000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    intervals.forEach(clearInterval);
    clearInterval(statsInterval);
    await nc.drain();
    console.log('Producer stopped.');
    process.exit(0);
  });

  await nc.closed();
}

main().catch(console.error);
