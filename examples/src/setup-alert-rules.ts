/**
 * Setup golden alert rules for testing with load tests
 * These rules are designed to trigger incidents during normal load test scenarios
 */

const API_URL = process.env.API_URL || 'http://localhost:3001/api/v1';

// Default test credentials (same as used in development)
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password123';

interface AlertRule {
  name: string;
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
    window: number;  // seconds
    aggregation: 'avg' | 'min' | 'max' | 'sum' | 'count';
  };
  threshold: {
    value: number;
    type: 'absolute' | 'percentage';
  };
  severity: 'critical' | 'warning' | 'info';
  isEnabled: boolean;
  cooldownMins: number;
}

// Golden alert rules designed to trigger during load tests
const GOLDEN_ALERT_RULES: AlertRule[] = [
  // High message rate alerts - should trigger during any load test
  {
    name: 'High Message Rate (Warning)',
    condition: {
      metric: 'message_rate',
      operator: 'gt',
      window: 60,  // 1 minute window
      aggregation: 'avg',
    },
    threshold: {
      value: 50,  // 50 msg/s - low threshold to trigger easily
      type: 'absolute',
    },
    severity: 'warning',
    isEnabled: true,
    cooldownMins: 2,
  },
  {
    name: 'High Message Rate (Critical)',
    condition: {
      metric: 'message_rate',
      operator: 'gt',
      window: 60,
      aggregation: 'avg',
    },
    threshold: {
      value: 200,  // 200 msg/s - triggers during heavy load
      type: 'absolute',
    },
    severity: 'critical',
    isEnabled: true,
    cooldownMins: 2,
  },

  // Consumer lag alerts - should trigger when consumers fall behind
  {
    name: 'Consumer Lag Detected (Warning)',
    condition: {
      metric: 'consumer_lag',
      operator: 'gt',
      window: 60,
      aggregation: 'sum',
    },
    threshold: {
      value: 100,  // 100 pending messages total
      type: 'absolute',
    },
    severity: 'warning',
    isEnabled: true,
    cooldownMins: 2,
  },
  {
    name: 'Consumer Lag Critical',
    condition: {
      metric: 'consumer_lag',
      operator: 'gt',
      window: 60,
      aggregation: 'sum',
    },
    threshold: {
      value: 1000,  // 1000 pending messages
      type: 'absolute',
    },
    severity: 'critical',
    isEnabled: true,
    cooldownMins: 2,
  },

  // Bytes rate alerts
  {
    name: 'High Throughput (Bytes)',
    condition: {
      metric: 'bytes_rate',
      operator: 'gt',
      window: 60,
      aggregation: 'avg',
    },
    threshold: {
      value: 50000,  // 50 KB/s
      type: 'absolute',
    },
    severity: 'info',
    isEnabled: true,
    cooldownMins: 5,
  },

  // Stream size alerts
  {
    name: 'Stream Storage Growing',
    condition: {
      metric: 'stream_size',
      operator: 'gt',
      window: 300,  // 5 minute window
      aggregation: 'max',
    },
    threshold: {
      value: 10 * 1024 * 1024,  // 10 MB
      type: 'absolute',
    },
    severity: 'warning',
    isEnabled: true,
    cooldownMins: 10,
  },

  // Redelivery alerts - indicates processing failures
  {
    name: 'High Redelivery Rate',
    condition: {
      metric: 'redelivered_count',
      operator: 'gt',
      window: 120,  // 2 minute window
      aggregation: 'sum',
    },
    threshold: {
      value: 10,  // 10 redeliveries
      type: 'absolute',
    },
    severity: 'warning',
    isEnabled: true,
    cooldownMins: 5,
  },

  // Stream-specific alerts (for DLQ monitoring)
  {
    name: 'DLQ Messages Detected',
    condition: {
      metric: 'stream.DLQ.messages_count',
      operator: 'gt',
      window: 60,
      aggregation: 'max',
    },
    threshold: {
      value: 5,  // Any DLQ messages
      type: 'absolute',
    },
    severity: 'warning',
    isEnabled: true,
    cooldownMins: 5,
  },
  {
    name: 'DLQ Critical Backlog',
    condition: {
      metric: 'stream.DLQ.messages_count',
      operator: 'gt',
      window: 60,
      aggregation: 'max',
    },
    threshold: {
      value: 50,  // 50+ DLQ messages
      type: 'absolute',
    },
    severity: 'critical',
    isEnabled: true,
    cooldownMins: 2,
  },

  // IoT stream monitoring
  {
    name: 'IoT Sensor Flood',
    condition: {
      metric: 'stream.IOT_SENSORS.messages_rate',
      operator: 'gt',
      window: 60,
      aggregation: 'avg',
    },
    threshold: {
      value: 100,  // 100 msg/s from IoT
      type: 'absolute',
    },
    severity: 'info',
    isEnabled: true,
    cooldownMins: 5,
  },

  // Order processing alerts
  {
    name: 'Order Processing Backlog',
    condition: {
      metric: 'consumer.ORDERS.order-validator.lag',
      operator: 'gt',
      window: 60,
      aggregation: 'avg',
    },
    threshold: {
      value: 50,  // 50 pending orders
      type: 'absolute',
    },
    severity: 'warning',
    isEnabled: true,
    cooldownMins: 5,
  },
];

