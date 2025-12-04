# NATS JetStream Management Console - System Design Document

## Executive Summary

A modern, enterprise-grade web console for managing NATS JetStream clusters, inspired by Redpanda Console and Confluent Control Center. This design covers architecture, database schemas, UI/UX patterns, authentication, and analytics infrastructure.

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│                    (Web Browsers / Mobile / API Consumers)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LOAD BALANCER / CDN                                │
│                         (Nginx / Cloudflare / AWS ALB)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌──────────────────────────────┐      ┌──────────────────────────────────────┐
│      FRONTEND (Next.js)      │      │         API GATEWAY                   │
│  ─────────────────────────── │      │  ────────────────────────────────────│
│  • SSR/SSG Pages             │      │  • Rate Limiting                     │
│  • React Components          │      │  • Request Validation                │
│  • TanStack Query            │      │  • API Versioning                    │
│  • Zustand State             │      │  • Request Logging                   │
│  • Tailwind CSS              │      │  • CORS Handling                     │
│  • shadcn/ui Components      │      └──────────────────────────────────────┘
└──────────────────────────────┘                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVICES (Node.js/TypeScript)                 │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│  Auth Service   │  Core API       │  Analytics      │  Background Workers   │
│  ────────────── │  Service        │  Service        │  ───────────────────  │
│  • JWT/Sessions │  ────────────── │  ───────────────│  • Metrics Collector  │
│  • OAuth/OIDC   │  • Streams CRUD │  • Query Engine │  • Alert Processor    │
│  • RBAC Engine  │  • Consumers    │  • Aggregations │  • Audit Logger       │
│  • User Mgmt    │  • Messages     │  • Dashboards   │  • Cleanup Jobs       │
│  • Teams/Orgs   │  • Cluster Ops  │  • Reports      │  • Sync Jobs          │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘
         │                 │                 │                    │
         ▼                 ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
├──────────────────┬──────────────────┬──────────────────┬────────────────────┤
│   PostgreSQL     │     Redis        │   ClickHouse     │   NATS JetStream   │
│   ────────────── │   ────────────── │   ──────────────│   ────────────────  │
│   • Users/Auth   │   • Sessions     │   • Metrics TS   │   • Streams        │
│   • Teams/Orgs   │   • Cache        │   • Audit Logs   │   • Consumers      │
│   • Permissions  │   • Rate Limits  │   • Message Stats│   • Messages       │
│   • Configs      │   • Real-time    │   • Aggregates   │   • Cluster State  │
│   • Audit Meta   │   • Pub/Sub      │   • Long History │   • KV Store       │
└──────────────────┴──────────────────┴──────────────────┴────────────────────┘
```

### 1.2 Service Communication

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMMUNICATION PATTERNS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    REST/GraphQL    ┌──────────────┐               │
│  │ Frontend │◄──────────────────►│  API Gateway │               │
│  └──────────┘                    └──────────────┘               │
│                                         │                        │
│                         ┌───────────────┼───────────────┐       │
│                         ▼               ▼               ▼       │
│                  ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│                  │   Auth   │    │   Core   │    │Analytics │  │
│                  │ Service  │    │  Service │    │ Service  │  │
│                  └──────────┘    └──────────┘    └──────────┘  │
│                         │               │               │       │
│                         └───────────────┼───────────────┘       │
│                                         │                        │
│                              Internal gRPC / NATS                │
│                                         │                        │
│                         ┌───────────────┴───────────────┐       │
│                         ▼                               ▼       │
│                  ┌──────────────┐              ┌──────────────┐ │
│                  │   Workers    │              │    NATS      │ │
│                  │  (Bull MQ)   │              │  JetStream   │ │
│                  └──────────────┘              └──────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema Design

### 2.1 PostgreSQL Schema (Application Data)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         POSTGRESQL SCHEMA                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────┐      ┌────────────────────────┐
│      organizations     │      │         users          │
├────────────────────────┤      ├────────────────────────┤
│ id              UUID PK│      │ id              UUID PK│
│ name            VARCHAR│      │ email           VARCHAR│
│ slug            VARCHAR│◄────┐│ password_hash   VARCHAR│
│ plan            ENUM   │     ││ first_name      VARCHAR│
│ settings        JSONB  │     ││ last_name       VARCHAR│
│ created_at      TIMESTAMP    ││ avatar_url      VARCHAR│
│ updated_at      TIMESTAMP    ││ status          ENUM   │
└────────────────────────┘     ││ email_verified  BOOLEAN│
         │                     ││ mfa_enabled     BOOLEAN│
         │                     ││ mfa_secret      VARCHAR│
         ▼                     ││ last_login_at   TIMESTAMP
┌────────────────────────┐     ││ created_at      TIMESTAMP
│   organization_members │     ││ updated_at      TIMESTAMP
├────────────────────────┤     │└────────────────────────┘
│ id              UUID PK│     │
│ org_id          UUID FK│─────┘         │
│ user_id         UUID FK│───────────────┘
│ role            ENUM   │
│ invited_by      UUID FK│
│ joined_at       TIMESTAMP
└────────────────────────┘

┌────────────────────────┐      ┌────────────────────────┐
│         teams          │      │     team_members       │
├────────────────────────┤      ├────────────────────────┤
│ id              UUID PK│      │ id              UUID PK│
│ org_id          UUID FK│◄─────│ team_id         UUID FK│
│ name            VARCHAR│      │ user_id         UUID FK│
│ description     TEXT   │      │ role            ENUM   │
│ created_at      TIMESTAMP     │ added_at        TIMESTAMP
│ updated_at      TIMESTAMP     └────────────────────────┘
└────────────────────────┘

┌────────────────────────┐      ┌────────────────────────┐
│    nats_clusters       │      │   cluster_connections  │
├────────────────────────┤      ├────────────────────────┤
│ id              UUID PK│      │ id              UUID PK│
│ org_id          UUID FK│◄─────│ cluster_id      UUID FK│
│ name            VARCHAR│      │ server_url      VARCHAR│
│ description     TEXT   │      │ credentials     JSONB  │ (encrypted)
│ environment     ENUM   │      │ tls_config      JSONB  │
│ status          ENUM   │      │ is_primary      BOOLEAN│
│ version         VARCHAR│      │ health_status   ENUM   │
│ created_at      TIMESTAMP     │ last_health_check TIMESTAMP
│ updated_at      TIMESTAMP     └────────────────────────┘
└────────────────────────┘

┌────────────────────────┐      ┌────────────────────────┐
│   stream_configs       │      │  consumer_configs      │
├────────────────────────┤      ├────────────────────────┤
│ id              UUID PK│      │ id              UUID PK│
│ cluster_id      UUID FK│◄─────│ stream_config_id UUID FK│
│ stream_name     VARCHAR│      │ consumer_name   VARCHAR│
│ config_snapshot JSONB  │      │ config_snapshot JSONB  │
│ created_by      UUID FK│      │ created_by      UUID FK│
│ is_managed      BOOLEAN│      │ is_managed      BOOLEAN│
│ tags            JSONB  │      │ tags            JSONB  │
│ created_at      TIMESTAMP     │ created_at      TIMESTAMP
│ updated_at      TIMESTAMP     │ updated_at      TIMESTAMP
└────────────────────────┘      └────────────────────────┘

┌────────────────────────┐      ┌────────────────────────┐
│        roles           │      │     permissions        │
├────────────────────────┤      ├────────────────────────┤
│ id              UUID PK│      │ id              UUID PK│
│ org_id          UUID FK│◄─────│ role_id         UUID FK│
│ name            VARCHAR│      │ resource        VARCHAR│
│ description     TEXT   │      │ action          VARCHAR│
│ is_system       BOOLEAN│      │ conditions      JSONB  │
│ created_at      TIMESTAMP     └────────────────────────┘
│ updated_at      TIMESTAMP
└────────────────────────┘

┌────────────────────────┐      ┌────────────────────────┐
│     api_keys           │      │      sessions          │
├────────────────────────┤      ├────────────────────────┤
│ id              UUID PK│      │ id              UUID PK│
│ org_id          UUID FK│      │ user_id         UUID FK│
│ user_id         UUID FK│      │ token_hash      VARCHAR│
│ name            VARCHAR│      │ ip_address      INET   │
│ key_hash        VARCHAR│      │ user_agent      TEXT   │
│ prefix          VARCHAR│      │ expires_at      TIMESTAMP
│ permissions     JSONB  │      │ created_at      TIMESTAMP
│ last_used_at    TIMESTAMP     └────────────────────────┘
│ expires_at      TIMESTAMP
│ created_at      TIMESTAMP
└────────────────────────┘

┌────────────────────────┐      ┌────────────────────────┐
│    saved_queries       │      │      dashboards        │
├────────────────────────┤      ├────────────────────────┤
│ id              UUID PK│      │ id              UUID PK│
│ org_id          UUID FK│      │ org_id          UUID FK│
│ user_id         UUID FK│      │ user_id         UUID FK│
│ name            VARCHAR│      │ name            VARCHAR│
│ query           TEXT   │      │ layout          JSONB  │
│ description     TEXT   │      │ widgets         JSONB  │
│ is_shared       BOOLEAN│      │ is_shared       BOOLEAN│
│ created_at      TIMESTAMP     │ created_at      TIMESTAMP
│ updated_at      TIMESTAMP     │ updated_at      TIMESTAMP
└────────────────────────┘      └────────────────────────┘

┌────────────────────────┐
│    alert_rules         │
├────────────────────────┤
│ id              UUID PK│
│ org_id          UUID FK│
│ cluster_id      UUID FK│
│ name            VARCHAR│
│ condition       JSONB  │
│ threshold       JSONB  │
│ severity        ENUM   │
│ channels        JSONB  │
│ is_enabled      BOOLEAN│
│ cooldown_mins   INTEGER│
│ created_at      TIMESTAMP
│ updated_at      TIMESTAMP
└────────────────────────┘
```

