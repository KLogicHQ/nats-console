-- Stream metrics table
CREATE TABLE IF NOT EXISTS stream_metrics
(
    cluster_id UUID,
    stream_name String,
    timestamp DateTime64(3),
    messages_total UInt64,
    bytes_total UInt64,
    messages_rate Float64,
    bytes_rate Float64,
    consumer_count UInt32,
    first_seq UInt64,
    last_seq UInt64,
    subjects Array(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, stream_name, timestamp)
TTL timestamp + INTERVAL 90 DAY;

-- Consumer metrics table
CREATE TABLE IF NOT EXISTS consumer_metrics
(
    cluster_id UUID,
    stream_name String,
    consumer_name String,
    timestamp DateTime64(3),
    pending_count UInt64,
    ack_pending UInt64,
    redelivered UInt64,
    waiting UInt64,
    delivered_rate Float64,
    ack_rate Float64,
    lag Int64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, stream_name, consumer_name, timestamp)
TTL timestamp + INTERVAL 90 DAY;

-- Cluster metrics table
CREATE TABLE IF NOT EXISTS cluster_metrics
(
    cluster_id UUID,
    server_id String,
    server_name String,
    timestamp DateTime64(3),
    cpu_percent Float32,
    memory_bytes UInt64,
    connections UInt32,
    subscriptions UInt32,
    slow_consumers UInt32,
    in_msgs UInt64,
    out_msgs UInt64,
    in_bytes UInt64,
    out_bytes UInt64
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, server_id, timestamp)
TTL timestamp + INTERVAL 180 DAY;

-- Message samples table
CREATE TABLE IF NOT EXISTS message_samples
(
    cluster_id UUID,
    stream_name String,
    subject String,
    sequence UInt64,
    timestamp DateTime64(3),
    headers Map(String, String),
    payload_preview String,
    payload_size UInt32,
    payload_type String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, stream_name, subject, timestamp)
TTL timestamp + INTERVAL 7 DAY;

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs
(
    id UUID,
    org_id UUID,
    user_id UUID,
    user_email String,
    timestamp DateTime64(3),
    action String,
    resource_type String,
    resource_id String,
    resource_name String,
    cluster_id Nullable(UUID),
    ip_address IPv6,
    user_agent String,
    request_id String,
    changes String,
    status Enum8('success' = 1, 'failure' = 2, 'denied' = 3),
    error_message Nullable(String)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, timestamp, action)
TTL timestamp + INTERVAL 365 DAY;

-- Alert events table
CREATE TABLE IF NOT EXISTS alert_events
(
    id UUID,
    org_id UUID,
    alert_rule_id UUID,
    cluster_id UUID,
    timestamp DateTime64(3),
    severity Enum8('info' = 1, 'warning' = 2, 'critical' = 3),
    status Enum8('firing' = 1, 'resolved' = 2),
    metric_value Float64,
    threshold_value Float64,
    message String,
    notified_at Nullable(DateTime64(3)),
    resolved_at Nullable(DateTime64(3))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, alert_rule_id, timestamp)
TTL timestamp + INTERVAL 90 DAY;

-- Materialized view for hourly stream metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS stream_metrics_hourly
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (cluster_id, stream_name, hour)
AS SELECT
    cluster_id,
    stream_name,
    toStartOfHour(timestamp) AS hour,
    sum(messages_total) AS messages_sum,
    sum(bytes_total) AS bytes_sum,
    avg(messages_rate) AS avg_rate,
    max(messages_rate) AS max_rate,
    count() AS sample_count
FROM stream_metrics
GROUP BY cluster_id, stream_name, hour;

-- Materialized view for daily stream metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS stream_metrics_daily
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (cluster_id, stream_name, day)
AS SELECT
    cluster_id,
    stream_name,
    toDate(timestamp) AS day,
    sum(messages_total) AS messages_sum,
    sum(bytes_total) AS bytes_sum,
    avg(messages_rate) AS avg_rate,
    max(messages_rate) AS max_rate,
    count() AS sample_count
FROM stream_metrics
GROUP BY cluster_id, stream_name, day;
