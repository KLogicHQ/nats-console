-- ClickHouse Schema for NATS Console
-- This script creates all required tables for metrics storage and analytics

-- =============================================================================
-- Stream Metrics Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS stream_metrics (
    cluster_id UUID,
    stream_name String,
    timestamp DateTime64(3, 'UTC'),
    messages_total UInt64,
    bytes_total UInt64,
    messages_rate Float64,
    bytes_rate Float64,
    consumer_count UInt32,
    first_seq UInt64,
    last_seq UInt64,
    subjects Array(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, stream_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

-- =============================================================================
-- Consumer Metrics Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS consumer_metrics (
    cluster_id UUID,
    stream_name String,
    consumer_name String,
    timestamp DateTime64(3, 'UTC'),
    pending_count UInt64,
    ack_pending UInt64,
    redelivered UInt64,
    waiting UInt64,
    delivered_rate Float64,
    ack_rate Float64,
    lag UInt64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, stream_name, consumer_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

-- =============================================================================
-- Cluster Metrics Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS cluster_metrics (
    cluster_id UUID,
    server_id String,
    server_name String,
    timestamp DateTime64(3, 'UTC'),
    cpu_percent Float64,
    memory_bytes UInt64,
    connections UInt32,
    subscriptions UInt32,
    slow_consumers UInt32,
    in_msgs UInt64,
    out_msgs UInt64,
    in_bytes UInt64,
    out_bytes UInt64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, server_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY;

-- =============================================================================
-- Audit Logs Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID,
    org_id UUID,
    user_id UUID,
    user_email String,
    timestamp DateTime64(3, 'UTC'),
    action String,
    resource_type String,
    resource_id String,
    resource_name String,
    cluster_id Nullable(UUID),
    ip_address String,
    user_agent String,
    request_id String,
    changes String DEFAULT '{}',
    status String,
    error_message Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- =============================================================================
-- Alert Events Table (for historical alert tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS alert_events (
    id UUID,
    org_id UUID,
    rule_id UUID,
    cluster_id Nullable(UUID),
    timestamp DateTime64(3, 'UTC'),
    severity String,
    status String,
    metric_name String,
    metric_value Float64,
    threshold_value Float64,
    message String,
    metadata String DEFAULT '{}'
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- =============================================================================
-- Message Samples Table (for message inspection/debugging)
-- =============================================================================
CREATE TABLE IF NOT EXISTS message_samples (
    cluster_id UUID,
    stream_name String,
    subject String,
    sequence UInt64,
    timestamp DateTime64(3, 'UTC'),
    size UInt32,
    headers String DEFAULT '{}',
    data_preview String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (cluster_id, stream_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 7 DAY;

-- =============================================================================
-- Materialized Views for Aggregations
-- =============================================================================

-- Hourly stream metrics aggregation
CREATE TABLE IF NOT EXISTS stream_metrics_hourly (
    cluster_id UUID,
    stream_name String,
    hour DateTime,
    messages_total_avg Float64,
    bytes_total_avg Float64,
    messages_rate_avg Float64,
    bytes_rate_avg Float64,
    messages_rate_max Float64,
    bytes_rate_max Float64,
    consumer_count_avg Float64,
    sample_count UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (cluster_id, stream_name, hour)
TTL hour + INTERVAL 365 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS stream_metrics_hourly_mv
TO stream_metrics_hourly AS
SELECT
    cluster_id,
    stream_name,
    toStartOfHour(timestamp) as hour,
    avg(messages_total) as messages_total_avg,
    avg(bytes_total) as bytes_total_avg,
    avg(messages_rate) as messages_rate_avg,
    avg(bytes_rate) as bytes_rate_avg,
    max(messages_rate) as messages_rate_max,
    max(bytes_rate) as bytes_rate_max,
    avg(consumer_count) as consumer_count_avg,
    count() as sample_count
FROM stream_metrics
GROUP BY cluster_id, stream_name, hour;

-- Daily stream metrics aggregation
CREATE TABLE IF NOT EXISTS stream_metrics_daily (
    cluster_id UUID,
    stream_name String,
    day Date,
    messages_total_avg Float64,
    bytes_total_avg Float64,
    messages_rate_avg Float64,
    bytes_rate_avg Float64,
    messages_rate_max Float64,
    bytes_rate_max Float64,
    consumer_count_avg Float64,
    sample_count UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (cluster_id, stream_name, day);

CREATE MATERIALIZED VIEW IF NOT EXISTS stream_metrics_daily_mv
TO stream_metrics_daily AS
SELECT
    cluster_id,
    stream_name,
    toDate(timestamp) as day,
    avg(messages_total) as messages_total_avg,
    avg(bytes_total) as bytes_total_avg,
    avg(messages_rate) as messages_rate_avg,
    avg(bytes_rate) as bytes_rate_avg,
    max(messages_rate) as messages_rate_max,
    max(bytes_rate) as bytes_rate_max,
    avg(consumer_count) as consumer_count_avg,
    count() as sample_count
FROM stream_metrics
GROUP BY cluster_id, stream_name, day;

-- Hourly consumer lag aggregation
CREATE TABLE IF NOT EXISTS consumer_metrics_hourly (
    cluster_id UUID,
    stream_name String,
    consumer_name String,
    hour DateTime,
    pending_count_avg Float64,
    lag_avg Float64,
    lag_max UInt64,
    delivered_rate_avg Float64,
    ack_rate_avg Float64,
    sample_count UInt64
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (cluster_id, stream_name, consumer_name, hour)
TTL hour + INTERVAL 365 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS consumer_metrics_hourly_mv
TO consumer_metrics_hourly AS
SELECT
    cluster_id,
    stream_name,
    consumer_name,
    toStartOfHour(timestamp) as hour,
    avg(pending_count) as pending_count_avg,
    avg(lag) as lag_avg,
    max(lag) as lag_max,
    avg(delivered_rate) as delivered_rate_avg,
    avg(ack_rate) as ack_rate_avg,
    count() as sample_count
FROM consumer_metrics
GROUP BY cluster_id, stream_name, consumer_name, hour;
