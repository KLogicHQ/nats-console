/**
 * Test all scenarios: creates various stream configurations and consumer patterns
 */
import { connect, StringCodec, JetStreamManager, RetentionPolicy, StorageType, AckPolicy, DeliverPolicy, DiscardPolicy, ReplayPolicy } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const sc = StringCodec();

async function main() {
  console.log('=== NATS JetStream All Scenarios Test ===\n');
  console.log('Connecting to', NATS_URL);

  const nc = await connect({ servers: NATS_URL });
  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  // Cleanup existing test streams
  console.log('\nCleaning up existing test streams...\n');
  for await (const si of jsm.streams()) {
    if (si.config.name.startsWith('TEST_')) {
      await jsm.streams.delete(si.config.name);
      console.log(`Deleted stream: ${si.config.name}`);
    }
  }

  console.log('\n=== Scenario 1: Different Retention Policies ===\n');

  // Limits retention (default)
  await createStream(jsm, {
    name: 'TEST_LIMITS',
    subjects: ['test.limits.>'],
    retention: RetentionPolicy.Limits,
    max_msgs: 1000,
    max_bytes: 1024 * 1024,
    description: 'Limits retention: keeps messages until limits exceeded',
  });

  // Interest retention
  await createStream(jsm, {
    name: 'TEST_INTEREST',
    subjects: ['test.interest.>'],
    retention: RetentionPolicy.Interest,
    description: 'Interest retention: removes messages when no consumers',
  });

  // Work queue retention
  await createStream(jsm, {
    name: 'TEST_WORKQUEUE',
    subjects: ['test.workqueue.>'],
    retention: RetentionPolicy.WorkQueue,
    description: 'Work queue: removes messages after acknowledgment',
  });

  console.log('\n=== Scenario 2: Different Storage Types ===\n');

  // File storage (persistent)
  await createStream(jsm, {
    name: 'TEST_FILE_STORAGE',
    subjects: ['test.file.>'],
    storage: StorageType.File,
    description: 'File storage: persistent to disk',
  });

  // Memory storage (fast)
  await createStream(jsm, {
    name: 'TEST_MEMORY_STORAGE',
    subjects: ['test.memory.>'],
    storage: StorageType.Memory,
    max_msgs: 10000,
    description: 'Memory storage: fast but not persistent',
  });

  console.log('\n=== Scenario 3: Different Discard Policies ===\n');

  // Discard old
  await createStream(jsm, {
    name: 'TEST_DISCARD_OLD',
    subjects: ['test.old.>'],
    max_msgs: 100,
    discard: DiscardPolicy.Old,
    description: 'Discard old: removes oldest messages when full',
  });

  // Discard new
  await createStream(jsm, {
    name: 'TEST_DISCARD_NEW',
    subjects: ['test.new.>'],
    max_msgs: 100,
    discard: DiscardPolicy.New,
    description: 'Discard new: rejects new messages when full',
  });

  console.log('\n=== Scenario 4: Different Consumer Patterns ===\n');

  // Create a stream for consumer tests
  await createStream(jsm, {
    name: 'TEST_CONSUMERS',
    subjects: ['test.consumers.>'],
    max_msgs: 10000,
  });

  // Durable consumer (survives restarts)
  await createConsumer(jsm, 'TEST_CONSUMERS', {
    durable_name: 'durable-consumer',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    description: 'Durable consumer: survives restarts',
  });

  // Ephemeral consumer (temporary)
  await createConsumer(jsm, 'TEST_CONSUMERS', {
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.New,
    inactive_threshold: 5000000000, // 5 seconds
    description: 'Ephemeral consumer: temporary',
  });

  // Consumer with filter subject
  await createConsumer(jsm, 'TEST_CONSUMERS', {
    durable_name: 'filtered-consumer',
    ack_policy: AckPolicy.Explicit,
    filter_subject: 'test.consumers.important',
    description: 'Filtered consumer: only specific subjects',
  });

  // Consumer starting from specific sequence
  await createConsumer(jsm, 'TEST_CONSUMERS', {
    durable_name: 'sequence-consumer',
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.StartSequence,
    opt_start_seq: 1,
    description: 'Sequence consumer: starts from specific seq',
  });

  console.log('\n=== Scenario 5: High Volume Test ===\n');

  await createStream(jsm, {
    name: 'TEST_HIGH_VOLUME',
    subjects: ['test.highvol.>'],
    max_msgs: 1000000,
    max_bytes: 500 * 1024 * 1024,
    description: 'High volume stream for load testing',
  });

  // Publish test messages
  console.log('Publishing test messages...\n');

  const streams = ['TEST_LIMITS', 'TEST_INTEREST', 'TEST_WORKQUEUE', 'TEST_FILE_STORAGE',
                   'TEST_MEMORY_STORAGE', 'TEST_DISCARD_OLD', 'TEST_DISCARD_NEW', 'TEST_CONSUMERS'];

  for (const stream of streams) {
    const prefix = stream.replace('TEST_', '').toLowerCase();
    for (let i = 0; i < 10; i++) {
      try {
        await js.publish(`test.${prefix}.message`, sc.encode(JSON.stringify({
          stream,
          index: i,
          timestamp: new Date().toISOString(),
        })));
      } catch (err) {
        // Ignore errors for discard new policy
      }
    }
    console.log(`Published 10 messages to ${stream}`);
  }

  console.log('\n=== Summary ===\n');

  for await (const si of jsm.streams()) {
    if (si.config.name.startsWith('TEST_')) {
      console.log(`${si.config.name}:`);
      console.log(`  Messages: ${si.state.messages}`);
      console.log(`  Bytes: ${si.state.bytes}`);
      console.log(`  Consumers: ${si.state.consumer_count}`);
      console.log(`  Retention: ${si.config.retention}`);
      console.log(`  Storage: ${si.config.storage}`);
      console.log('');
    }
  }

  console.log('All scenarios created successfully!');
  console.log('Open NATS Console to view the streams and consumers.\n');

  await nc.close();
}

async function createStream(jsm: JetStreamManager, config: any) {
  try {
    await jsm.streams.add(config);
    console.log(`✓ Created stream: ${config.name}`);
  } catch (err: any) {
    if (err.message.includes('already in use')) {
      console.log(`  Stream ${config.name} already exists`);
    } else {
      throw err;
    }
  }
}

async function createConsumer(jsm: JetStreamManager, stream: string, config: any) {
  try {
    const info = await jsm.consumers.add(stream, config);
    console.log(`✓ Created consumer: ${stream}/${config.durable_name || 'ephemeral'}`);
  } catch (err: any) {
    console.log(`  Consumer creation error: ${err.message}`);
  }
}

main().catch(console.error);