### 2.2 ClickHouse Schema (Analytics & Time-Series)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLICKHOUSE SCHEMA                                    │
│                    (Optimized for Time-Series Analytics)                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TABLE: stream_metrics                                                       │
│  ENGINE: MergeTree()                                                         │
│  PARTITION BY: toYYYYMM(timestamp)                                          │
│  ORDER BY: (cluster_id, stream_name, timestamp)                             │
│  TTL: timestamp + INTERVAL 90 DAY                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  cluster_id       UUID                                                       │
│  stream_name      String                                                     │
│  timestamp        DateTime64(3)                                              │
│  messages_total   UInt64                                                     │
│  bytes_total      UInt64                                                     │
│  messages_rate    Float64          (msgs/sec)                               │
│  bytes_rate       Float64          (bytes/sec)                              │
│  consumer_count   UInt32                                                     │
│  first_seq        UInt64                                                     │
│  last_seq         UInt64                                                     │
│  subjects         Array(String)                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TABLE: consumer_metrics                                                     │
│  ENGINE: MergeTree()                                                         │
│  PARTITION BY: toYYYYMM(timestamp)                                          │
│  ORDER BY: (cluster_id, stream_name, consumer_name, timestamp)              │
│  TTL: timestamp + INTERVAL 90 DAY                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  cluster_id       UUID                                                       │
│  stream_name      String                                                     │
│  consumer_name    String                                                     │
│  timestamp        DateTime64(3)                                              │
│  pending_count    UInt64                                                     │
│  ack_pending      UInt64                                                     │
│  redelivered      UInt64                                                     │
│  waiting          UInt64                                                     │
│  delivered_rate   Float64                                                    │
│  ack_rate         Float64                                                    │
│  lag              Int64                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TABLE: cluster_metrics                                                      │
│  ENGINE: MergeTree()                                                         │
│  PARTITION BY: toYYYYMM(timestamp)                                          │
│  ORDER BY: (cluster_id, server_id, timestamp)                               │
│  TTL: timestamp + INTERVAL 180 DAY                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  cluster_id       UUID                                                       │
│  server_id        String                                                     │
│  server_name      String                                                     │
│  timestamp        DateTime64(3)                                              │
│  cpu_percent      Float32                                                    │
│  memory_bytes     UInt64                                                     │
│  connections      UInt32                                                     │
│  subscriptions    UInt32                                                     │
│  slow_consumers   UInt32                                                     │
│  in_msgs          UInt64                                                     │
│  out_msgs         UInt64                                                     │
│  in_bytes         UInt64                                                     │
│  out_bytes        UInt64                                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TABLE: message_samples                                                      │
│  ENGINE: MergeTree()                                                         │
│  PARTITION BY: toYYYYMM(timestamp)                                          │
│  ORDER BY: (cluster_id, stream_name, subject, timestamp)                    │
│  TTL: timestamp + INTERVAL 7 DAY                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  cluster_id       UUID                                                       │
│  stream_name      String                                                     │
│  subject          String                                                     │
│  sequence         UInt64                                                     │
│  timestamp        DateTime64(3)                                              │
│  headers          Map(String, String)                                        │
│  payload_preview  String               (first 1KB, truncated)               │
│  payload_size     UInt32                                                     │
│  payload_type     String               (json, protobuf, avro, binary)       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TABLE: audit_logs                                                           │
│  ENGINE: MergeTree()                                                         │
│  PARTITION BY: toYYYYMM(timestamp)                                          │
│  ORDER BY: (org_id, timestamp, action)                                      │
│  TTL: timestamp + INTERVAL 365 DAY                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  id               UUID                                                       │
│  org_id           UUID                                                       │
│  user_id          UUID                                                       │
│  user_email       String                                                     │
│  timestamp        DateTime64(3)                                              │
│  action           String               (stream.create, consumer.delete, etc)│
│  resource_type    String                                                     │
│  resource_id      String                                                     │
│  resource_name    String                                                     │
│  cluster_id       Nullable(UUID)                                             │
│  ip_address       IPv6                                                       │
│  user_agent       String                                                     │
│  request_id       String                                                     │
│  changes          String               (JSON diff)                          │
│  status           Enum('success', 'failure', 'denied')                      │
│  error_message    Nullable(String)                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TABLE: alert_events                                                         │
│  ENGINE: MergeTree()                                                         │
│  PARTITION BY: toYYYYMM(timestamp)                                          │
│  ORDER BY: (org_id, alert_rule_id, timestamp)                               │
│  TTL: timestamp + INTERVAL 90 DAY                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  id               UUID                                                       │
│  org_id           UUID                                                       │
│  alert_rule_id    UUID                                                       │
│  cluster_id       UUID                                                       │
│  timestamp        DateTime64(3)                                              │
│  severity         Enum('info', 'warning', 'critical')                       │
│  status           Enum('firing', 'resolved')                                │
│  metric_value     Float64                                                    │
│  threshold_value  Float64                                                    │
│  message          String                                                     │
│  notified_at      Nullable(DateTime64(3))                                    │
│  resolved_at      Nullable(DateTime64(3))                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  MATERIALIZED VIEW: stream_metrics_hourly                                    │
│  ENGINE: SummingMergeTree()                                                  │
│  PARTITION BY: toYYYYMM(hour)                                               │
│  ORDER BY: (cluster_id, stream_name, hour)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  cluster_id       UUID                                                       │
│  stream_name      String                                                     │
│  hour             DateTime                                                   │
│  messages_sum     UInt64                                                     │
│  bytes_sum        UInt64                                                     │
│  avg_rate         AggregateFunction(avg, Float64)                           │
│  max_rate         AggregateFunction(max, Float64)                           │
│  sample_count     UInt64                                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  MATERIALIZED VIEW: stream_metrics_daily                                     │
│  ENGINE: SummingMergeTree()                                                  │
│  PARTITION BY: toYYYYMM(day)                                                │
│  ORDER BY: (cluster_id, stream_name, day)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  cluster_id       UUID                                                       │
│  stream_name      String                                                     │
│  day              Date                                                       │
│  messages_sum     UInt64                                                     │
│  bytes_sum        UInt64                                                     │
│  avg_rate         AggregateFunction(avg, Float64)                           │
│  max_rate         AggregateFunction(max, Float64)                           │
│  sample_count     UInt64                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Redis Data Structures

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REDIS DATA STRUCTURES                              │
└─────────────────────────────────────────────────────────────────────────────┘