async function login(): Promise<string> {
  console.log('  Logging in to API...');

  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return data.token;
}

async function getClusterId(token: string): Promise<string | null> {
  const response = await fetch(`${API_URL}/clusters`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    console.log('  Warning: Could not fetch clusters');
    return null;
  }

  const data = await response.json();
  if (data.clusters && data.clusters.length > 0) {
    return data.clusters[0].id;
  }
  return null;
}

async function getExistingRules(token: string): Promise<string[]> {
  const response = await fetch(`${API_URL}/alerts/rules`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return (data.rules || []).map((r: any) => r.name);
}

async function createRule(token: string, rule: AlertRule, clusterId: string | null): Promise<boolean> {
  const response = await fetch(`${API_URL}/alerts/rules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...rule,
      clusterId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.log(`  ✗ ${rule.name}: ${response.status} - ${text}`);
    return false;
  }

  return true;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           NATS Console - Golden Alert Rules Setup                ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log(`API: ${API_URL}`);
  console.log(`Email: ${TEST_EMAIL}\n`);

  try {
    // Login
    const token = await login();
    console.log('  ✓ Logged in successfully\n');

    // Get cluster ID (optional - rules can work without cluster)
    const clusterId = await getClusterId(token);
    if (clusterId) {
      console.log(`  Using cluster: ${clusterId}\n`);
    } else {
      console.log('  No cluster found - creating cluster-agnostic rules\n');
    }

    // Get existing rules to avoid duplicates
    const existingRules = await getExistingRules(token);
    console.log(`  Found ${existingRules.length} existing rules\n`);

    // Create rules
    console.log('━━━━━━━━━━━━━━━━━━━━━ Creating Alert Rules ━━━━━━━━━━━━━━━━━━━━━\n');

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const rule of GOLDEN_ALERT_RULES) {
      if (existingRules.includes(rule.name)) {
        console.log(`  - ${rule.name} (already exists)`);
        skipped++;
        continue;
      }

      const success = await createRule(token, rule, clusterId);
      if (success) {
        const severityIcon = rule.severity === 'critical' ? '🔴' : rule.severity === 'warning' ? '🟡' : '🔵';
        console.log(`  ${severityIcon} ${rule.name} (${rule.condition.metric} ${rule.condition.operator} ${rule.threshold.value})`);
        created++;
      } else {
        failed++;
      }
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║                    Alert Rules Setup Complete                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');

    console.log(`  Created: ${created}`);
    console.log(`  Skipped: ${skipped} (already exist)`);
    console.log(`  Failed:  ${failed}`);
    console.log(`  Total:   ${GOLDEN_ALERT_RULES.length}\n`);

    if (created > 0) {
      console.log('  Run a load test to trigger these alerts:');
      console.log('    make examples-load-test');
      console.log('    # or for heavier load:');
      console.log('    SCENARIO=iot RATE=200 DURATION=60 pnpm run load-test\n');
    }

  } catch (err: any) {
    console.error('\n✗ Error:', err.message);
    console.error('\n  Make sure:');
    console.error('  1. The API is running (make dev)');
    console.error('  2. You have a user account created');
    console.error('  3. The credentials are correct\n');
    process.exit(1);
  }
}

main();