SESSION MANAGEMENT
──────────────────
Key Pattern: session:{session_id}
Type: Hash
TTL: 24 hours (configurable)
Fields:
  - user_id
  - org_id
  - email
  - roles (JSON array)
  - permissions (JSON array)
  - ip_address
  - created_at
  - last_activity

RATE LIMITING
─────────────
Key Pattern: ratelimit:{user_id}:{endpoint}
Type: String (counter)
TTL: 60 seconds (sliding window)

API KEY CACHE
─────────────
Key Pattern: apikey:{key_prefix}
Type: Hash
TTL: 5 minutes
Fields:
  - org_id
  - user_id
  - permissions (JSON)
  - rate_limit

CLUSTER STATUS CACHE
────────────────────
Key Pattern: cluster:{cluster_id}:status
Type: Hash
TTL: 30 seconds
Fields:
  - status (connected/disconnected/degraded)
  - server_count
  - version
  - last_check

STREAM LIST CACHE
─────────────────
Key Pattern: cluster:{cluster_id}:streams
Type: String (JSON array)
TTL: 60 seconds

REAL-TIME METRICS (Pub/Sub)
───────────────────────────
Channel: metrics:{cluster_id}:{stream_name}
Message: JSON payload with current metrics

USER PERMISSIONS CACHE
──────────────────────
Key Pattern: permissions:{user_id}:{org_id}
Type: Set
TTL: 5 minutes
Members: permission strings (e.g., "streams:read", "consumers:write")

ACTIVE USERS TRACKING
─────────────────────
Key Pattern: active_users:{org_id}
Type: Sorted Set
Score: Unix timestamp of last activity
Member: user_id

NOTIFICATION QUEUE
──────────────────
Key Pattern: notifications:{user_id}
Type: List
Elements: JSON notification objects
```

---

## 3. API Design

### 3.1 REST API Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            API ENDPOINTS                                     │
│                          Base: /api/v1                                       │
└─────────────────────────────────────────────────────────────────────────────┘

AUTHENTICATION
──────────────
POST   /auth/login                    Email/password login
POST   /auth/logout                   Invalidate session
POST   /auth/refresh                  Refresh access token
POST   /auth/register                 User registration
POST   /auth/forgot-password          Request password reset
POST   /auth/reset-password           Complete password reset
POST   /auth/verify-email             Verify email address
GET    /auth/me                       Get current user
POST   /auth/mfa/enable               Enable MFA
POST   /auth/mfa/verify               Verify MFA code
DELETE /auth/mfa/disable              Disable MFA

OAUTH/SSO
─────────
GET    /auth/oauth/{provider}         Initiate OAuth flow (google, github, okta)
GET    /auth/oauth/{provider}/callback OAuth callback
POST   /auth/saml/login               SAML login initiation
POST   /auth/saml/acs                 SAML assertion consumer service

USERS
─────
GET    /users                         List users (org scoped)
GET    /users/{id}                    Get user details
PATCH  /users/{id}                    Update user
DELETE /users/{id}                    Delete/deactivate user
POST   /users/invite                  Invite user to org
GET    /users/{id}/activity           Get user activity log

ORGANIZATIONS
─────────────
GET    /organizations                 List user's organizations
POST   /organizations                 Create organization
GET    /organizations/{id}            Get organization details
PATCH  /organizations/{id}            Update organization
DELETE /organizations/{id}            Delete organization
GET    /organizations/{id}/members    List members
POST   /organizations/{id}/members    Add member
DELETE /organizations/{id}/members/{uid} Remove member

TEAMS
─────
GET    /teams                         List teams
POST   /teams                         Create team
GET    /teams/{id}                    Get team
PATCH  /teams/{id}                    Update team
DELETE /teams/{id}                    Delete team
GET    /teams/{id}/members            List team members
POST   /teams/{id}/members            Add team member
DELETE /teams/{id}/members/{uid}      Remove team member

CLUSTERS
────────
GET    /clusters                      List NATS clusters
POST   /clusters                      Add cluster connection
GET    /clusters/{id}                 Get cluster details
PATCH  /clusters/{id}                 Update cluster config
DELETE /clusters/{id}                 Remove cluster
GET    /clusters/{id}/health          Health check
GET    /clusters/{id}/servers         List servers in cluster
GET    /clusters/{id}/info            Detailed cluster info

STREAMS
───────
GET    /clusters/{cid}/streams                    List streams
POST   /clusters/{cid}/streams                    Create stream
GET    /clusters/{cid}/streams/{name}             Get stream details
PATCH  /clusters/{cid}/streams/{name}             Update stream config
DELETE /clusters/{cid}/streams/{name}             Delete stream
GET    /clusters/{cid}/streams/{name}/info        Stream info/stats
POST   /clusters/{cid}/streams/{name}/purge       Purge messages
GET    /clusters/{cid}/streams/{name}/messages    Browse messages
POST   /clusters/{cid}/streams/{name}/messages    Publish message
DELETE /clusters/{cid}/streams/{name}/messages/{seq} Delete message

CONSUMERS
─────────
GET    /clusters/{cid}/streams/{sid}/consumers              List consumers
POST   /clusters/{cid}/streams/{sid}/consumers              Create consumer
GET    /clusters/{cid}/streams/{sid}/consumers/{name}       Get consumer
PATCH  /clusters/{cid}/streams/{sid}/consumers/{name}       Update consumer
DELETE /clusters/{cid}/streams/{sid}/consumers/{name}       Delete consumer
GET    /clusters/{cid}/streams/{sid}/consumers/{name}/info  Consumer stats
POST   /clusters/{cid}/streams/{sid}/consumers/{name}/pause Pause consumer

KV STORES
─────────
GET    /clusters/{cid}/kv                         List KV buckets
POST   /clusters/{cid}/kv                         Create KV bucket
GET    /clusters/{cid}/kv/{bucket}                Get bucket info
DELETE /clusters/{cid}/kv/{bucket}                Delete bucket
GET    /clusters/{cid}/kv/{bucket}/keys           List keys
GET    /clusters/{cid}/kv/{bucket}/keys/{key}     Get value
PUT    /clusters/{cid}/kv/{bucket}/keys/{key}     Set value
DELETE /clusters/{cid}/kv/{bucket}/keys/{key}     Delete key
GET    /clusters/{cid}/kv/{bucket}/keys/{key}/history  Key history

OBJECT STORES
─────────────
GET    /clusters/{cid}/objects                    List object stores
POST   /clusters/{cid}/objects                    Create object store
GET    /clusters/{cid}/objects/{store}            Get store info
DELETE /clusters/{cid}/objects/{store}            Delete store
GET    /clusters/{cid}/objects/{store}/files      List files
GET    /clusters/{cid}/objects/{store}/files/{name}   Download file
PUT    /clusters/{cid}/objects/{store}/files/{name}   Upload file
DELETE /clusters/{cid}/objects/{store}/files/{name}   Delete file

ANALYTICS
─────────
GET    /analytics/metrics                         Query metrics
GET    /analytics/streams/{name}/throughput       Stream throughput
GET    /analytics/streams/{name}/latency          Consumer latency
GET    /analytics/consumers/{name}/lag            Consumer lag
GET    /analytics/cluster/overview                Cluster overview stats
POST   /analytics/query                           Custom ClickHouse query

DASHBOARDS
──────────
GET    /dashboards                    List dashboards
POST   /dashboards                    Create dashboard
GET    /dashboards/{id}               Get dashboard
PATCH  /dashboards/{id}               Update dashboard
DELETE /dashboards/{id}               Delete dashboard
POST   /dashboards/{id}/clone         Clone dashboard

ALERTS
──────
GET    /alerts/rules                  List alert rules
POST   /alerts/rules                  Create alert rule
GET    /alerts/rules/{id}             Get alert rule
PATCH  /alerts/rules/{id}             Update alert rule
DELETE /alerts/rules/{id}             Delete alert rule
GET    /alerts/events                 List alert events
POST   /alerts/test                   Test alert rule

AUDIT
─────
GET    /audit/logs                    Query audit logs
GET    /audit/logs/export             Export audit logs (CSV/JSON)

API KEYS
────────
GET    /api-keys                      List API keys
POST   /api-keys                      Create API key
GET    /api-keys/{id}                 Get API key details
DELETE /api-keys/{id}                 Revoke API key
POST   /api-keys/{id}/rotate          Rotate API key

ROLES & PERMISSIONS
───────────────────
GET    /roles                         List roles
POST   /roles                         Create custom role
GET    /roles/{id}                    Get role
PATCH  /roles/{id}                    Update role
DELETE /roles/{id}                    Delete role
GET    /permissions                   List all permissions
```

### 3.2 WebSocket API

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WEBSOCKET CHANNELS                                  │
│                       Endpoint: /ws/v1/realtime                              │
└─────────────────────────────────────────────────────────────────────────────┘

CONNECTION
──────────
{
  "type": "auth",
  "token": "jwt_token_here"
}

SUBSCRIBE TO CHANNELS
─────────────────────
{
  "type": "subscribe",
  "channels": [
    "cluster:{cluster_id}:status",
    "stream:{cluster_id}:{stream_name}:metrics",
    "consumer:{cluster_id}:{stream_name}:{consumer_name}:metrics",
    "alerts:{org_id}"
  ]
}

UNSUBSCRIBE
───────────
{
  "type": "unsubscribe",
  "channels": ["stream:{cluster_id}:{stream_name}:metrics"]
}

MESSAGE TYPES (Server → Client)
───────────────────────────────

// Cluster Status Update
{
  "type": "cluster_status",
  "cluster_id": "uuid",
  "data": {
    "status": "connected",
    "servers": [...],
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Stream Metrics
{
  "type": "stream_metrics",
  "cluster_id": "uuid",
  "stream_name": "ORDERS",
  "data": {
    "messages": 1523456,
    "bytes": 234567890,
    "rate": 1250.5,
    "consumers": 5,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Consumer Metrics
{
  "type": "consumer_metrics",
  "cluster_id": "uuid",
  "stream_name": "ORDERS",
  "consumer_name": "processor",
  "data": {
    "pending": 150,
    "lag": 2500,
    "ack_rate": 980.2,
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Alert Notification
{
  "type": "alert",
  "data": {
    "id": "uuid",
    "rule_id": "uuid",
    "severity": "critical",
    "message": "Consumer lag exceeded threshold",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Message Preview (for message browser)
{
  "type": "new_message",
  "cluster_id": "uuid",
  "stream_name": "ORDERS",
  "data": {
    "sequence": 1523456,
    "subject": "orders.created",
    "timestamp": "2024-01-15T10:30:00Z",
    "preview": "..."
  }
}
```

---

## 4. UI/UX Design

### 4.1 Application Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌─────┐  NATS Console        [Search...]          [?] [@] [Bell] [Avatar▼]│
│  │Logo │  Acme Corp ▼                                                       │
├──┴─────┴────────────────────────────────────────────────────────────────────┤
│  │                                                                          │
│  │  [🏠] Overview                                                           │
│  │                                                                          │
│  │  [📊] Clusters                     ┌────────────────────────────────────┐│
│  │      └─ Production                 │                                    ││
│  │      └─ Staging                    │         MAIN CONTENT AREA          ││
│  │      └─ Development                │                                    ││
│  │                                    │    (Dynamic based on selection)    ││
│  │  [📦] Streams                      │                                    ││
│  │                                    │                                    ││
│  │  [👥] Consumers                    │                                    ││
│  │                                    │                                    ││
│  │  [🔑] KV Stores                    │                                    ││
│  │                                    │                                    ││
│  │  [📁] Object Stores                │                                    ││
│  │                                    │                                    ││
│  │  [📈] Analytics                    │                                    ││
│  │      └─ Dashboards                 │                                    ││
│  │      └─ Metrics                    │                                    ││
│  │                                    │                                    ││
│  │  [🔔] Alerts                       │                                    ││
│  │                                    │                                    ││
│  │  ─────────────                     │                                    ││
│  │                                    │                                    ││
│  │  [⚙️] Settings                     │                                    ││
│  │      └─ Organization               │                                    ││
│  │      └─ Users & Teams              │                                    ││
│  │      └─ API Keys                   │                                    ││
│  │      └─ Audit Logs                 │                                    ││
│  │                                    └────────────────────────────────────┘│
│  │                                                                          │
└──┴──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Key Screen Designs

#### Dashboard / Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Overview                                              [Last 24h ▼] [↻]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  3 Clusters  │  │  24 Streams  │  │ 89 Consumers │  │  2 Alerts    │    │
│  │  ● 3 Healthy │  │  ↑ 2.1M/sec  │  │  ↑ 1.8M/sec  │  │  ⚠ 2 Warning │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Message Throughput                                                    │ │
│  │                                                                        │ │
│  │  2.5M ┤                                    ╭─────╮                     │ │
│  │       │                              ╭─────╯     │                     │ │
│  │  2.0M ┤                        ╭─────╯           │                     │ │
│  │       │                  ╭─────╯                 ╰─────╮               │ │
│  │  1.5M ┤            ╭─────╯                             ╰─────╮         │ │
│  │       │      ╭─────╯                                         ╰───     │ │
│  │  1.0M ┼──────╯                                                         │ │
│  │       └────────────────────────────────────────────────────────────── │ │
│  │         00:00    04:00    08:00    12:00    16:00    20:00    Now     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │  Top Streams by Volume          │  │  Consumer Lag                    │  │
│  │  ─────────────────────────────  │  │  ─────────────────────────────   │  │
│  │  ORDERS          ████████ 45%   │  │  order-processor    ⚠ 12,500    │  │
│  │  EVENTS          █████░░░ 28%   │  │  notification-svc   ● 234       │  │
│  │  NOTIFICATIONS   ███░░░░░ 15%   │  │  analytics-worker   ● 45        │  │
│  │  AUDIT           ██░░░░░░ 8%    │  │  audit-logger       ● 12        │  │
│  │  Other           █░░░░░░░ 4%    │  │  backup-sync        ● 0         │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                             │
│  Recent Activity                                                            │
│  ───────────────────────────────────────────────────────────────────────   │
│  ● 10:45  Stream ORDERS config updated by john@acme.com                    │
│  ● 10:32  Consumer order-processor created by jane@acme.com                │
│  ⚠ 10:15  Alert: Consumer lag threshold exceeded on order-processor        │
│  ● 09:58  New cluster connection added: production-east                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Streams List

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Streams                                      [+ Create Stream]             │
│  Production Cluster                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Search streams...]                    Filters: [All ▼] [Tags ▼]          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ □  Name          │ Subjects     │ Messages   │ Storage │ Consumers │ ⋮ ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ □  ORDERS        │ orders.>     │ 15.2M      │ 2.3 GB  │ 5         │ ⋮ ││
│  │    ● Healthy     │              │ ↑ 1,250/s  │         │           │   ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ □  EVENTS        │ events.>     │ 89.5M      │ 12.1 GB │ 12        │ ⋮ ││
│  │    ● Healthy     │              │ ↑ 3,420/s  │         │           │   ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ □  NOTIFICATIONS │ notify.*     │ 5.8M       │ 890 MB  │ 3         │ ⋮ ││
│  │    ● Healthy     │              │ ↑ 520/s    │         │           │   ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ □  AUDIT         │ audit.>      │ 234.2M     │ 45.2 GB │ 2         │ ⋮ ││
│  │    ⚠ High Volume │              │ ↑ 8,100/s  │         │           │   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  Showing 4 of 24 streams                           [◀ 1 2 3 4 5 ▶]         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Stream Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Streams / ORDERS                      [Edit] [Purge] [Delete] [⋮]        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Overview]  [Messages]  [Consumers]  [Configuration]  [Metrics]            │
│  ──────────────────────────────────────────────────────────────────────     │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Stream Health                                        ● Healthy       │  │
│  │                                                                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │  │
│  │  │ Messages   │  │ Storage    │  │ Consumers  │  │ Throughput │      │  │
│  │  │ 15,234,567 │  │ 2.34 GB    │  │ 5 active   │  │ 1,250/sec  │      │  │
│  │  │ ↑ 12.5%    │  │ ↑ 234 MB   │  │            │  │ ↑ 8.2%     │      │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Message Rate (Last 6 hours)                              [Export]    │  │
│  │                                                                       │  │
│  │  1.5K ┤          ╭────╮                      ╭────────╮               │  │
│  │       │     ╭────╯    ╰──────╮         ╭────╯        ╰───╮           │  │
│  │  1.0K ┼─────╯                 ╰─────────╯                 ╰────       │  │
│  │       │                                                               │  │
│  │  500  ┤                                                               │  │
│  │       └──────────────────────────────────────────────────────────    │  │
│  │        06:00     08:00     10:00     12:00     14:00     Now         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Configuration Summary                                                      │
│  ───────────────────────────────────────────────────────────────────────   │
│  Subjects        orders.>                                                   │
│  Retention       Limits (Max Messages: 10M, Max Bytes: 10GB)               │
│  Storage         File                                                       │
│  Replicas        3                                                          │
│  Discard         Old                                                        │
│  Max Age         7 days                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Message Browser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← ORDERS / Messages                                     [Publish Message]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Subject Filter: [orders.>              ]  From: [Sequence ▼] [_________]  │
│  [🔴 Live]  [Parse as: JSON ▼]                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Seq       │ Subject         │ Time           │ Size   │ Headers │      ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ 15234567  │ orders.created  │ 10:45:23.456   │ 1.2 KB │ 3       │  ▶   ││
│  │ 15234566  │ orders.updated  │ 10:45:23.234   │ 890 B  │ 2       │  ▶   ││
│  │ 15234565  │ orders.created  │ 10:45:22.987   │ 1.1 KB │ 3       │  ▶   ││
│  │ 15234564  │ orders.shipped  │ 10:45:22.654   │ 2.3 KB │ 4       │  ▶   ││
│  │ 15234563  │ orders.created  │ 10:45:22.123   │ 1.2 KB │ 3       │  ▶   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Message #15234567                                       [Copy] [Delete]││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Subject: orders.created                                                ││
│  │  Time: 2024-01-15T10:45:23.456Z                                         ││
│  │  Sequence: 15234567                                                     ││
│  │                                                                         ││
│  │  Headers:                                                               ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │ Content-Type: application/json                                   │   ││
│  │  │ X-Correlation-ID: abc-123-def                                    │   ││
│  │  │ X-Source: order-service                                          │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  │                                                                         ││
│  │  Payload:                                                               ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │ {                                                                │   ││
│  │  │   "order_id": "ORD-2024-78945",                                  │   ││
│  │  │   "customer_id": "CUST-12345",                                   │   ││
│  │  │   "items": [                                                     │   ││
│  │  │     { "sku": "PROD-001", "qty": 2, "price": 29.99 },            │   ││
│  │  │     { "sku": "PROD-042", "qty": 1, "price": 149.99 }            │   ││
│  │  │   ],                                                             │   ││
│  │  │   "total": 209.97,                                               │   ││
│  │  │   "created_at": "2024-01-15T10:45:23.456Z"                       │   ││
│  │  │ }                                                                │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Consumer Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← ORDERS / Consumers / order-processor             [Edit] [Pause] [Delete]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Overview]  [Pending Messages]  [Configuration]  [Metrics]                 │
│  ──────────────────────────────────────────────────────────────────────     │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Consumer Health                                      ● Active        │  │
│  │                                                                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐      │  │
│  │  │ Pending    │  │ Ack Pending│  │ Lag        │  │ Redeliver  │      │  │
│  │  │ 1,234      │  │ 45         │  │ 12,500     │  │ 23         │      │  │
│  │  │ ● Normal   │  │ ● Normal   │  │ ⚠ Warning  │  │ ● Normal   │      │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │  Processing Rate                 │  │  Consumer Lag                    │  │
│  │                                  │  │                                  │  │
│  │  1.2K ┤    ╭───╮       ╭────    │  │  15K ┤╭─╮                        │  │
│  │       │╭───╯   ╰───╮╭──╯        │  │      ││ ╰╮                       │  │
│  │  800  ┼╯           ╰╯           │  │  10K ┼╯  ╰╮                      │  │
│  │       │                         │  │      │    ╰──╮                   │  │
│  │  400  ┤                         │  │  5K  ┤       ╰────────────       │  │
│  │       └─────────────────────── │  │      └────────────────────────   │  │
│  │        -6h    -4h    -2h   Now  │  │       -6h    -4h    -2h    Now   │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                             │
│  Configuration                                                              │
│  ───────────────────────────────────────────────────────────────────────   │
│  Durable Name      order-processor                                          │
│  Deliver Policy    All                                                      │
│  Ack Policy        Explicit                                                 │
│  Ack Wait          30s                                                      │
│  Max Deliver       5                                                        │
│  Filter Subject    orders.>                                                 │
│  Max Ack Pending   1000                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### User Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Settings / Users & Teams                                 [+ Invite User]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Users]  [Teams]  [Roles]                                                  │
│  ──────────────────────────────────────────────────────────────────────     │
│                                                                             │
│  [Search users...]                                                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │     │ User              │ Email                │ Role     │ Status │ ⋮ ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ [A] │ John Smith        │ john@acme.com        │ Admin    │ Active │ ⋮ ││
│  │     │ Last login: 2 hrs ago                                         │   ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ [J] │ Jane Doe          │ jane@acme.com        │ Editor   │ Active │ ⋮ ││
│  │     │ Last login: 1 day ago                                         │   ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ [B] │ Bob Wilson        │ bob@acme.com         │ Viewer   │ Active │ ⋮ ││
│  │     │ Last login: 3 days ago                                        │   ││
│  ├───────────────────────────────────────────────────────────────────────┤│
│  │ [?] │ alice@acme.com    │ alice@acme.com       │ Editor   │ Pending│ ⋮ ││
│  │     │ Invitation sent: 2 hrs ago                                    │   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Role Permissions Matrix                                   [+ New Role] ││
│  │  ───────────────────────────────────────────────────────────────────── ││
│  │                        │ Admin │ Editor │ Viewer │ Operator │          ││
│  │  ──────────────────────┼───────┼────────┼────────┼──────────┤          ││
│  │  Streams: View         │   ●   │   ●    │   ●    │    ●     │          ││
│  │  Streams: Create       │   ●   │   ●    │   ○    │    ○     │          ││
│  │  Streams: Edit         │   ●   │   ●    │   ○    │    ○     │          ││
│  │  Streams: Delete       │   ●   │   ○    │   ○    │    ○     │          ││
│  │  Messages: Browse      │   ●   │   ●    │   ●    │    ●     │          ││
│  │  Messages: Publish     │   ●   │   ●    │   ○    │    ●     │          ││
│  │  Consumers: Manage     │   ●   │   ●    │   ○    │    ●     │          ││
│  │  Users: Manage         │   ●   │   ○    │   ○    │    ○     │          ││
│  │  Settings: Access      │   ●   │   ○    │   ○    │    ○     │          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Authentication & Authorization

### 5.1 Authentication Flows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

EMAIL/PASSWORD FLOW
───────────────────
┌──────────┐     1. Login Request      ┌──────────────┐
│          │ ──────────────────────►   │              │
│  Client  │                           │  Auth        │
│          │ ◄──────────────────────   │  Service     │
└──────────┘  2. JWT + Refresh Token   └──────────────┘
      │                                        │
      │  3. API Request + JWT                  │ Verify credentials
      ▼                                        ▼
┌──────────────┐                        ┌──────────────┐
│  API Gateway │ ─────────────────────► │  PostgreSQL  │
│  (Validate)  │                        │  (Users)     │
└──────────────┘                        └──────────────┘

OAUTH/OIDC FLOW
───────────────
┌──────────┐  1. Initiate   ┌──────────────┐  2. Redirect  ┌──────────────┐
│  Client  │ ─────────────► │  Auth        │ ────────────► │  OAuth       │
│          │                │  Service     │               │  Provider    │
│          │ ◄───────────── │              │ ◄──────────── │  (Google,    │
└──────────┘  5. JWT Token  └──────────────┘  4. Auth Code │  GitHub,etc) │
                                   │                       └──────────────┘
                                   │ 3. Exchange code
                                   ▼
                            ┌──────────────┐
                            │  Create/Link │
                            │  User Account│
                            └──────────────┘

MFA FLOW
────────
┌──────────┐  1. Login      ┌──────────────┐
│          │ ─────────────► │              │
│  Client  │                │  Auth        │
│          │ ◄───────────── │  Service     │
│          │  2. MFA Required│             │
│          │                 │             │
│          │ ─────────────► │             │
│          │  3. TOTP Code  │             │
│          │ ◄───────────── │             │
└──────────┘  4. JWT Token  └──────────────┘

TOKEN STRUCTURE
───────────────
Access Token (JWT, 15 min expiry):
{
  "sub": "user_uuid",
  "org": "org_uuid",
  "email": "user@example.com",
  "roles": ["admin"],
  "permissions": ["streams:*", "consumers:*"],
  "iat": 1705312800,
  "exp": 1705313700
}

Refresh Token (Opaque, 7 day expiry):
- Stored in Redis with user metadata
- Single use, rotated on each refresh
- Tied to device/session
```

### 5.2 Authorization Model (RBAC)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RBAC PERMISSION MODEL                                │
└─────────────────────────────────────────────────────────────────────────────┘

PERMISSION STRUCTURE
────────────────────
Format: {resource}:{action}:{scope}

Resources:
- clusters
- streams
- consumers
- kv_stores
- object_stores
- messages
- users
- teams
- roles
- api_keys
- alerts
- dashboards
- audit_logs

Actions:
- read
- create
- update
- delete
- publish (messages)
- purge (streams)
- pause (consumers)
- manage (full control)

Scopes:
- * (all)
- own (user's own resources)
- team:{team_id} (team resources)
- cluster:{cluster_id} (specific cluster)

BUILT-IN ROLES
──────────────
┌─────────────────────────────────────────────────────────────────────────────┐
│  Role: Admin                                                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Permissions: *:*:*  (Full access to everything)                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Role: Editor                                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Permissions:                                                                │
│  - clusters:read:*                                                           │
│  - streams:read,create,update:*                                              │
│  - consumers:read,create,update,delete:*                                     │
│  - messages:read,publish:*                                                   │
│  - kv_stores:read,create,update:*                                            │
│  - object_stores:read,create,update:*                                        │
│  - dashboards:*:own                                                          │
│  - alerts:read,create,update:*                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Role: Viewer                                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Permissions:                                                                │
│  - clusters:read:*                                                           │
│  - streams:read:*                                                            │
│  - consumers:read:*                                                          │
│  - messages:read:*                                                           │
│  - kv_stores:read:*                                                          │
│  - object_stores:read:*                                                      │
│  - dashboards:read:*                                                         │
│  - alerts:read:*                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Role: Operator                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Permissions:                                                                │
│  - clusters:read:*                                                           │
│  - streams:read:*                                                            │
│  - consumers:read,pause:*                                                    │
│  - messages:read,publish:*                                                   │
│  - kv_stores:read,update:*                                                   │
│  - object_stores:read:*                                                      │
│  - alerts:read:*                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

AUTHORIZATION CHECK FLOW
────────────────────────
┌──────────┐     Request      ┌──────────────┐     Check     ┌──────────────┐
│          │ ───────────────► │              │ ────────────► │              │
│  Client  │                  │  API Gateway │               │  Permission  │
│          │                  │              │ ◄──────────── │  Service     │
│          │ ◄─────────────── │              │    Allow/Deny │              │
└──────────┘   Response       └──────────────┘               └──────────────┘
                                     │                              │
                              Extract JWT                     ┌─────┴─────┐
                              Get permissions                 │           │
                                                              ▼           ▼
                                                        ┌────────┐  ┌────────┐
                                                        │ Redis  │  │ Postgres│
                                                        │ Cache  │  │ (Roles)│
                                                        └────────┘  └────────┘
```

---

## 6. Technology Stack

### 6.1 Frontend Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND TECHNOLOGY STACK                           │
└─────────────────────────────────────────────────────────────────────────────┘

CORE FRAMEWORK
──────────────
Next.js 14+          App Router, Server Components, Server Actions
React 18+            Concurrent features, Suspense
TypeScript 5+        Strict mode enabled

STATE MANAGEMENT
────────────────
Zustand              Global client state
TanStack Query       Server state, caching, mutations
React Hook Form      Form state management
Zod                  Schema validation

UI COMPONENTS
─────────────
shadcn/ui            Base component library
Radix UI             Accessible primitives
Tailwind CSS         Utility-first styling
Lucide Icons         Icon library
Recharts             Charts and graphs
React Table          Data tables
Monaco Editor        Code/JSON editing
cmdk                 Command palette

REAL-TIME
─────────
Socket.io Client     WebSocket connections
React use            Optimistic updates

DEVELOPER EXPERIENCE
────────────────────
ESLint               Linting
Prettier             Code formatting
Vitest               Unit testing
Playwright           E2E testing
Storybook            Component documentation
```

### 6.2 Backend Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND TECHNOLOGY STACK                            │
└─────────────────────────────────────────────────────────────────────────────┘

RUNTIME & FRAMEWORK
───────────────────
Node.js 20 LTS       Runtime
Fastify              HTTP framework (faster than Express)
tRPC                 End-to-end type safety (optional, with REST)
TypeScript 5+        Strict mode

DATABASE CLIENTS
────────────────
Drizzle ORM          PostgreSQL (type-safe, lightweight)
@clickhouse/client   ClickHouse analytics
ioredis              Redis client
nats.js              NATS JetStream client

AUTHENTICATION
──────────────
jose                 JWT handling
passport             OAuth strategies
speakeasy            TOTP/MFA
argon2               Password hashing

BACKGROUND JOBS
───────────────
BullMQ               Job queues (Redis-backed)
node-cron            Scheduled tasks

OBSERVABILITY
─────────────
Pino                 Structured logging
OpenTelemetry        Distributed tracing
Prometheus client    Metrics export

VALIDATION
──────────
Zod                  Schema validation
class-validator      DTO validation (alternative)

TESTING
───────
Vitest               Unit tests
Supertest            API tests
Testcontainers       Integration tests
```

### 6.3 Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INFRASTRUCTURE COMPONENTS                            │
└─────────────────────────────────────────────────────────────────────────────┘

DATABASES
─────────
PostgreSQL 16        Primary application database
ClickHouse           Time-series analytics
Redis 7              Caching, sessions, pub/sub

NATS
────
NATS Server          Core messaging
JetStream            Persistence layer

DEPLOYMENT
──────────
Docker               Containerization
Kubernetes           Orchestration (production)
Docker Compose       Local development

REVERSE PROXY
─────────────
Nginx                Load balancing, SSL termination
Caddy                Alternative (auto SSL)

MONITORING
──────────
Prometheus           Metrics collection
Grafana              Dashboards
Jaeger               Distributed tracing

CI/CD
─────
GitHub Actions       Primary CI/CD
ArgoCD               GitOps deployment (K8s)
```

---

## 7. Security Considerations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SECURITY ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

AUTHENTICATION SECURITY
───────────────────────
• JWT with short expiry (15 min) + rotating refresh tokens
• Secure HttpOnly cookies for token storage
• MFA support (TOTP, WebAuthn future)
• Rate limiting on auth endpoints
• Account lockout after failed attempts
• Session management with device tracking

DATA SECURITY
─────────────
• Encryption at rest (database level)
• TLS 1.3 for all connections
• Sensitive fields encrypted at application level
• NATS credentials stored encrypted (AES-256-GCM)
• API keys hashed (Argon2) with prefix visible
• Audit logging for all sensitive operations

API SECURITY
────────────
• CORS configuration
• Rate limiting per user/API key
• Request validation (Zod schemas)
• SQL injection prevention (parameterized queries)
• XSS prevention (Content Security Policy)
• CSRF tokens for state-changing operations

INFRASTRUCTURE SECURITY
───────────────────────
• Network segmentation (internal services not exposed)
• Secrets management (Vault/Kubernetes secrets)
• Container security scanning
• Regular dependency updates
• Security headers (HSTS, X-Frame-Options, etc.)

COMPLIANCE READY
────────────────
• Full audit trail in ClickHouse
• Data retention policies
• User consent management
• GDPR-compliant data export/deletion
• SOC 2 Type II alignment
```

---

## 8. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PRODUCTION DEPLOYMENT (KUBERNETES)                       │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   CloudFlare    │
                              │   (CDN + WAF)   │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │   Ingress       │
                              │   Controller    │
                              └────────┬────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Frontend      │         │   API Service   │         │   Workers       │
│   (Next.js)     │         │   (Fastify)     │         │   (BullMQ)      │
│   ────────────  │         │   ────────────  │         │   ────────────  │
│   Replicas: 3   │         │   Replicas: 5   │         │   Replicas: 3   │
│   CPU: 500m     │         │   CPU: 1000m    │         │   CPU: 500m     │
│   Mem: 512Mi    │         │   Mem: 1Gi      │         │   Mem: 512Mi    │
└─────────────────┘         └─────────────────┘         └─────────────────┘
          │                            │                            │
          └────────────────────────────┼────────────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   PostgreSQL    │         │   ClickHouse    │         │   Redis         │
│   (HA Cluster)  │         │   (Cluster)     │         │   (Sentinel)    │
│   ────────────  │         │   ────────────  │         │   ────────────  │
│   3 nodes       │         │   3 shards      │         │   3 nodes       │
│   Patroni       │         │   2 replicas    │         │   Sentinel      │
└─────────────────┘         └─────────────────┘         └─────────────────┘

NAMESPACE ORGANIZATION
──────────────────────
• nats-console-prod     Production workloads
• nats-console-staging  Staging environment
• nats-console-infra    Shared infrastructure (DBs)
• nats-console-monitor  Monitoring stack

HORIZONTAL POD AUTOSCALER
─────────────────────────
API Service:
  - Min: 3, Max: 20
  - CPU target: 70%
  - Custom metric: requests/sec

Workers:
  - Min: 2, Max: 10
  - Custom metric: queue depth

PERSISTENT VOLUMES
──────────────────
PostgreSQL:   100Gi SSD (each node)
ClickHouse:   500Gi SSD (each shard)
Redis:        20Gi SSD (persistence)
```

---

## 9. Feature Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FEATURE ROADMAP                                   │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: MVP (Months 1-3)
─────────────────────────
✓ Core authentication (email/password, OAuth)
✓ Basic RBAC (Admin, Editor, Viewer)
✓ Cluster connection management
✓ Stream CRUD operations
✓ Consumer CRUD operations
✓ Basic message browser
✓ Real-time metrics dashboard
✓ PostgreSQL + Redis setup

PHASE 2: Analytics & Monitoring (Months 4-5)
────────────────────────────────────────────
○ ClickHouse integration
○ Historical metrics storage
○ Custom dashboards builder
○ Alert rules engine
○ Webhook notifications
○ Consumer lag tracking
○ Throughput analytics

PHASE 3: Enterprise Features (Months 6-8)
─────────────────────────────────────────
○ SSO/SAML integration
○ Advanced RBAC (custom roles)
○ Team management
○ Audit logging
○ Multi-cluster management
○ KV Store browser
○ Object Store browser
○ Schema registry integration

PHASE 4: Advanced Capabilities (Months 9-12)
────────────────────────────────────────────
○ Message replay functionality
○ Dead letter queue management
○ Stream mirroring configuration
○ Partition/subject analytics
○ Cost analysis dashboard
○ API key management
○ Terraform provider
○ CLI tool

PHASE 5: Polish & Scale (Months 12+)
────────────────────────────────────
○ Mobile app
○ Dark mode
○ Internationalization
○ Plugin system
○ Marketplace
○ White-label support
```

---

## 10. Project Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PROJECT STRUCTURE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

nats-console/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   ├── app/                      # App router pages
│   │   │   ├── (auth)/               # Auth pages (login, register)
│   │   │   ├── (dashboard)/          # Main dashboard pages
│   │   │   │   ├── clusters/
│   │   │   │   ├── streams/
│   │   │   │   ├── consumers/
│   │   │   │   ├── analytics/
│   │   │   │   └── settings/
│   │   │   ├── api/                  # API routes (if needed)
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn components
│   │   │   ├── clusters/
│   │   │   ├── streams/
│   │   │   ├── consumers/
│   │   │   ├── charts/
│   │   │   └── common/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── stores/                   # Zustand stores
│   │   └── styles/
│   │
│   └── api/                          # Fastify backend
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── users/
│       │   │   ├── organizations/
│       │   │   ├── clusters/
│       │   │   ├── streams/
│       │   │   ├── consumers/
│       │   │   ├── analytics/
│       │   │   └── alerts/
│       │   ├── common/
│       │   │   ├── middleware/
│       │   │   ├── guards/
│       │   │   ├── decorators/
│       │   │   └── utils/
│       │   ├── database/
│       │   │   ├── postgres/
│       │   │   ├── clickhouse/
│       │   │   └── redis/
│       │   ├── nats/                 # NATS client wrapper
│       │   ├── workers/              # Background jobs
│       │   └── websocket/            # Real-time handlers
│       └── tests/
│
├── packages/
│   ├── shared/                       # Shared types, utils
│   │   ├── types/
│   │   ├── schemas/                  # Zod schemas
│   │   └── utils/
│   ├── ui/                           # Shared UI components
│   └── config/                       # Shared configs
│
├── infrastructure/
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.api
│   │   └── docker-compose.yml
│   ├── kubernetes/
│   │   ├── base/
│   │   ├── overlays/
│   │   │   ├── development/
│   │   │   ├── staging/
│   │   │   └── production/
│   │   └── kustomization.yaml
│   └── terraform/
│       ├── modules/
│       └── environments/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   └── deployment/
│
├── scripts/
│   ├── setup.sh
│   ├── migrate.sh
│   └── seed.sh
│
├── turbo.json                        # Turborepo config
├── pnpm-workspace.yaml
└── README.md
```

---

This design provides a comprehensive foundation for building a modern NATS JetStream management console. The architecture is scalable, the database schemas are optimized for their specific use cases (PostgreSQL for transactional data, ClickHouse for analytics, Redis for caching/real-time), and the UI follows patterns established by industry leaders like Redpanda and Confluent.
