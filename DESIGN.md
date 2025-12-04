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
│                  │ (JetStream)  │              │  JetStream   │ │
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
NATS JetStream       Job queues (internal streams)
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
│   (Next.js)     │         │   (Fastify)     │         │  (JetStream)    │
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


----


# NATS JetStream Console - Advanced Capabilities Design Document

## Table of Contents
1. [Advanced Stream Management](#1-advanced-stream-management)
2. [Consumer Management & Orchestration](#2-consumer-management--orchestration)
3. [Message Workflows & Pipelines](#3-message-workflows--pipelines)
4. [Schema Registry & Data Governance](#4-schema-registry--data-governance)
5. [Stream Processing & Transforms](#5-stream-processing--transforms)
6. [AI-Powered Features](#6-ai-powered-features)
7. [Self-Service Portal & Quotas](#7-self-service-portal--quotas)
8. [GitOps & Infrastructure as Code](#8-gitops--infrastructure-as-code)
9. [Advanced Observability](#9-advanced-observability)
10. [Data Lineage & Catalog](#10-data-lineage--catalog)
11. [Disaster Recovery & Replication](#11-disaster-recovery--replication)
12. [Developer Experience](#12-developer-experience)

---

## 1. Advanced Stream Management

### 1.1 Stream Lifecycle Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STREAM LIFECYCLE STATE MACHINE                            │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────┐
                         │   DRAFT     │◄──────── Save as Draft
                         │  (Pending)  │
                         └──────┬──────┘
                                │
                         Validate & Create
                                │
                                ▼
┌──────────────┐        ┌─────────────┐        ┌──────────────┐
│   PAUSED     │◄───────│   ACTIVE    │───────►│  MAINTENANCE │
│              │ pause  │             │ maint  │              │
│              │───────►│             │◄───────│              │
└──────────────┘ resume └──────┬──────┘ resume └──────────────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
                 purge      migrate    archive
                    │          │          │
                    ▼          ▼          ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │  PURGED  │ │MIGRATING │ │ ARCHIVED │
            │          │ │          │ │          │
            └──────────┘ └────┬─────┘ └────┬─────┘
                              │            │
                              ▼            ▼
                         ┌──────────┐ ┌──────────┐
                         │ MIGRATED │ │ ARCHIVED │
                         │ (Shadow) │ │ (Cold)   │
                         └──────────┘ └──────────┘
                                           │
                                        restore
                                           │
                                           ▼
                                    Back to ACTIVE
```

### 1.2 Stream Configuration Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STREAM CONFIGURATION SYSTEM                              │
└─────────────────────────────────────────────────────────────────────────────┘

CONFIGURATION LAYERS (Inheritance Model)
────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Layer 4: Stream Override                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Specific stream settings that override all lower layers                     │
│  Example: maxBytes: 50GB for ORDERS stream only                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 3: Environment Policy                                                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Environment-specific defaults (production, staging, dev)                    │
│  Example: Production requires replicas >= 3                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 2: Team/Namespace Policy                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Team-level quotas and defaults                                              │
│  Example: Team "payments" max 100GB total storage                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Layer 1: Organization Defaults                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Base configuration for all streams                                          │
│  Example: Default retention 7 days, default replicas 3                       │
└─────────────────────────────────────────────────────────────────────────────┘


STREAM TEMPLATES LIBRARY
────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 Template: High-Throughput Events                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Use Case: Real-time analytics, telemetry, logs                              │
│                                                                              │
│  Configuration:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  storage: "memory"           │  discard: "old"                      │    │
│  │  retention: "limits"         │  maxMsgsPerSubject: 100000           │    │
│  │  maxMsgs: 10,000,000        │  duplicateWindow: "2m"               │    │
│  │  maxBytes: "10GB"           │  allowRollup: true                   │    │
│  │  maxAge: "1h"               │  denyDelete: false                   │    │
│  │  replicas: 1                │  denyPurge: false                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Estimated Performance: ~500K msgs/sec write, ~1M msgs/sec read             │
│  Recommended Consumers: Push-based, no ack required                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 Template: Transactional Work Queue                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Use Case: Order processing, payment events, critical workflows              │
│                                                                              │
│  Configuration:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  storage: "file"             │  discard: "new"                      │    │
│  │  retention: "workqueue"      │  maxMsgsPerSubject: -1               │    │
│  │  maxMsgs: -1                │  duplicateWindow: "5m"               │    │
│  │  maxBytes: "100GB"          │  allowRollup: false                  │    │
│  │  maxAge: "7d"               │  denyDelete: true                    │    │
│  │  replicas: 3                │  denyPurge: true                     │    │
│  │  maxMsgSize: "8MB"          │  placement: { tags: ["ssd"] }        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Estimated Performance: ~50K msgs/sec write, exactly-once delivery          │
│  Recommended Consumers: Pull-based, explicit ack, maxAckPending=1000        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 Template: Event Sourcing / Audit Log                                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Use Case: Immutable event log, compliance audit, CQRS                       │
│                                                                              │
│  Configuration:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  storage: "file"             │  discard: "new"                      │    │
│  │  retention: "limits"         │  maxMsgsPerSubject: -1               │    │
│  │  maxMsgs: -1                │  duplicateWindow: "10m"              │    │
│  │  maxBytes: "1TB"            │  allowRollup: false                  │    │
│  │  maxAge: "365d"             │  denyDelete: true                    │    │
│  │  replicas: 3                │  denyPurge: true                     │    │
│  │  compression: "s2"          │  sealed: false (true after period)   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Special: Automatic archival to S3/GCS after 30 days                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 Template: IoT Sensor Data                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Use Case: Device telemetry, time-series data, edge computing               │
│                                                                              │
│  Configuration:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  storage: "file"             │  discard: "old"                      │    │
│  │  retention: "limits"         │  maxMsgsPerSubject: 1000             │    │
│  │  maxMsgs: 100,000,000       │  duplicateWindow: "30s"              │    │
│  │  maxBytes: "500GB"          │  allowRollup: true                   │    │
│  │  maxAge: "30d"              │  subjects: ["sensors.>"]             │    │
│  │  replicas: 2                │  subjectTransform: { ... }           │    │
│  │  compression: "s2"          │                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Special: Subject hierarchy sensors.{region}.{device_id}.{metric}           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Stream Operations UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Stream: ORDERS                                          [● Active]         │
│  Production Cluster                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Overview] [Messages] [Consumers] [Config] [Metrics] [Operations] [Audit]  │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  OPERATIONS CENTER                                                           │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Quick Actions                                                          ││
│  │  ────────────────────────────────────────────────────────────────────── ││
│  │                                                                         ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       ││
│  │  │  ⏸️ Pause    │ │  🗑️ Purge   │ │  📋 Clone   │ │  📤 Export  │       ││
│  │  │  Stream     │ │  Messages   │ │  Stream     │ │  Config     │       ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       ││
│  │                                                                         ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       ││
│  │  │  🔄 Mirror  │ │  📦 Archive │ │  🔀 Migrate │ │  ⚡ Scale   │       ││
│  │  │  Setup      │ │  to S3      │ │  to Cluster │ │  Replicas   │       ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Purge Options                                                    [Run] ││
│  │  ────────────────────────────────────────────────────────────────────── ││
│  │                                                                         ││
│  │  Purge Type:  ○ All Messages                                            ││
│  │               ○ By Subject Filter: [orders.cancelled.*        ]         ││
│  │               ○ By Sequence Range: [________] to [________]             ││
│  │               ● By Time Range:                                          ││
│  │                                                                         ││
│  │  From: [2024-01-01 00:00  📅]  To: [2024-01-07 23:59  📅]              ││
│  │                                                                         ││
│  │  ☑️ Keep first message per subject (tombstone)                          ││
│  │  ☐ Dry run (show what would be purged)                                  ││
│  │                                                                         ││
│  │  ⚠️ Warning: This will permanently delete ~1,234,567 messages           ││
│  │     Estimated storage reclaimed: 2.3 GB                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Message Replay / Republish                                       [Run] ││
│  │  ────────────────────────────────────────────────────────────────────── ││
│  │                                                                         ││
│  │  Source:                                                                ││
│  │    Stream: [ORDERS                    ▼]                                ││
│  │    Subject Filter: [orders.created.>          ]                         ││
│  │    Sequence Range: [1000000   ] to [2000000   ]                         ││
│  │                                                                         ││
│  │  Destination:                                                           ││
│  │    ○ Same Stream (different subject)                                    ││
│  │      New Subject Prefix: [orders.replay.              ]                 ││
│  │    ● Different Stream                                                   ││
│  │      Target Stream: [ORDERS_REPROCESS         ▼]                        ││
│  │                                                                         ││
│  │  Options:                                                               ││
│  │    Rate Limit: [1000    ] msgs/sec                                      ││
│  │    ☑️ Preserve original timestamps                                       ││
│  │    ☑️ Add replay header (X-Replay-Source)                                ││
│  │    ☐ Transform messages (apply function)                                ││
│  │                                                                         ││
│  │  Estimated: 1,000,000 messages, ~45 minutes at 1000 msgs/sec           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Subject Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUBJECT HIERARCHY MANAGEMENT                          │
└─────────────────────────────────────────────────────────────────────────────┘

SUBJECT TREE VISUALIZATION
──────────────────────────

Stream: ORDERS (subjects: orders.>)

orders
├── created                    │ 45.2M msgs │ 12.3 GB │ ↑ 1,250/s
│   ├── us-east               │ 23.1M msgs │  6.2 GB │ ↑ 650/s
│   ├── us-west               │ 12.4M msgs │  3.4 GB │ ↑ 350/s
│   └── eu-west               │  9.7M msgs │  2.7 GB │ ↑ 250/s
├── updated                    │ 32.1M msgs │  8.9 GB │ ↑ 890/s
│   ├── status                │ 18.2M msgs │  4.1 GB │ ↑ 520/s
│   ├── payment               │  8.9M msgs │  2.8 GB │ ↑ 230/s
│   └── shipping              │  5.0M msgs │  2.0 GB │ ↑ 140/s
├── cancelled                  │  2.3M msgs │  0.6 GB │ ↑ 45/s
├── completed                  │ 28.9M msgs │  7.8 GB │ ↑ 780/s
└── refunded                   │  1.2M msgs │  0.3 GB │ ↑ 25/s
                              ─────────────────────────────────
                    TOTAL:    │109.7M msgs │ 29.9 GB │ ↑ 2,990/s


SUBJECT TRANSFORMS
──────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Subject Transform Rules                                          [+ Add]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Rule 1: Region Normalization                                    [Edit] [×] │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Source:      orders.*.us-east-1.*                                  │    │
│  │  Destination: orders.$.us-east.$                                    │    │
│  │  Description: Normalize AWS region to simplified region code        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Rule 2: Legacy Subject Migration                                [Edit] [×] │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Source:      legacy.orders.*                                       │    │
│  │  Destination: orders.migrated.$                                     │    │
│  │  Description: Migrate legacy subject namespace                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Rule 3: Add Timestamp Prefix                                    [Edit] [×] │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Source:      orders.>                                              │    │
│  │  Destination: orders.{{year}}.{{month}}.$                           │    │
│  │  Description: Partition by year/month for archival                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Consumer Management & Orchestration

### 2.1 Consumer Lifecycle & State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONSUMER STATE MACHINE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   CREATING   │
                              └──────┬───────┘
                                     │
                                     ▼
        ┌────────────────────────────────────────────────────┐
        │                                                    │
        ▼                                                    │
┌──────────────┐   subscribe   ┌──────────────┐            │
│   INACTIVE   │──────────────►│    ACTIVE    │────────────┤
│ (No clients) │               │  (Running)   │            │
└──────┬───────┘◄──────────────└──────┬───────┘            │
       │         unsubscribe          │                    │
       │                              │                    │
       │                         ┌────┴────┐               │
       │                         │         │               │
       │                      pause     stalled            │
       │                         │         │               │
       │                         ▼         ▼               │
       │                  ┌──────────┐ ┌──────────┐        │
       │                  │  PAUSED  │ │ STALLED  │        │
       │                  └────┬─────┘ └────┬─────┘        │
       │                       │            │               │
       │                    resume       recover           │
       │                       │            │               │
       │                       └─────┬──────┘               │
       │                             │                      │
       │                             ▼                      │
       │                     Back to ACTIVE                 │
       │                                                    │
       └───────────────────────┬────────────────────────────┘
                               │
                            delete
                               │
                               ▼
                        ┌──────────────┐
                        │   DELETED    │
                        └──────────────┘


CONSUMER HEALTH INDICATORS
──────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Health Score Calculation                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Score Components (0-100 each, weighted average):                           │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Component        │ Weight │ Healthy    │ Warning    │ Critical        │ │
│  ├──────────────────┼────────┼────────────┼────────────┼─────────────────┤ │
│  │ Lag              │ 30%    │ < 1000     │ 1K-10K     │ > 10K           │ │
│  │ Processing Rate  │ 25%    │ > 90% avg  │ 50-90%     │ < 50%           │ │
│  │ Ack Pending      │ 20%    │ < 50%      │ 50-80%     │ > 80%           │ │
│  │ Redelivery Rate  │ 15%    │ < 1%       │ 1-5%       │ > 5%            │ │
│  │ Connection       │ 10%    │ Stable     │ Reconnects │ Disconnected    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Overall Health:                                                             │
│  ● Healthy (80-100)  ⚠️ Warning (50-79)  🔴 Critical (0-49)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Consumer Groups & Scaling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONSUMER GROUP MANAGEMENT                               │
└─────────────────────────────────────────────────────────────────────────────┘

CONSUMER GROUP TOPOLOGY
───────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Consumer Group: order-processors                                            │
│  Stream: ORDERS │ Filter: orders.created.> │ Delivery: Pull                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                          ┌─────────────────┐                                │
│                          │  Stream: ORDERS │                                │
│                          │   (10 partitions)│                                │
│                          └────────┬────────┘                                │
│                                   │                                          │
│              ┌────────────────────┼────────────────────┐                    │
│              │                    │                    │                    │
│              ▼                    ▼                    ▼                    │
│     ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│     │  Consumer #1    │ │  Consumer #2    │ │  Consumer #3    │            │
│     │  ───────────────│ │  ───────────────│ │  ───────────────│            │
│     │  Host: pod-1    │ │  Host: pod-2    │ │  Host: pod-3    │            │
│     │  Partitions: 0-3│ │  Partitions: 4-6│ │  Partitions: 7-9│            │
│     │  Rate: 450/s    │ │  Rate: 420/s    │ │  Rate: 380/s    │            │
│     │  Lag: 234       │ │  Lag: 189       │ │  Lag: 567       │            │
│     │  ● Healthy      │ │  ● Healthy      │ │  ⚠️ Warning     │            │
│     └─────────────────┘ └─────────────────┘ └─────────────────┘            │
│                                                                              │
│  Total Throughput: 1,250 msgs/sec │ Total Lag: 990 │ Avg Latency: 45ms     │
│                                                                              │
│  [+ Add Consumer] [Rebalance] [Scale to 5] [Configure Autoscale]            │
└─────────────────────────────────────────────────────────────────────────────┘


AUTOSCALING CONFIGURATION
─────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Consumer Autoscaling: order-processors                          [Enabled]  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Scaling Metrics                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Primary Metric: [Consumer Lag                      ▼]              │    │
│  │                                                                     │    │
│  │  Scale Up When:                                                     │    │
│  │    Lag > [5000    ] for [3     ] consecutive checks                │    │
│  │    OR Processing Rate < [80    ]% of target                        │    │
│  │                                                                     │    │
│  │  Scale Down When:                                                   │    │
│  │    Lag < [500     ] for [10    ] consecutive checks                │    │
│  │    AND Processing Rate > [95    ]% of target                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Scaling Limits                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Minimum Consumers: [2     ]                                        │    │
│  │  Maximum Consumers: [10    ]                                        │    │
│  │  Scale Up Step:     [2     ] consumers                              │    │
│  │  Scale Down Step:   [1     ] consumer                               │    │
│  │  Cooldown Period:   [5     ] minutes                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Scaling History (Last 24h)                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  10 ┤                              ╭───────╮                        │    │
│  │     │                         ╭────╯       ╰────╮                   │    │
│  │   5 ┤    ╭────╮         ╭─────╯                 ╰────────────       │    │
│  │     │────╯    ╰─────────╯                                           │    │
│  │   0 ┼───────────────────────────────────────────────────────────   │    │
│  │      00:00    06:00    12:00    18:00    Now                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Dead Letter Queue Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DEAD LETTER QUEUE MANAGEMENT                             │
└─────────────────────────────────────────────────────────────────────────────┘

DLQ ARCHITECTURE
────────────────

┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│    Source Stream                    DLQ Stream                               │
│    ┌──────────────┐                ┌──────────────┐                         │
│    │   ORDERS     │                │  ORDERS_DLQ  │                         │
│    │              │                │              │                         │
│    │  Message ────┼───► Consumer ──┼──► Failed ───┼───► DLQ Consumer       │
│    │              │    (max 5      │    Messages  │     (Manual/Auto)       │
│    │              │     retries)   │              │                         │
│    └──────────────┘                └──────────────┘                         │
│                                           │                                  │
│                                           ▼                                  │
│                              ┌─────────────────────┐                        │
│                              │  DLQ Actions        │                        │
│                              ├─────────────────────┤                        │
│                              │  • Retry to source  │                        │
│                              │  • Route to handler │                        │
│                              │  • Archive          │                        │
│                              │  • Delete           │                        │
│                              │  • Transform & Retry│                        │
│                              └─────────────────────┘                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘


DLQ BROWSER UI
──────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Dead Letter Queue: ORDERS_DLQ                     [Retry All] [Purge All]  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Summary: 1,234 messages │ Oldest: 2 days ago │ Most Common: ValidationError│
│                                                                              │
│  Filter: [All Errors ▼]  Subject: [____________]  Time: [Last 24h ▼]       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ □ │ Seq      │ Original Subject  │ Error Type       │ Retries │ Age    ││
│  ├───┼──────────┼───────────────────┼──────────────────┼─────────┼────────┤│
│  │ □ │ 45678901 │ orders.created.us │ ValidationError  │ 5/5     │ 2h ago ││
│  │   │          │                   │ "Invalid amount" │         │        ││
│  ├───┼──────────┼───────────────────┼──────────────────┼─────────┼────────┤│
│  │ □ │ 45678899 │ orders.created.eu │ TimeoutError     │ 5/5     │ 3h ago ││
│  │   │          │                   │ "DB timeout"     │         │        ││
│  ├───┼──────────┼───────────────────┼──────────────────┼─────────┼────────┤│
│  │ □ │ 45678850 │ orders.updated    │ SchemaError      │ 5/5     │ 5h ago ││
│  │   │          │                   │ "Missing field"  │         │        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Selected Message Details                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Sequence: 45678901                                                     ││
│  │  Original Subject: orders.created.us-east                               ││
│  │  Original Stream: ORDERS                                                ││
│  │  Failed At: 2024-01-15 10:23:45 UTC                                     ││
│  │  Retry Count: 5 of 5                                                    ││
│  │                                                                         ││
│  │  Error Details:                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐  ││
│  │  │  Type: ValidationError                                            │  ││
│  │  │  Message: "Field 'amount' must be positive, got: -50.00"          │  ││
│  │  │  Consumer: order-processor-1                                      │  ││
│  │  │  Stack Trace: [Expand]                                            │  ││
│  │  └───────────────────────────────────────────────────────────────────┘  ││
│  │                                                                         ││
│  │  Message Payload:                                                       ││
│  │  ┌───────────────────────────────────────────────────────────────────┐  ││
│  │  │  {                                                                │  ││
│  │  │    "order_id": "ORD-123456",                                      │  ││
│  │  │    "amount": -50.00,        ◄── Error source highlighted         │  ││
│  │  │    "currency": "USD",                                             │  ││
│  │  │    ...                                                            │  ││
│  │  │  }                                                                │  ││
│  │  └───────────────────────────────────────────────────────────────────┘  ││
│  │                                                                         ││
│  │  Actions: [Retry] [Retry with Edit] [Route to Handler] [Archive] [Del] ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Error Distribution (Last 7 days)                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ValidationError    ████████████████████████████████  68%              ││
│  │  TimeoutError       ██████████░░░░░░░░░░░░░░░░░░░░░░  18%              ││
│  │  SchemaError        █████░░░░░░░░░░░░░░░░░░░░░░░░░░░  9%               ││
│  │  NetworkError       ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  5%               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Message Workflows & Pipelines

### 3.1 Visual Workflow Builder

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WORKFLOW / PIPELINE BUILDER                             │
└─────────────────────────────────────────────────────────────────────────────┘

WORKFLOW CANVAS
───────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Workflow: Order Processing Pipeline                   [Save] [Deploy] [⋮]  │
│  Status: ● Running │ Last deployed: 2h ago │ Messages processed: 1.2M      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  COMPONENT PALETTE                                                    │   │
│  │  ──────────────────                                                   │   │
│  │  Sources:    [📥 Stream] [📨 Subject] [⏰ Schedule] [🔗 HTTP]         │   │
│  │  Transforms: [🔄 Map] [🔍 Filter] [📊 Aggregate] [🔀 Split]          │   │
│  │  Actions:    [📤 Publish] [💾 Store] [📧 Notify] [🌐 HTTP Call]      │   │
│  │  Flow:       [⑂ Branch] [⊕ Merge] [⏱️ Delay] [🔁 Retry]              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          WORKFLOW CANVAS                              │   │
│  │                                                                       │   │
│  │   ┌─────────────┐                                                     │   │
│  │   │ 📥 Source   │                                                     │   │
│  │   │ ─────────── │                                                     │   │
│  │   │ ORDERS      │                                                     │   │
│  │   │ orders.>    │                                                     │   │
│  │   └──────┬──────┘                                                     │   │
│  │          │                                                            │   │
│  │          ▼                                                            │   │
│  │   ┌─────────────┐                                                     │   │
│  │   │ 🔍 Filter   │                                                     │   │
│  │   │ ─────────── │                                                     │   │
│  │   │ amount>100  │                                                     │   │
│  │   └──────┬──────┘                                                     │   │
│  │          │                                                            │   │
│  │          ▼                                                            │   │
│  │   ┌─────────────┐         ┌─────────────┐                             │   │
│  │   │ ⑂ Branch    │────────►│ 🔄 Enrich   │                             │   │
│  │   │ ─────────── │ high    │ ─────────── │                             │   │
│  │   │ priority?   │ priority│ Add customer│                             │   │
│  │   └──────┬──────┘         │ data        │                             │   │
│  │          │ normal         └──────┬──────┘                             │   │
│  │          │                       │                                    │   │
│  │          ▼                       │                                    │   │
│  │   ┌─────────────┐               │                                    │   │
│  │   │ 📤 Publish  │               │                                    │   │
│  │   │ ─────────── │               │                                    │   │
│  │   │ ORDERS_     │◄──────────────┘                                    │   │
│  │   │ PROCESSED   │                                                     │   │
│  │   └─────────────┘                                                     │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  NODE INSPECTOR (Filter Node Selected)                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Node: Filter                                         [Delete Node]  │   │
│  │  ──────────────────────────────────────────────────────────────────  │   │
│  │                                                                       │   │
│  │  Condition Type: [Expression ▼]                                       │   │
│  │                                                                       │   │
│  │  Expression:                                                          │   │
│  │  ┌────────────────────────────────────────────────────────────────┐  │   │
│  │  │  msg.data.amount > 100 && msg.data.status === 'pending'        │  │   │
│  │  └────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                       │   │
│  │  Test with sample message:                               [Test]      │   │
│  │  Result: ● Pass (message would continue)                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘


WORKFLOW DEFINITION SCHEMA
──────────────────────────

{
  "id": "wf_order_processing",
  "name": "Order Processing Pipeline",
  "version": "1.2.0",
  "enabled": true,
  
  "trigger": {
    "type": "stream",
    "config": {
      "stream": "ORDERS",
      "subjects": ["orders.created.>"],
      "deliverPolicy": "new",
      "ackPolicy": "explicit"
    }
  },
  
  "nodes": [
    {
      "id": "filter_high_value",
      "type": "filter",
      "config": {
        "expression": "msg.data.amount > 100"
      },
      "next": {
        "pass": "branch_priority",
        "fail": null  // Drop message
      }
    },
    {
      "id": "branch_priority",
      "type": "branch",
      "config": {
        "conditions": [
          {
            "name": "high_priority",
            "expression": "msg.data.priority === 'high' || msg.data.amount > 1000",
            "next": "enrich_customer"
          }
        ],
        "default": "publish_standard"
      }
    },
    {
      "id": "enrich_customer",
      "type": "http_call",
      "config": {
        "url": "https://api.internal/customers/${msg.data.customer_id}",
        "method": "GET",
        "timeout": "5s",
        "merge": {
          "path": "customer",
          "mode": "shallow"
        }
      },
      "next": "publish_priority",
      "onError": "publish_standard"
    },
    {
      "id": "publish_priority",
      "type": "publish",
      "config": {
        "stream": "ORDERS_PRIORITY",
        "subject": "orders.priority.${msg.data.region}"
      }
    },
    {
      "id": "publish_standard",
      "type": "publish",
      "config": {
        "stream": "ORDERS_PROCESSED",
        "subject": "orders.processed.${msg.data.region}"
      }
    }
  ],
  
  "errorHandling": {
    "maxRetries": 3,
    "retryDelay": "1s",
    "exponentialBackoff": true,
    "dlq": "WORKFLOW_DLQ"
  },
  
  "monitoring": {
    "metrics": true,
    "tracing": true,
    "alertOnError": true
  }
}
```

### 3.2 Message Routing & Fan-out

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MESSAGE ROUTING CONFIGURATION                           │
└─────────────────────────────────────────────────────────────────────────────┘

ROUTING RULES ENGINE
────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Routing Rules: ORDERS Stream                              [+ Add Rule]     │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 1: High-Value Order Routing                    Priority: 1  [▲▼] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  WHEN:                                                                  ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Subject matches: orders.created.*                                │ ││
│  │  │  AND payload.amount > 10000                                       │ ││
│  │  │  AND payload.currency IN ['USD', 'EUR']                           │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  THEN:                                                                  ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  ☑️ Copy to stream: ORDERS_HIGH_VALUE                             │ ││
│  │  │  ☑️ Publish to subject: notifications.vip.orders                  │ ││
│  │  │  ☑️ Add header: X-Priority = high                                 │ ││
│  │  │  ☐ Transform payload (apply function)                             │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                         [Edit] [Delete] ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 2: Regional Fan-out                            Priority: 2  [▲▼] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  WHEN:                                                                  ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Subject matches: orders.*.>                                      │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  THEN:                                                                  ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Route to regional streams based on payload.region:               │ ││
│  │  │                                                                   │ ││
│  │  │    us-east, us-west → ORDERS_US                                   │ ││
│  │  │    eu-west, eu-central → ORDERS_EU                                │ ││
│  │  │    ap-* → ORDERS_APAC                                             │ ││
│  │  │    * (default) → ORDERS_GLOBAL                                    │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                         [Edit] [Delete] ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 3: Compliance Audit Copy                       Priority: 10 [▲▼] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  WHEN: All messages (catch-all)                                         ││
│  │                                                                         ││
│  │  THEN:                                                                  ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  ☑️ Copy to stream: AUDIT_LOG (immutable)                         │ ││
│  │  │  ☑️ Add headers:                                                  │ ││
│  │  │       X-Audit-Time: ${timestamp}                                  │ ││
│  │  │       X-Audit-Hash: ${sha256(payload)}                            │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                         [Edit] [Delete] ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘


FAN-OUT TOPOLOGY VISUALIZATION
──────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Fan-out Topology: ORDERS                                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│                              ┌─────────────┐                                │
│                              │   ORDERS    │                                │
│                              │  (Source)   │                                │
│                              │  2.5K/sec   │                                │
│                              └──────┬──────┘                                │
│                                     │                                        │
│              ┌──────────────────────┼──────────────────────┐                │
│              │                      │                      │                │
│              ▼                      ▼                      ▼                │
│     ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│     │ ORDERS_US       │    │ ORDERS_EU       │    │ ORDERS_APAC     │      │
│     │ (Regional)      │    │ (Regional)      │    │ (Regional)      │      │
│     │ 1.2K/sec        │    │ 800/sec         │    │ 500/sec         │      │
│     └────────┬────────┘    └────────┬────────┘    └────────┬────────┘      │
│              │                      │                      │                │
│              │              ┌───────┴───────┐              │                │
│              │              ▼               ▼              │                │
│              │     ┌─────────────┐  ┌─────────────┐        │                │
│              │     │ EU_GDPR     │  │ EU_VAT      │        │                │
│              │     │ (Compliance)│  │ (Tax)       │        │                │
│              │     └─────────────┘  └─────────────┘        │                │
│              │                                             │                │
│              └──────────────────┬──────────────────────────┘                │
│                                 │                                            │
│                                 ▼                                            │
│                        ┌─────────────────┐                                  │
│                        │ AUDIT_LOG       │                                  │
│                        │ (Immutable)     │                                  │
│                        │ 2.5K/sec        │                                  │
│                        └─────────────────┘                                  │
│                                                                              │
│  Legend: ──► Mirror/Copy   ───► Filter/Route   - - -► Conditional          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Stream Mirroring & Sourcing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAM MIRRORING CONFIGURATION                          │
└─────────────────────────────────────────────────────────────────────────────┘

MIRROR SETUP WIZARD
───────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Create Stream Mirror                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Step 2 of 4: Configure Mirror Source                                        │
│                                                                              │
│  Source Configuration                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  Mirror Type:                                                       │    │
│  │    ● Full Mirror (all messages, 1:1 copy)                          │    │
│  │    ○ Filtered Mirror (subset of subjects)                          │    │
│  │    ○ Aggregate Mirror (multiple sources)                           │    │
│  │                                                                     │    │
│  │  Source Cluster: [Production US-East           ▼]                  │    │
│  │  Source Stream:  [ORDERS                       ▼]                  │    │
│  │                                                                     │    │
│  │  Start Position:                                                    │    │
│  │    ● From Beginning (full sync)                                    │    │
│  │    ○ From Sequence: [___________]                                  │    │
│  │    ○ From Time: [____________________📅]                           │    │
│  │    ○ New Messages Only                                             │    │
│  │                                                                     │    │
│  │  Filter Subjects (optional):                                        │    │
│  │  ┌───────────────────────────────────────────────────────────────┐ │    │
│  │  │  orders.created.>                                       [+ Add]│ │    │
│  │  │  orders.completed.>                                     [× Del]│ │    │
│  │  └───────────────────────────────────────────────────────────────┘ │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Destination Configuration                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  Destination Cluster: [Production EU-West         ▼]               │    │
│  │  Mirror Stream Name:  [ORDERS_EU_MIRROR           ]                │    │
│  │                                                                     │    │
│  │  Storage Override (optional):                                       │    │
│  │    Replicas: [3 ▼]  Storage: [File ▼]  Max Bytes: [100GB    ]     │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Estimated Initial Sync: ~45 minutes (based on 15.2M messages, 2.3GB)       │
│                                                                              │
│                                              [Back] [Next: Review] [Cancel] │
└─────────────────────────────────────────────────────────────────────────────┘


CROSS-CLUSTER REPLICATION MAP
─────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Replication Topology                                        [+ Add Mirror] │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │     US-EAST (Primary)              US-WEST (DR)                        ││
│  │     ┌─────────────────┐           ┌─────────────────┐                  ││
│  │     │    ORDERS       │──────────►│ ORDERS_MIRROR   │                  ││
│  │     │    15.2M msgs   │  Mirror   │ 15.2M msgs      │                  ││
│  │     │    ● In Sync    │  Lag: 0   │ ● In Sync       │                  ││
│  │     └─────────────────┘           └─────────────────┘                  ││
│  │            │                                                            ││
│  │            │ Mirror                                                     ││
│  │            │ Lag: 234                                                   ││
│  │            ▼                                                            ││
│  │     ┌─────────────────┐                                                ││
│  │     │ EU-WEST (Edge)  │                                                ││
│  │     ├─────────────────┤                                                ││
│  │     │ ORDERS_EU       │                                                ││
│  │     │ 15.1M msgs      │                                                ││
│  │     │ ⚠️ Lag: 234     │                                                ││
│  │     └─────────────────┘                                                ││
│  │            │                                                            ││
│  │            │ Source                                                     ││
│  │            ▼                                                            ││
│  │     ┌─────────────────┐                                                ││
│  │     │ AP-SOUTH (Edge) │                                                ││
│  │     ├─────────────────┤                                                ││
│  │     │ ORDERS_APAC     │                                                ││
│  │     │ 8.5M msgs       │  (Filtered: orders.*.ap-*)                     ││
│  │     │ ● In Sync       │                                                ││
│  │     └─────────────────┘                                                ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Replication Health Summary                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Mirror                    │ Lag      │ Rate    │ Status   │ Actions   ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  ORDERS → US-WEST          │ 0        │ 1.2K/s  │ ● Sync   │ [Pause]   ││
│  │  ORDERS → EU-WEST          │ 234      │ 1.1K/s  │ ⚠️ Behind │ [Catch Up]││
│  │  ORDERS → AP-SOUTH         │ 0        │ 450/s   │ ● Sync   │ [Pause]   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Schema Registry & Data Governance

### 4.1 Schema Registry Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SCHEMA REGISTRY SYSTEM                               │
└─────────────────────────────────────────────────────────────────────────────┘

ARCHITECTURE
────────────

┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│    Producers                 Schema Registry              Consumers          │
│    ┌──────────┐             ┌──────────────┐            ┌──────────┐        │
│    │ Service A│─validate───►│              │◄──fetch────│ Service X│        │
│    └──────────┘             │   PostgreSQL │            └──────────┘        │
│    ┌──────────┐             │   (Schemas)  │            ┌──────────┐        │
│    │ Service B│─validate───►│              │◄──fetch────│ Service Y│        │
│    └──────────┘             │   Redis      │            └──────────┘        │
│                             │   (Cache)    │                                 │
│                             └──────┬───────┘                                │
│                                    │                                         │
│                    ┌───────────────┼───────────────┐                        │
│                    │               │               │                        │
│                    ▼               ▼               ▼                        │
│             ┌──────────┐    ┌──────────┐    ┌──────────┐                   │
│             │  Avro    │    │  JSON    │    │ Protobuf │                   │
│             │ Schemas  │    │ Schemas  │    │ Schemas  │                   │
│             └──────────┘    └──────────┘    └──────────┘                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘


SCHEMA BROWSER UI
─────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Schema Registry                                            [+ New Schema]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Schemas] [Subjects] [Compatibility] [Validation Rules]                    │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  Search: [_________________________]  Type: [All ▼]  Format: [All ▼]       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Schema Name              │ Format   │ Version │ Subjects │ Compat     ││
│  ├───────────────────────────┼──────────┼─────────┼──────────┼────────────┤│
│  │ 📋 Order                  │ Avro     │ v3      │ 4        │ BACKWARD   ││
│  │    io.acme.orders.Order   │          │         │          │            ││
│  ├───────────────────────────┼──────────┼─────────┼──────────┼────────────┤│
│  │ 📋 OrderCreatedEvent      │ JSON     │ v2      │ 2        │ FORWARD    ││
│  │    orders.created         │          │         │          │            ││
│  ├───────────────────────────┼──────────┼─────────┼──────────┼────────────┤│
│  │ 📋 Customer               │ Protobuf │ v5      │ 3        │ FULL       ││
│  │    acme.customers.v1      │          │         │          │            ││
│  ├───────────────────────────┼──────────┼─────────┼──────────┼────────────┤│
│  │ 📋 PaymentEvent           │ Avro     │ v1      │ 1        │ NONE       ││
│  │    io.acme.payments       │          │         │          │            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Showing 4 of 24 schemas                                                     │
└─────────────────────────────────────────────────────────────────────────────┘


SCHEMA DETAIL VIEW
──────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Schema: Order (io.acme.orders.Order)                                        │
│  Type: Avro │ Version: 3 │ Compatibility: BACKWARD                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Definition] [Versions] [Subjects] [Lineage] [Validation]                  │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  Schema Definition                                      [Edit] [Test] [⬇️]  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {                                                                      ││
│  │    "type": "record",                                                    ││
│  │    "name": "Order",                                                     ││
│  │    "namespace": "io.acme.orders",                                       ││
│  │    "doc": "Represents a customer order",                                ││
│  │    "fields": [                                                          ││
│  │      {                                                                  ││
│  │        "name": "order_id",                                              ││
│  │        "type": "string",                                                ││
│  │        "doc": "Unique order identifier"                                 ││
│  │      },                                                                 ││
│  │      {                                                                  ││
│  │        "name": "customer_id",                                           ││
│  │        "type": "string"                                                 ││
│  │      },                                                                 ││
│  │      {                                                                  ││
│  │        "name": "amount",                                                ││
│  │        "type": {                                                        ││
│  │          "type": "bytes",                                               ││
│  │          "logicalType": "decimal",                                      ││
│  │          "precision": 10,                                               ││
│  │          "scale": 2                                                     ││
│  │        }                                                                ││
│  │      },                                                                 ││
│  │      {                                                                  ││
│  │        "name": "status",                                                ││
│  │        "type": {                                                        ││
│  │          "type": "enum",                                                ││
│  │          "name": "OrderStatus",                                         ││
│  │          "symbols": ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"]    ││
│  │        }                                                                ││
│  │      },                                                                 ││
│  │      {                                                                  ││
│  │        "name": "metadata",                                              ││
│  │        "type": ["null", {"type": "map", "values": "string"}],          ││
│  │        "default": null                                                  ││
│  │      }                                                                  ││
│  │    ]                                                                    ││
│  │  }                                                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Version History                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  v3 (current)  │ 2024-01-15 │ Added metadata field       │ [View Diff] ││
│  │  v2            │ 2024-01-08 │ Added DELIVERED status     │ [View Diff] ││
│  │  v1            │ 2024-01-01 │ Initial schema             │ [View]      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Associated Subjects                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  • orders.created.>     (Stream: ORDERS)                                ││
│  │  • orders.updated.>     (Stream: ORDERS)                                ││
│  │  • orders.archived.*    (Stream: ORDERS_ARCHIVE)                        ││
│  │  • orders-dlq.*         (Stream: ORDERS_DLQ)                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘


SCHEMA EVOLUTION & COMPATIBILITY
────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Schema Compatibility Check                                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  New Schema Version (v4)                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  + Added field: "shipping_address" (optional, with default)             ││
│  │  + Added enum value: "CANCELLED" to OrderStatus                         ││
│  │  ~ Changed field "metadata": added "source" to default map              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Compatibility Results                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Mode: BACKWARD                                                         ││
│  │  Status: ● Compatible                                                   ││
│  │                                                                         ││
│  │  Checks:                                                                ││
│  │  ✅ New optional fields have defaults                                   ││
│  │  ✅ No required fields removed                                          ││
│  │  ✅ Field types unchanged                                               ││
│  │  ✅ Enum values only added (not removed)                                ││
│  │                                                                         ││
│  │  Consumer Impact Analysis:                                              ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  order-processor (v3)      │ ● Compatible   │ No action needed   │ ││
│  │  │  analytics-worker (v2)     │ ● Compatible   │ No action needed   │ ││
│  │  │  legacy-system (v1)        │ ⚠️ Degraded    │ Unknown fields     │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│                                        [Cancel] [Register as v4]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Quality & Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATA QUALITY RULES ENGINE                               │
└─────────────────────────────────────────────────────────────────────────────┘

VALIDATION RULES CONFIGURATION
──────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Data Quality Rules: ORDERS Stream                          [+ Add Rule]    │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Enforcement Mode: [Warn and Log ▼]  (Reject / Warn and Log / Log Only)    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 1: Order ID Format                               [Enabled] [Edit] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Field: order_id                                                        ││
│  │  Type: Pattern Match                                                    ││
│  │  Pattern: ^ORD-[0-9]{4}-[A-Z0-9]{8}$                                    ││
│  │  On Failure: Reject                                                     ││
│  │  Stats: 99.8% pass rate │ 234 failures today                           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 2: Amount Validation                             [Enabled] [Edit] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Field: amount                                                          ││
│  │  Type: Range Check                                                      ││
│  │  Condition: amount > 0 AND amount < 1000000                             ││
│  │  On Failure: Warn                                                       ││
│  │  Stats: 99.99% pass rate │ 12 warnings today                           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 3: Required Fields                               [Enabled] [Edit] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Type: Null Check                                                       ││
│  │  Fields: [order_id, customer_id, amount, status]                        ││
│  │  On Failure: Reject                                                     ││
│  │  Stats: 100% pass rate │ 0 failures today                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 4: Customer Exists                               [Enabled] [Edit] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Type: Lookup Validation                                                ││
│  │  Field: customer_id                                                     ││
│  │  Lookup: KV Store "customers" key exists                                ││
│  │  On Failure: Warn (async check)                                         ││
│  │  Stats: 98.5% pass rate │ 1,523 warnings today                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Rule 5: Duplicate Detection                           [Enabled] [Edit] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Type: Deduplication                                                    ││
│  │  Key: order_id                                                          ││
│  │  Window: 5 minutes                                                      ││
│  │  On Duplicate: Reject (idempotent)                                      ││
│  │  Stats: 0.1% duplicates detected │ 89 rejected today                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Data Quality Dashboard                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Overall Quality Score: 98.7%                     [View Details]        ││
│  │                                                                         ││
│  │  100% ┤████████████████████████████████████████████████████████        ││
│  │       │                        ╭────────╮                               ││
│  │   95% ┤                   ╭────╯        ╰────╮                          ││
│  │       │              ╭────╯                  ╰────╮                     ││
│  │   90% ┼──────────────╯                            ╰─────────────        ││
│  │       └──────────────────────────────────────────────────────────       ││
│  │         Mon     Tue     Wed     Thu     Fri     Sat     Sun             ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Stream Processing & Transforms

### 5.1 Real-Time Transforms

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAM TRANSFORMS ENGINE                                │
└─────────────────────────────────────────────────────────────────────────────┘

TRANSFORM PIPELINE ARCHITECTURE
───────────────────────────────

┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   Source Stream              Transform Engine           Destination          │
│   ┌──────────────┐          ┌──────────────┐          ┌──────────────┐      │
│   │   ORDERS     │─────────►│  WASM/JS     │─────────►│  ORDERS_     │      │
│   │              │          │  Runtime     │          │  ENRICHED    │      │
│   │  Raw Events  │          │              │          │              │      │
│   └──────────────┘          │  Functions:  │          │  Processed   │      │
│                             │  • Map       │          │  Events      │      │
│                             │  • Filter    │          └──────────────┘      │
│                             │  • Enrich    │                                 │
│                             │  • Aggregate │                                 │
│                             └──────────────┘                                 │
│                                    │                                         │
│                                    ▼                                         │
│                             ┌──────────────┐                                │
│                             │  ClickHouse  │                                │
│                             │  (Metrics)   │                                │
│                             └──────────────┘                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘


TRANSFORM FUNCTIONS LIBRARY
───────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Transform Functions                                      [+ Create New]    │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  [Built-in] [Custom] [Community]                                            │
│                                                                              │
│  Built-in Transforms                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  📦 JSON Path Extract                                                   ││
│  │     Extract and reshape JSON fields                                     ││
│  │     Example: $.order.items[*].sku → flat array of SKUs                  ││
│  │                                                                         ││
│  │  📦 Field Rename/Remove                                                 ││
│  │     Rename, remove, or reorder fields                                   ││
│  │     Example: customer_id → customerId, remove internal_id              ││
│  │                                                                         ││
│  │  📦 Type Coercion                                                       ││
│  │     Convert field types                                                 ││
│  │     Example: string "123.45" → decimal 123.45                          ││
│  │                                                                         ││
│  │  📦 Timestamp Transform                                                 ││
│  │     Parse, format, or convert timestamps                                ││
│  │     Example: Unix epoch → ISO 8601                                     ││
│  │                                                                         ││
│  │  📦 Hash/Mask                                                           ││
│  │     Hash or mask sensitive data                                         ││
│  │     Example: email → SHA256, credit_card → ****1234                    ││
│  │                                                                         ││
│  │  📦 Lookup Enrichment                                                   ││
│  │     Enrich from KV store or external API                                ││
│  │     Example: customer_id → full customer record                        ││
│  │                                                                         ││
│  │  📦 Aggregate Window                                                    ││
│  │     Time-window aggregations                                            ││
│  │     Example: 5-min tumbling window count by region                     ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Custom Transforms (JavaScript)                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  🔧 order-enrichment           v1.2.0        Active on 3 streams       ││
│  │     Adds customer tier and discount calculation                        ││
│  │                                                              [Edit]     ││
│  │                                                                         ││
│  │  🔧 pii-redaction              v2.0.0        Active on 5 streams       ││
│  │     Removes/masks PII fields for analytics streams                     ││
│  │                                                              [Edit]     ││
│  │                                                                         ││
│  │  🔧 geo-enrichment             v1.0.1        Active on 2 streams       ││
│  │     Adds geolocation data from IP addresses                            ││
│  │                                                              [Edit]     ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘


TRANSFORM EDITOR
────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Transform: order-enrichment                    [Save] [Test] [Deploy]      │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Runtime: [JavaScript (V8) ▼]    Timeout: [5000   ] ms                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  // Transform function receives message and context                     ││
│  │  // Returns transformed message or null to filter                       ││
│  │                                                                         ││
│  │  export default async function transform(msg, ctx) {                    ││
│  │    // Access message data                                               ││
│  │    const order = msg.data;                                              ││
│  │                                                                         ││
│  │    // Lookup customer from KV store                                     ││
│  │    const customer = await ctx.kv.get('customers', order.customer_id);   ││
│  │                                                                         ││
│  │    // Calculate discount based on customer tier                         ││
│  │    const discount = calculateDiscount(customer?.tier, order.amount);    ││
│  │                                                                         ││
│  │    // Return enriched message                                           ││
│  │    return {                                                             ││
│  │      ...msg,                                                            ││
│  │      data: {                                                            ││
│  │        ...order,                                                        ││
│  │        customer_tier: customer?.tier || 'standard',                     ││
│  │        discount_amount: discount,                                       ││
│  │        final_amount: order.amount - discount,                           ││
│  │        enriched_at: new Date().toISOString()                            ││
│  │      }                                                                  ││
│  │    };                                                                   ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  function calculateDiscount(tier, amount) {                             ││
│  │    const rates = { platinum: 0.15, gold: 0.10, silver: 0.05 };         ││
│  │    return amount * (rates[tier] || 0);                                  ││
│  │  }                                                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Test Input                                          Test Output             │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ {                               │  │ {                               │  │
│  │   "order_id": "ORD-123",        │  │   "order_id": "ORD-123",        │  │
│  │   "customer_id": "CUST-456",    │  │   "customer_id": "CUST-456",    │  │
│  │   "amount": 500.00              │  │   "amount": 500.00,             │  │
│  │ }                               │  │   "customer_tier": "gold",      │  │
│  │                                 │  │   "discount_amount": 50.00,     │  │
│  │                                 │  │   "final_amount": 450.00,       │  │
│  │                                 │  │   "enriched_at": "2024-01..."   │  │
│  │                                 │  │ }                               │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
│  ● Test passed (23ms)                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Aggregation & Analytics Pipelines

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     REAL-TIME AGGREGATION ENGINE                             │
└─────────────────────────────────────────────────────────────────────────────┘

AGGREGATION PIPELINE BUILDER
────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Aggregation Pipeline: Order Metrics                    [Save] [Activate]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Source: ORDERS stream │ Subject: orders.completed.>                        │
│                                                                              │
│  Pipeline Definition                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  WINDOW CONFIGURATION                                                   ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Window Type: [Tumbling ▼]    Size: [5    ] [minutes ▼]          │ ││
│  │  │                                                                   │ ││
│  │  │  ○ Tumbling (fixed, non-overlapping)                              │ ││
│  │  │  ○ Sliding (overlapping windows)                                  │ ││
│  │  │  ○ Session (activity-based)                                       │ ││
│  │  │                                                                   │ ││
│  │  │  Late Arrival Tolerance: [1    ] [minutes ▼]                     │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  GROUP BY                                                               ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Fields:                                                          │ ││
│  │  │    [✓] $.region                                                   │ ││
│  │  │    [✓] $.product_category                                         │ ││
│  │  │    [ ] $.customer_tier                                            │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  AGGREGATIONS                                                           ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Output Field      │ Function    │ Source Field                  │ ││
│  │  │  ─────────────────────────────────────────────────────────────── │ ││
│  │  │  order_count       │ COUNT       │ *                              │ ││
│  │  │  total_revenue     │ SUM         │ $.amount                       │ ││
│  │  │  avg_order_value   │ AVG         │ $.amount                       │ ││
│  │  │  max_order_value   │ MAX         │ $.amount                       │ ││
│  │  │  unique_customers  │ COUNT_DIST  │ $.customer_id                  │ ││
│  │  │  top_products      │ TOP_K(10)   │ $.items[*].sku                │ ││
│  │  │                                                          [+ Add] │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  OUTPUT                                                                 ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  [✓] Publish to Stream: ORDER_METRICS                            │ ││
│  │  │      Subject: metrics.orders.{region}.{product_category}          │ ││
│  │  │                                                                   │ ││
│  │  │  [✓] Write to ClickHouse: order_metrics_5min                     │ ││
│  │  │                                                                   │ ││
│  │  │  [✓] Update KV Store: order_realtime_stats                       │ ││
│  │  │      Key: stats:{region}:{product_category}                       │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Pipeline Preview (Sample Output)                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {                                                                      ││
│  │    "window_start": "2024-01-15T10:30:00Z",                              ││
│  │    "window_end": "2024-01-15T10:35:00Z",                                ││
│  │    "region": "us-east",                                                 ││
│  │    "product_category": "electronics",                                   ││
│  │    "order_count": 1234,                                                 ││
│  │    "total_revenue": 156789.50,                                          ││
│  │    "avg_order_value": 127.05,                                           ││
│  │    "max_order_value": 2499.99,                                          ││
│  │    "unique_customers": 987,                                             ││
│  │    "top_products": ["SKU-001", "SKU-042", "SKU-108", ...]              ││
│  │  }                                                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. AI-Powered Features

### 6.1 AI Assistant & Copilot

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI ASSISTANT ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

SYSTEM ARCHITECTURE
───────────────────

┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│    User Interface                 AI Backend                  Data Sources   │
│    ┌──────────────┐              ┌──────────────┐           ┌──────────────┐│
│    │              │              │              │           │  Stream      ││
│    │  Chat UI     │─────────────►│  AI Gateway  │◄─────────►│  Metadata    ││
│    │              │              │              │           │              ││
│    │  Context     │              │  Claude API  │           │  Message     ││
│    │  Sidebar     │              │  Integration │◄─────────►│  Samples     ││
│    │              │              │              │           │              ││
│    │  Suggestions │◄─────────────│  RAG Engine  │◄─────────►│  Docs &      ││
│    │  Panel       │              │              │           │  Schemas     ││
│    │              │              │  Function    │           │              ││
│    └──────────────┘              │  Calling     │◄─────────►│  Metrics &   ││
│                                  │              │           │  Analytics   ││
│                                  └──────────────┘           └──────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘


AI CHAT INTERFACE
─────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  NATS Console AI Assistant                                    [⚙️] [×]      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  👤 User                                                     10:45 AM   ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Why is my order-processor consumer lagging? It was fine yesterday.    ││
│  │                                                                         ││
│  │  🤖 AI Assistant                                             10:45 AM   ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  I've analyzed the order-processor consumer and found several factors  ││
│  │  contributing to the lag increase:                                     ││
│  │                                                                         ││
│  │  📊 **Analysis Summary**                                                ││
│  │                                                                         ││
│  │  1. **Traffic Spike**: Message rate increased 3x at 9:15 AM            ││
│  │     • Yesterday avg: 450 msgs/sec                                      ││
│  │     • Today peak: 1,350 msgs/sec                                       ││
│  │                                                                         ││
│  │  2. **Processing Slowdown**: Avg processing time increased             ││
│  │     • Yesterday: 45ms/msg                                              ││
│  │     • Today: 180ms/msg (4x slower)                                     ││
│  │                                                                         ││
│  │  3. **Root Cause**: Database query latency spike                       ││
│  │     • CustomerDB p99 latency: 150ms → 520ms                            ││
│  │     • Correlates with increased error rate                             ││
│  │                                                                         ││
│  │  📋 **Recommended Actions**                                             ││
│  │                                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │ 1. Scale consumers from 3 to 6          [Apply]                   │ ││
│  │  │ 2. Enable consumer caching for customer lookups                   │ ││
│  │  │ 3. Add circuit breaker for CustomerDB                             │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  Would you like me to apply the scaling change now?                    ││
│  │                                                                         ││
│  │  👤 User                                                     10:46 AM   ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Yes, scale to 6 consumers and show me the impact                      ││
│  │                                                                         ││
│  │  🤖 AI Assistant                                             10:46 AM   ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  ✅ Scaling order-processor from 3 to 6 consumers...                   ││
│  │                                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Consumer Scaling Progress                                        │ ││
│  │  │  ████████████████████░░░░░░░░░░  65%                              │ ││
│  │  │  4/6 consumers active                                             │ ││
│  │  │  Lag recovering: 15,234 → 8,456 (-44%)                           │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Quick Actions:                                                              │
│  [Explain this stream] [Suggest optimizations] [Generate consumer config]   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Ask anything about your streams, consumers, or messages...       [↵]  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘


AI CAPABILITIES MATRIX
──────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI FEATURE CAPABILITIES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NATURAL LANGUAGE QUERIES                                                    │
│  ────────────────────────                                                    │
│  • "Show me streams with highest throughput"                                 │
│  • "Which consumers have been failing?"                                      │
│  • "What happened to ORDERS stream yesterday at 3pm?"                        │
│  • "Find messages containing error from last hour"                           │
│  • "Compare performance between prod and staging"                            │
│                                                                              │
│  INTELLIGENT DIAGNOSTICS                                                     │
│  ────────────────────────                                                    │
│  • Root cause analysis for lag/failures                                      │
│  • Correlation detection across metrics                                      │
│  • Anomaly explanation                                                       │
│  • Performance bottleneck identification                                     │
│  • Predictive capacity planning                                              │
│                                                                              │
│  CONFIGURATION GENERATION                                                    │
│  ────────────────────────                                                    │
│  • Stream config from requirements description                               │
│  • Consumer setup recommendations                                            │
│  • Workflow pipeline generation                                              │
│  • Schema inference from sample messages                                     │
│  • Alert rule suggestions                                                    │
│                                                                              │
│  AUTOMATED ACTIONS                                                           │
│  ─────────────────                                                           │
│  • One-click fixes with preview                                              │
│  • Safe rollback options                                                     │
│  • Approval workflow for sensitive ops                                       │
│  • Change impact analysis                                                    │
│                                                                              │
│  LEARNING & CONTEXT                                                          │
│  ─────────────────                                                           │
│  • Remembers user preferences                                                │
│  • Learns from organization patterns                                         │
│  • Context-aware suggestions                                                 │
│  • Documentation integration                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 AI-Powered Insights & Anomaly Detection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI INSIGHTS DASHBOARD                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  AI Insights                                          [Configure] [Refresh] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  🎯 Active Anomalies                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  🔴 CRITICAL: Unusual Traffic Pattern Detected                10:32 AM ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Stream: ORDERS                                                   │ ││
│  │  │  Anomaly: Message rate 5x higher than historical average          │ ││
│  │  │  Pattern: Sudden spike, not gradual increase                      │ ││
│  │  │  Possible Causes:                                                 │ ││
│  │  │    • Flash sale or promotional event (85% confidence)             │ ││
│  │  │    • Client retry storm (10% confidence)                          │ ││
│  │  │    • Data replay/migration (5% confidence)                        │ ││
│  │  │                                                                   │ ││
│  │  │  Impact: Consumer lag increasing, storage filling faster          │ ││
│  │  │  AI Recommendation: Scale consumers + extend retention            │ ││
│  │  │                                                                   │ ││
│  │  │  [View Details] [Apply Recommendation] [Acknowledge] [Snooze]    │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  ⚠️ WARNING: Schema Drift Detected                           9:15 AM   ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Stream: EVENTS                                                   │ ││
│  │  │  Detection: 12% of messages don't match registered schema         │ ││
│  │  │  New fields found: ["device_os", "app_version", "experiment_id"] │ ││
│  │  │  Source: events.mobile.> subjects (mobile app v3.2.0)            │ ││
│  │  │                                                                   │ ││
│  │  │  AI Recommendation: Update schema to v4 with optional fields      │ ││
│  │  │                                                                   │ ││
│  │  │  [View Schema Diff] [Auto-Generate Schema] [Acknowledge]          │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  💡 Optimization Suggestions                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  📊 Stream: AUDIT_LOG                               Potential: High    ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Observation: Stream has 95% read-to-write ratio                  │ ││
│  │  │  Current: 3 replicas, file storage                                │ ││
│  │  │                                                                   │ ││
│  │  │  Recommendation: Add read replicas for better read performance    │ ││
│  │  │  Expected Impact: 40% reduction in read latency                   │ ││
│  │  │  Estimated Cost: +$50/month (additional storage)                  │ ││
│  │  │                                                                   │ ││
│  │  │  [Apply] [Schedule] [Dismiss]                                    │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  📊 Consumer: notification-sender                    Potential: Medium ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Observation: Consumer processes 1 message at a time              │ ││
│  │  │  Current: batch_size=1, max_ack_pending=1                        │ ││
│  │  │                                                                   │ ││
│  │  │  Recommendation: Enable batch processing                          │ ││
│  │  │  Suggested Config: batch_size=100, max_ack_pending=500           │ ││
│  │  │  Expected Impact: 10x throughput improvement                      │ ││
│  │  │                                                                   │ ││
│  │  │  [Apply] [Test First] [Dismiss]                                  │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  🔮 Predictive Analysis                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Capacity Forecast (Next 30 Days)                                       ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │                                                                   │ ││
│  │  │  Stream: ORDERS                                                   │ ││
│  │  │                                                                   │ ││
│  │  │  Storage Usage Prediction:                                        │ ││
│  │  │  100% ┤                                         ╭─────────────── │ ││
│  │  │      │                                   ╭──────╯  Projected     │ ││
│  │  │   75% ┤                            ╭─────╯                        │ ││
│  │  │      │                      ╭──────╯                              │ ││
│  │  │   50% ┼───────────────╭─────╯                                     │ ││
│  │  │      │          ╭─────╯ Current                                   │ ││
│  │  │   25% ┤    ╭────╯                                                 │ ││
│  │  │      └────╯─────────────────────────────────────────────────────  │ ││
│  │  │        Now     +7d      +14d      +21d      +30d                  │ ││
│  │  │                                                                   │ ││
│  │  │  ⚠️ Alert: Storage limit (100GB) will be reached in ~18 days     │ ││
│  │  │                                                                   │ ││
│  │  │  Recommendations:                                                 │ ││
│  │  │  1. Increase maxBytes to 200GB                                   │ ││
│  │  │  2. Reduce retention from 30d to 14d                             │ ││
│  │  │  3. Enable compression (est. 40% reduction)                       │ ││
│  │  │                                                                   │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 AI Message Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI MESSAGE ANALYZER                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Message Analysis: ORDERS Stream                              [🤖 AI Mode]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Structure Analysis] [Content Patterns] [Anomaly Detection] [Search]       │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  AI-Inferred Schema                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Based on analysis of 10,000 sample messages:                           ││
│  │                                                                         ││
│  │  {                                                                      ││
│  │    "order_id": "string (pattern: ORD-\\d{4}-[A-Z0-9]{8})",             ││
│  │    "customer_id": "string (UUID format)",                               ││
│  │    "amount": "number (range: 0.01 - 99999.99)",                        ││
│  │    "currency": "string (enum: USD, EUR, GBP, JPY)",                    ││
│  │    "status": "string (enum: pending, confirmed, shipped, delivered)",  ││
│  │    "items": [{                                                          ││
│  │      "sku": "string (pattern: SKU-\\d{3})",                            ││
│  │      "quantity": "integer (range: 1 - 100)",                           ││
│  │      "price": "number"                                                  ││
│  │    }],                                                                  ││
│  │    "metadata": {                                                        ││
│  │      "source": "string (enum: web, mobile, api)",                      ││
│  │      "ip_address": "string (IP format, nullable)",                     ││
│  │      "user_agent": "string (nullable)"                                 ││
│  │    },                                                                   ││
│  │    "created_at": "string (ISO 8601 datetime)"                          ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  Confidence: 98.5%                                                      ││
│  │  Coverage: 99.2% of messages match this schema                         ││
│  │                                                                         ││
│  │  [Register as Schema] [Export Avro] [Export JSON Schema]               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Content Pattern Analysis                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Field Distribution Analysis                                            ││
│  │  ───────────────────────────────────────────────────────────────────── ││
│  │                                                                         ││
│  │  currency:                           source:                            ││
│  │  ┌────────────────────────┐         ┌────────────────────────┐         ││
│  │  │ USD  ██████████████ 65%│         │ web    █████████████ 58%│         ││
│  │  │ EUR  █████░░░░░░░░ 22%│         │ mobile ██████░░░░░░ 32%│         ││
│  │  │ GBP  ██░░░░░░░░░░░ 8% │         │ api    ██░░░░░░░░░░ 10%│         ││
│  │  │ JPY  █░░░░░░░░░░░░ 5% │         └────────────────────────┘         ││
│  │  └────────────────────────┘                                             ││
│  │                                                                         ││
│  │  Amount Distribution:                                                   ││
│  │  ┌────────────────────────────────────────────────────────────────┐    ││
│  │  │     │       ╭──╮                                                │    ││
│  │  │     │   ╭───╯  ╰──╮                                             │    ││
│  │  │     │ ╭─╯        ╰───╮                                          │    ││
│  │  │     ├─╯              ╰────╮                                     │    ││
│  │  │     │                     ╰───────────────────────────────────  │    ││
│  │  │     └─────────────────────────────────────────────────────────  │    ││
│  │  │     $0     $50    $100   $200   $500   $1000  $5000+             │    ││
│  │  │                                                                 │    ││
│  │  │  Mean: $127.45 │ Median: $85.00 │ P95: $450.00 │ P99: $1,200   │    ││
│  │  └────────────────────────────────────────────────────────────────┘    ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Natural Language Search                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Search: [Find orders over $500 from mobile with shipping errors  ]    ││
│  │                                                                         ││
│  │  AI-Generated Query:                                                    ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  $.amount > 500                                                   │ ││
│  │  │  AND $.metadata.source = 'mobile'                                 │ ││
│  │  │  AND $.status = 'error'                                           │ ││
│  │  │  AND $.error_type CONTAINS 'shipping'                             │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  Results: 234 messages found                         [Execute Search]  ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 AI Query Generator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI QUERY & CONFIG GENERATOR                             │
└─────────────────────────────────────────────────────────────────────────────┘

NATURAL LANGUAGE TO CONFIG
──────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  AI Configuration Generator                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Describe what you want to create:                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  I need a stream for storing user activity events. It should keep      ││
│  │  events for 30 days, handle about 10,000 events per second, and be     ││
│  │  highly available. Events should be partitioned by user_id for         ││
│  │  ordering. I also need a consumer that processes events in batches     ││
│  │  of 100 with at-least-once delivery.                                   ││
│  │                                                                         ││
│  │                                                               [Generate]││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Generated Configuration                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Stream: USER_ACTIVITY                                                  ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  // AI Explanation:                                                     ││
│  │  // - File storage for durability at high volume                       ││
│  │  // - 3 replicas for high availability                                 ││
│  │  // - maxMsgsPerSubject limits per-user storage                        ││
│  │  // - S2 compression for 40-60% storage savings                        ││
│  │                                                                         ││
│  │  {                                                                      ││
│  │    "name": "USER_ACTIVITY",                                             ││
│  │    "subjects": ["activity.>"],                                          ││
│  │    "retention": "limits",                                               ││
│  │    "storage": "file",                                                   ││
│  │    "maxAge": "720h",              // 30 days                           ││
│  │    "maxBytes": 500000000000,      // 500GB for ~10K/sec                ││
│  │    "maxMsgsPerSubject": 1000000,  // Per user_id limit                 ││
│  │    "replicas": 3,                                                       ││
│  │    "compression": "s2",                                                 ││
│  │    "discard": "old",                                                    ││
│  │    "duplicateWindow": "120s",                                           ││
│  │    "placement": {                                                       ││
│  │      "tags": ["ssd", "high-iops"]                                      ││
│  │    }                                                                    ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  Consumer: activity-processor                                           ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  // AI Explanation:                                                     ││
│  │  // - Pull-based for batch processing                                  ││
│  │  // - max_batch: 100 as requested                                      ││
│  │  // - ack_wait: 30s for batch processing time                          ││
│  │  // - max_deliver: 5 for at-least-once with retries                    ││
│  │                                                                         ││
│  │  {                                                                      ││
│  │    "name": "activity-processor",                                        ││
│  │    "durable_name": "activity-processor",                                ││
│  │    "deliver_policy": "all",                                             ││
│  │    "ack_policy": "explicit",                                            ││
│  │    "ack_wait": "30s",                                                   ││
│  │    "max_deliver": 5,                                                    ││
│  │    "max_ack_pending": 1000,                                             ││
│  │    "max_batch": 100,                                                    ││
│  │    "max_waiting": 512                                                   ││
│  │  }                                                                      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Estimated Resources                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Storage (30 days): ~350 GB (with compression)                         ││
│  │  Memory: ~2 GB per replica for indexes                                 ││
│  │  Bandwidth: ~50 MB/sec sustained                                       ││
│  │  Cost Estimate: ~$150/month (based on current cluster pricing)         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  [Edit Config] [Create Stream & Consumer] [Save as Template] [Export]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Self-Service Portal & Quotas

### 7.1 Team Self-Service

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SELF-SERVICE PORTAL                                     │
└─────────────────────────────────────────────────────────────────────────────┘

NAMESPACE / TEAM MANAGEMENT
───────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Team: Payments Engineering                                      [Settings] │
│  Namespace: payments-*                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Overview] [Streams] [Consumers] [Quotas] [Members] [Audit Log]            │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  Resource Usage                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Streams                    Storage                  Messages           ││
│  │  ┌───────────────────┐     ┌───────────────────┐   ┌─────────────────┐ ││
│  │  │      8 / 15       │     │    45 GB / 100 GB │   │ 125M / 500M     │ ││
│  │  │  ████████░░░░░░░  │     │  ████████░░░░░░░  │   │ █████░░░░░░░░░  │ ││
│  │  │       53%         │     │       45%         │   │     25%         │ ││
│  │  └───────────────────┘     └───────────────────┘   └─────────────────┘ ││
│  │                                                                         ││
│  │  Consumers                  Throughput (In)         Throughput (Out)    ││
│  │  ┌───────────────────┐     ┌───────────────────┐   ┌─────────────────┐ ││
│  │  │     24 / 50       │     │ 5K/s / 10K/s      │   │ 8K/s / 20K/s    │ ││
│  │  │  █████████░░░░░░  │     │  █████████░░░░░░  │   │ ████████░░░░░░  │ ││
│  │  │       48%         │     │       50%         │   │     40%         │ ││
│  │  └───────────────────┘     └───────────────────┘   └─────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  My Resources                                                   [+ Create]  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Stream               │ Storage │ Consumers │ Rate    │ Status         ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  payments-transactions│ 23.4 GB │ 8         │ 2.3K/s  │ ● Active       ││
│  │  payments-refunds     │ 5.2 GB  │ 4         │ 450/s   │ ● Active       ││
│  │  payments-audit       │ 12.1 GB │ 2         │ 890/s   │ ● Active       ││
│  │  payments-dlq         │ 234 MB  │ 1         │ 12/s    │ ⚠️ Needs Review ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Quick Actions                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  [📦 New Stream]  [👤 Add Consumer]  [📊 View Metrics]  [📋 Templates]  ││
│  │                                                                         ││
│  │  [🔑 API Keys]    [📜 View Audit]    [📈 Request Quota]  [❓ Help]      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘


QUOTA MANAGEMENT
────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Quota Management: Payments Engineering                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Current Quotas                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Resource          │ Current │ Limit   │ Usage │ Status                ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Streams           │ 8       │ 15      │ 53%   │ ● OK                  ││
│  │  Consumers         │ 24      │ 50      │ 48%   │ ● OK                  ││
│  │  Total Storage     │ 45 GB   │ 100 GB  │ 45%   │ ● OK                  ││
│  │  Message Count     │ 125M    │ 500M    │ 25%   │ ● OK                  ││
│  │  Inbound Rate      │ 5K/s    │ 10K/s   │ 50%   │ ● OK                  ││
│  │  Outbound Rate     │ 8K/s    │ 20K/s   │ 40%   │ ● OK                  ││
│  │  Max Msg Size      │ -       │ 8 MB    │ -     │ ● OK                  ││
│  │  Replicas (max)    │ -       │ 3       │ -     │ ● OK                  ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Request Quota Increase                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Resource: [Storage            ▼]                                       ││
│  │  Current Limit: 100 GB                                                  ││
│  │  Requested Limit: [200         ] GB                                     ││
│  │                                                                         ││
│  │  Justification:                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  We're onboarding 3 new payment processors next month which will │ ││
│  │  │  increase our transaction volume by approximately 2x. Our        │ ││
│  │  │  current growth rate suggests we'll hit 100GB within 6 weeks.    │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  Estimated Cost Impact: +$25/month                                      ││
│  │  Approval Required: Platform Admin (auto-approved under 500GB)          ││
│  │                                                                         ││
│  │                                              [Cancel] [Submit Request]  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Quota History                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  2024-01-10 │ Storage increased 50GB → 100GB │ Approved │ jane@acme    ││
│  │  2023-12-15 │ Streams increased 10 → 15      │ Approved │ platform-adm ││
│  │  2023-11-01 │ Initial allocation             │ Created  │ system       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Approval Workflows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      APPROVAL WORKFLOW SYSTEM                                │
└─────────────────────────────────────────────────────────────────────────────┘

PENDING APPROVALS
─────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Approval Queue                                              [My Requests]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Pending Approvals (5)                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  🟡 Production Stream Creation                         Submitted 2h ago ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Requester: john.doe@acme.com (Payments Team)                     │ ││
│  │  │  Type: Create Stream                                              │ ││
│  │  │  Environment: Production                                          │ ││
│  │  │                                                                   │ ││
│  │  │  Request Details:                                                 │ ││
│  │  │  • Stream Name: payments-settlements                              │ ││
│  │  │  • Storage: 50GB, File-based, 3 replicas                         │ ││
│  │  │  • Retention: 90 days                                             │ ││
│  │  │  • Subjects: payments.settlements.>                               │ ││
│  │  │                                                                   │ ││
│  │  │  AI Risk Assessment: ● Low                                        │ ││
│  │  │  • Configuration follows team patterns                           │ ││
│  │  │  • Within quota limits                                            │ ││
│  │  │  • Similar to existing approved streams                           │ ││
│  │  │                                                                   │ ││
│  │  │  [View Full Config]                                               │ ││
│  │  │                                                                   │ ││
│  │  │  [Approve] [Approve with Changes] [Reject] [Request More Info]    │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  🟡 Quota Increase Request                            Submitted 1d ago  ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Requester: jane.smith@acme.com (Analytics Team)                  │ ││
│  │  │  Type: Quota Increase                                             │ ││
│  │  │                                                                   │ ││
│  │  │  Request Details:                                                 │ ││
│  │  │  • Resource: Total Storage                                        │ ││
│  │  │  • Current: 100 GB → Requested: 500 GB                           │ ││
│  │  │  • Justification: "New real-time analytics pipeline requires..."  │ ││
│  │  │                                                                   │ ││
│  │  │  AI Risk Assessment: ⚠️ Medium                                    │ ││
│  │  │  • 5x increase is significant                                    │ ││
│  │  │  • Cost impact: +$200/month                                      │ ││
│  │  │  • Recommend reviewing retention policies first                   │ ││
│  │  │                                                                   │ ││
│  │  │  [View Usage History] [View Cost Impact]                         │ ││
│  │  │                                                                   │ ││
│  │  │  [Approve] [Approve Partial (200GB)] [Reject] [Request Meeting]  │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘


POLICY CONFIGURATION
────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Approval Policies                                          [+ Add Policy]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Policy: Production Changes                           [Enabled] [Edit]  ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  Triggers:                                                              ││
│  │  • Any stream/consumer operation in production cluster                  ││
│  │  • Excludes: Read operations, message publishing                        ││
│  │                                                                         ││
│  │  Approval Requirements:                                                 ││
│  │  • 1 approval from: Platform Team OR Team Lead                          ││
│  │  • Auto-approve if: Change is < 10% of current limits                   ││
│  │  • Auto-reject if: Violates org security policies                       ││
│  │                                                                         ││
│  │  SLA: 4 hours (business hours)                                          ││
│  │  Escalation: After 8 hours → notify @platform-oncall                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Policy: Large Quota Requests                         [Enabled] [Edit]  ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  Triggers:                                                              ││
│  │  • Quota increase > 2x current limit                                    ││
│  │  • Storage increase > 100GB                                             ││
│  │  • Cost impact > $100/month                                             ││
│  │                                                                         ││
│  │  Approval Requirements:                                                 ││
│  │  • 1 approval from: Platform Admin                                      ││
│  │  • 1 approval from: Finance (if cost > $500/month)                      ││
│  │                                                                         ││
│  │  SLA: 24 hours                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Policy: Development Self-Service                     [Enabled] [Edit]  ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                                                                         ││
│  │  Triggers:                                                              ││
│  │  • Any operation in development/staging clusters                        ││
│  │                                                                         ││
│  │  Approval Requirements:                                                 ││
│  │  • Auto-approve all requests within team quota                          ││
│  │  • Log for audit purposes                                               ││
│  │                                                                         ││
│  │  SLA: Immediate                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. GitOps & Infrastructure as Code

### 8.1 GitOps Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GITOPS INTEGRATION                                   │
└─────────────────────────────────────────────────────────────────────────────┘

GITOPS ARCHITECTURE
───────────────────

┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│     Git Repository                NATS Console              NATS Cluster    │
│     ┌──────────────┐             ┌──────────────┐          ┌──────────────┐│
│     │              │ ───watch──► │   GitOps     │ ──sync─► │              ││
│     │   YAML/JSON  │             │   Controller │          │   JetStream  ││
│     │   Configs    │             │              │          │              ││
│     │              │ ◄───plan─── │   Drift      │ ◄──read─ │              ││
│     └──────────────┘             │   Detector   │          └──────────────┘│
│            │                     └──────────────┘                           │
│            │                            │                                    │
│     ┌──────▼──────┐              ┌──────▼──────┐                            │
│     │    CI/CD    │              │   Audit     │                            │
│     │  Pipeline   │              │   Log       │                            │
│     │             │              │             │                            │
│     │ • Validate  │              │ • Changes   │                            │
│     │ • Plan      │              │ • Diffs     │                            │
│     │ • Apply     │              │ • Approvals │                            │
│     └─────────────┘              └─────────────┘                            │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘


REPOSITORY STRUCTURE
────────────────────

nats-config/
├── environments/
│   ├── production/
│   │   ├── clusters/
│   │   │   ├── us-east.yaml
│   │   │   └── eu-west.yaml
│   │   ├── streams/
│   │   │   ├── orders.yaml
│   │   │   ├── events.yaml
│   │   │   └── audit.yaml
│   │   ├── consumers/
│   │   │   ├── order-processor.yaml
│   │   │   └── analytics-worker.yaml
│   │   └── policies/
│   │       ├── quotas.yaml
│   │       └── retention.yaml
│   ├── staging/
│   │   └── ...
│   └── development/
│       └── ...
├── schemas/
│   ├── order.avsc
│   ├── event.json
│   └── customer.proto
├── workflows/
│   ├── order-pipeline.yaml
│   └── analytics-pipeline.yaml
└── kustomization.yaml


CONFIGURATION FILE FORMAT
─────────────────────────

# streams/orders.yaml
apiVersion: nats.io/v1
kind: Stream
metadata:
  name: ORDERS
  namespace: payments
  labels:
    team: payments
    env: production
    tier: critical
spec:
  description: "Customer order events"
  subjects:
    - "orders.>"
  retention: limits
  storage: file
  maxBytes: 107374182400  # 100GB
  maxAge: 168h            # 7 days
  maxMsgSize: 8388608     # 8MB
  replicas: 3
  compression: s2
  discard: old
  duplicateWindow: 5m
  placement:
    tags:
      - ssd
      - us-east
  mirror: null
  sources: []
  
  # Schema enforcement
  schema:
    type: avro
    ref: schemas/order.avsc
    validation: strict
    
  # Consumers defined inline or separately
  consumers:
    - name: order-processor
      durableName: order-processor
      deliverPolicy: all
      ackPolicy: explicit
      ackWait: 30s
      maxDeliver: 5
      maxAckPending: 1000
      filterSubject: "orders.created.>"


GITOPS DASHBOARD
────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  GitOps: Infrastructure as Code                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Repository: github.com/acme/nats-config                     [⟳ Sync Now]  │
│  Branch: main │ Last sync: 5 min ago │ Status: ● In Sync                    │
│                                                                              │
│  [Sync Status] [Diff View] [History] [Settings]                             │
│  ══════════════════════════════════════════════════════════════════════════ │
│                                                                              │
│  Environment Status                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Environment   │ Resources │ Synced │ Drift │ Last Sync │ Status       ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  production    │ 45        │ 45     │ 0     │ 5m ago    │ ● In Sync    ││
│  │  staging       │ 38        │ 36     │ 2     │ 12m ago   │ ⚠️ Drift     ││
│  │  development   │ 52        │ 52     │ 0     │ 2m ago    │ ● In Sync    ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Detected Drift (staging)                                  [Auto-Remediate] │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Stream: EVENTS                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │  Field          │ Git (Expected)  │ Actual        │ Action       │ ││
│  │  │  ───────────────────────────────────────────────────────────────  │ ││
│  │  │  maxBytes       │ 50GB            │ 100GB         │ [Revert]     │ ││
│  │  │  replicas       │ 2               │ 3             │ [Revert]     │ ││
│  │  │                                                                   │ ││
│  │  │  Manual change detected at 2024-01-15 09:23 by john@acme.com     │ ││
│  │  │                                                                   │ ││
│  │  │  Options: [Revert to Git] [Update Git from Cluster] [Ignore]     │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Recent Syncs                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Commit       │ Author      │ Changes           │ Status    │ Time     ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  a3f2d1c      │ jane@acme   │ +2 streams        │ ✅ Applied │ 5m ago   ││
│  │  b4e5c2a      │ bob@acme    │ Update consumers  │ ✅ Applied │ 2h ago   ││
│  │  c5d6e3b      │ alice@acme  │ New workflow      │ ✅ Applied │ 1d ago   ││
│  │  d6e7f4c      │ john@acme   │ Quota increase    │ ⏳ Pending │ 1d ago   ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Terraform Provider

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TERRAFORM PROVIDER DESIGN                               │
└─────────────────────────────────────────────────────────────────────────────┘

TERRAFORM RESOURCE EXAMPLES
───────────────────────────

# Provider configuration
provider "nats" {
  endpoint = "https://console.nats.acme.com"
  api_key  = var.nats_api_key
  
  # Optional: specific cluster
  cluster_id = "prod-us-east"
}

# Stream resource
resource "nats_stream" "orders" {
  name        = "ORDERS"
  description = "Customer order events"
  
  subjects = ["orders.>"]
  
  retention = "limits"
  storage   = "file"
  
  max_bytes        = 107374182400  # 100GB
  max_age          = "168h"        # 7 days
  max_msg_size     = 8388608       # 8MB
  max_msgs         = -1            # unlimited
  
  replicas    = 3
  compression = "s2"
  discard     = "old"
  
  duplicate_window = "5m"
  
  placement {
    tags = ["ssd", "us-east"]
  }
  
  # Schema enforcement
  schema {
    type       = "avro"
    schema_id  = nats_schema.order.id
    validation = "strict"
  }
  
  labels = {
    team = "payments"
    tier = "critical"
  }
}

# Consumer resource
resource "nats_consumer" "order_processor" {
  stream_name = nats_stream.orders.name
  
  name         = "order-processor"
  durable_name = "order-processor"
  
  deliver_policy  = "all"
  ack_policy      = "explicit"
  ack_wait        = "30s"
  max_deliver     = 5
  max_ack_pending = 1000
  
  filter_subject = "orders.created.>"
  
  # Push delivery (optional)
  # deliver_subject = "deliver.order-processor"
  
  # Rate limiting
  rate_limit = 1000  # msgs per second
}

# Schema resource
resource "nats_schema" "order" {
  name      = "Order"
  namespace = "io.acme.orders"
  type      = "avro"
  
  compatibility = "backward"
  
  schema = file("${path.module}/schemas/order.avsc")
}

# KV Store resource
resource "nats_kv_bucket" "customer_cache" {
  bucket      = "customer-cache"
  description = "Customer data cache"
  
  max_value_size = 102400  # 100KB
  history        = 5
  ttl            = "24h"
  
  replicas = 3
  storage  = "file"
}

# Alert rule resource
resource "nats_alert_rule" "high_lag" {
  name     = "High Consumer Lag Alert"
  severity = "critical"
  
  condition {
    metric    = "consumer_lag"
    stream    = nats_stream.orders.name
    consumer  = nats_consumer.order_processor.name
    operator  = ">"
    threshold = 10000
    duration  = "5m"
  }
  
  notification {
    channel = "slack"
    target  = "#alerts-critical"
  }
  
  notification {
    channel = "pagerduty"
    target  = "payments-oncall"
  }
}

# Workflow/Pipeline resource
resource "nats_workflow" "order_pipeline" {
  name        = "Order Processing Pipeline"
  description = "Enriches and routes orders"
  
  enabled = true
  
  trigger {
    type   = "stream"
    stream = nats_stream.orders.name
    filter = "orders.created.>"
  }
  
  pipeline = file("${path.module}/workflows/order-pipeline.json")
  
  error_handling {
    max_retries = 3
    dlq_stream  = nats_stream.orders_dlq.name
  }
}


TERRAFORM IMPORT SUPPORT
────────────────────────

# Import existing resources
terraform import nats_stream.orders ORDERS
terraform import nats_consumer.order_processor ORDERS/order-processor
terraform import nats_schema.order Order
```

---

## 9. Advanced Observability

### 9.1 Distributed Tracing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DISTRIBUTED TRACING VIEW                                │
└─────────────────────────────────────────────────────────────────────────────┘

MESSAGE TRACE VISUALIZATION
───────────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Message Trace: orders.created (Seq: 15234567)               [Export Trace] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Trace ID: abc-123-def-456                     Total Duration: 234ms        │
│  Start: 2024-01-15 10:45:23.456 UTC            Services: 5                  │
│                                                                              │
│  Waterfall View                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Service              │ Operation           │ Duration │ Timeline      ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │                       │                     │          │ 0ms    250ms  ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  order-api            │ publish             │ 12ms     │ ██░░░░░░░░░░  ││
│  │  └─ NATS              │ stream.write        │ 3ms      │ █░░░░░░░░░░░  ││
│  │                       │                     │          │               ││
│  │  order-processor      │ consume             │ 145ms    │ ░░████████░░  ││
│  │  ├─ validate          │ schema.validate     │ 5ms      │ ░░█░░░░░░░░░  ││
│  │  ├─ customer-svc      │ http.get            │ 45ms     │ ░░░██░░░░░░░  ││
│  │  ├─ inventory-svc     │ http.get            │ 62ms     │ ░░░░███░░░░░  ││
│  │  ├─ process           │ business.logic      │ 23ms     │ ░░░░░░░█░░░░  ││
│  │  └─ NATS              │ stream.publish      │ 8ms      │ ░░░░░░░░█░░░  ││
│  │                       │                     │          │               ││
│  │  notification-svc     │ consume             │ 45ms     │ ░░░░░░░░░██░  ││
│  │  └─ email-provider    │ http.post           │ 38ms     │ ░░░░░░░░░██░  ││
│  │                       │                     │          │               ││
│  │  analytics-worker     │ consume             │ 23ms     │ ░░░░░░░░░░██  ││
│  │  └─ clickhouse        │ db.insert           │ 15ms     │ ░░░░░░░░░░█░  ││
│  │                       │                     │          │               ││
│  │  audit-logger         │ consume             │ 18ms     │ ░░░░░░░░░░░█  ││
│  │  └─ clickhouse        │ db.insert           │ 12ms     │ ░░░░░░░░░░░█  ││
│  │                       │                     │          │               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Message Flow Diagram                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  ┌──────────┐      ┌──────────┐      ┌──────────────────────────┐      ││
│  │  │order-api │─────►│  ORDERS  │─────►│  order-processor         │      ││
│  │  └──────────┘      │  stream  │      │  (145ms, ✅ success)      │      ││
│  │                    └──────────┘      └────────────┬─────────────┘      ││
│  │                                                   │                     ││
│  │                                      ┌────────────┴────────────┐       ││
│  │                                      │                         │       ││
│  │                                      ▼                         ▼       ││
│  │                    ┌──────────────────────────┐  ┌──────────────────┐  ││
│  │                    │  ORDERS_PROCESSED stream │  │ NOTIFICATIONS    │  ││
│  │                    └────────────┬─────────────┘  │ stream           │  ││
│  │                                 │                 └────────┬─────────┘  ││
│  │                    ┌────────────┴────────┐                │            ││
│  │                    │                     │                ▼            ││
│  │                    ▼                     ▼       ┌──────────────────┐  ││
│  │          ┌──────────────────┐  ┌──────────────┐  │notification-svc │  ││
│  │          │analytics-worker  │  │audit-logger  │  │(45ms, ✅)        │  ││
│  │          │(23ms, ✅)         │  │(18ms, ✅)     │  └──────────────────┘  ││
│  │          └──────────────────┘  └──────────────┘                        ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Span Details: order-processor                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Tags:                                                                  ││
│  │    service: order-processor    version: v2.3.1                          ││
│  │    pod: order-processor-7d8c   node: k8s-node-03                        ││
│  │    nats.stream: ORDERS         nats.sequence: 15234567                  ││
│  │                                                                         ││
│  │  Events:                                                                ││
│  │    10:45:23.468  message.received                                       ││
│  │    10:45:23.473  schema.validated                                       ││
│  │    10:45:23.518  customer.fetched  customer_id=CUST-456                 ││
│  │    10:45:23.580  inventory.checked sku_count=3                          ││
│  │    10:45:23.603  order.processed   status=confirmed                     ││
│  │    10:45:23.611  message.published to=ORDERS_PROCESSED                  ││
│  │    10:45:23.613  message.acked                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Custom Dashboards

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CUSTOM DASHBOARD BUILDER                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Dashboard: Payments Overview                        [Edit] [Share] [⋮]     │
│  Auto-refresh: 30s │ Time range: Last 6 hours                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────┐ ┌────────────────────────┐ ┌───────────────────┐│
│  │  Transaction Rate      │ │  Success Rate          │ │  Avg Latency      ││
│  │  ═══════════════════   │ │  ═══════════════════   │ │  ═══════════════  ││
│  │                        │ │                        │ │                   ││
│  │     2,345 /sec         │ │       99.7%            │ │     45 ms         ││
│  │     ↑ 12% vs avg       │ │       ↓ 0.1%           │ │     ↓ 5ms         ││
│  │                        │ │                        │ │                   ││
│  └────────────────────────┘ └────────────────────────┘ └───────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  Transaction Volume by Region                                            ││
│  │  ════════════════════════════════════════════════════════════════════   ││
│  │                                                                          ││
│  │   3K ┤                    ╭────╮                      ╭────╮             ││
│  │      │               ╭────╯    ╰────╮           ╭────╯    ╰────╮        ││
│  │   2K ┤          ╭────╯              ╰────╮ ╭────╯              ╰───     ││
│  │      │     ╭────╯                        ╰─╯                            ││
│  │   1K ┼─────╯                                                             ││
│  │      │                                                                   ││
│  │   0  ┼───────────────────────────────────────────────────────────────── ││
│  │       04:00      06:00      08:00      10:00      Now                   ││
│  │                                                                          ││
│  │   ── us-east  ── us-west  ── eu-west  ── ap-south                       ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────┐ ┌─────────────────────────────────────┐│
│  │  Consumer Health                 │ │  Top Errors                         ││
│  │  ═══════════════════════════════ │ │  ═══════════════════════════════   ││
│  │                                  │ │                                     ││
│  │  payment-processor  ● Healthy   │ │  ValidationError     ████████ 68%   ││
│  │   Lag: 234   Rate: 1.2K/s       │ │  TimeoutError        ███░░░░░ 22%   ││
│  │                                  │ │  NetworkError        █░░░░░░░ 7%    ││
│  │  fraud-detector     ● Healthy   │ │  SchemaError         █░░░░░░░ 3%    ││
│  │   Lag: 45    Rate: 890/s        │ │                                     ││
│  │                                  │ │  Total Errors: 234 (0.3%)          ││
│  │  settlement-worker  ⚠️ Warning  │ │                                     ││
│  │   Lag: 5,234 Rate: 450/s        │ │                                     ││
│  │                                  │ │                                     ││
│  └──────────────────────────────────┘ └─────────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │  Recent Alerts                                                           ││
│  │  ════════════════════════════════════════════════════════════════════   ││
│  │                                                                          ││
│  │  ⚠️ 10:32  Consumer lag threshold exceeded (settlement-worker)          ││
│  │  ● 09:15  Alert resolved: High error rate returned to normal            ││
│  │  ⚠️ 08:45  Storage usage above 80% (payments-audit stream)              ││
│  │                                                                          ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Data Lineage & Catalog

### 10.1 Data Lineage Visualization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA LINEAGE & CATALOG                               │
└─────────────────────────────────────────────────────────────────────────────┘

END-TO-END LINEAGE VIEW
───────────────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Data Lineage: Order Event                              [Expand All] [⬇️]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Trace the journey of data from source to destination                        │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                                                                          ││
│  │   DATA SOURCES                                                           ││
│  │   ┌─────────────────┐                                                    ││
│  │   │ 🌐 Order API    │                                                    ││
│  │   │    (REST)       │                                                    ││
│  │   └────────┬────────┘                                                    ││
│  │            │                                                             ││
│  │            ▼                                                             ││
│  │   INGESTION LAYER                                                        ││
│  │   ┌─────────────────┐                                                    ││
│  │   │ 📥 ORDERS       │                                                    ││
│  │   │    Stream       │                                                    ││
│  │   │    (Raw Events) │                                                    ││
│  │   └────────┬────────┘                                                    ││
│  │            │                                                             ││
│  │   ┌────────┴────────────────────────────────────────────────────┐       ││
│  │   │                                                              │       ││
│  │   ▼                                                              ▼       ││
│  │   PROCESSING LAYER                                                       ││
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     ││
│  │   │ ⚙️ Enrichment   │    │ ⚙️ Validation   │    │ ⚙️ Fan-out      │     ││
│  │   │    Pipeline     │    │    Service      │    │    Router       │     ││
│  │   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     ││
│  │            │                      │                      │               ││
│  │            ▼                      ▼                      ▼               ││
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     ││
│  │   │ 📦 ORDERS_      │    │ 📦 ORDERS_DLQ   │    │ 📦 ORDERS_US    │     ││
│  │   │    ENRICHED     │    │    (Failures)   │    │    ORDERS_EU    │     ││
│  │   └────────┬────────┘    └─────────────────┘    │    ORDERS_APAC  │     ││
│  │            │                                     └────────┬────────┘     ││
│  │   ┌────────┴────────────────────────────────────────────────┐           ││
│  │   │                           │                              │           ││
│  │   ▼                           ▼                              ▼           ││
│  │   CONSUMPTION LAYER                                                      ││
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     ││
│  │   │ 👤 order-       │    │ 👤 analytics-   │    │ 👤 notification-│     ││
│  │   │    processor    │    │    worker       │    │    service      │     ││
│  │   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     ││
│  │            │                      │                      │               ││
│  │            ▼                      ▼                      ▼               ││
│  │   DESTINATION LAYER                                                      ││
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     ││
│  │   │ 🗄️ PostgreSQL   │    │ 🗄️ ClickHouse   │    │ 📧 Email/SMS    │     ││
│  │   │    (Orders DB)  │    │    (Analytics)  │    │    Providers    │     ││
│  │   └─────────────────┘    └─────────────────┘    └─────────────────┘     ││
│  │                                                                          ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Impact Analysis: What happens if ORDERS stream schema changes?              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                                                                          ││
│  │  Downstream Impact:                                                      ││
│  │  • 3 processing pipelines (Enrichment, Validation, Fan-out)             ││
│  │  • 4 consumer applications                                               ││
│  │  • 5 destination systems                                                 ││
│  │  • ~15M messages/day affected                                           ││
│  │                                                                          ││
│  │  Recommended Actions:                                                    ││
│  │  1. Notify all downstream team owners (Payments, Analytics, Comms)      ││
│  │  2. Schedule maintenance window                                          ││
│  │  3. Run schema compatibility check                                       ││
│  │                                                                          ││
│  │  [Generate Impact Report] [Notify Teams] [Schedule Change]              ││
│  │                                                                          ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Data Catalog

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA CATALOG                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Data Catalog                                    [+ Add Entry] [Settings]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Search: [Search streams, subjects, schemas, fields...         ] [🔍]       │
│                                                                              │
│  Browse: [All ▼] [Production ▼] [Team: All ▼] [Tags: All ▼]                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  📦 ORDERS                                               [View Details] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Customer order events from e-commerce platform                         ││
│  │                                                                         ││
│  │  Owner: Payments Team          │ Classification: PII, Financial        ││
│  │  Environment: Production       │ Quality Score: 98.5%                  ││
│  │  Schema: Order (v3)            │ Last Updated: 2h ago                  ││
│  │                                                                         ││
│  │  Tags: [orders] [payments] [critical] [customer-data]                  ││
│  │                                                                         ││
│  │  Key Fields:                                                            ││
│  │  • order_id (string) - Unique order identifier                         ││
│  │  • customer_id (string) - Customer reference [PII]                     ││
│  │  • amount (decimal) - Order total [Financial]                          ││
│  │  • status (enum) - Order status                                        ││
│  │                                                                         ││
│  │  Lineage: 1 source → 5 destinations                                    ││
│  │  Usage: 15.2M msgs/day │ 12 consumers │ 3 workflows                    ││
│  │                                                                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  📦 EVENTS                                               [View Details] ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Application events and user activity tracking                          ││
│  │                                                                         ││
│  │  Owner: Analytics Team         │ Classification: User Activity         ││
│  │  Environment: Production       │ Quality Score: 99.1%                  ││
│  │  Schema: Event (v2)            │ Last Updated: 30m ago                 ││
│  │                                                                         ││
│  │  Tags: [events] [analytics] [tracking] [mobile] [web]                  ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Catalog Statistics                                                          │
│  ┌────────────────────┐ ┌────────────────────┐ ┌─────────────────────┐      │
│  │  24 Streams        │ │  156 Subjects      │ │  18 Schemas         │      │
│  │  Documented        │ │  Cataloged         │ │  Registered         │      │
│  └────────────────────┘ └────────────────────┘ └─────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Disaster Recovery & Replication

### 11.1 DR Configuration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DISASTER RECOVERY CONFIGURATION                         │
└─────────────────────────────────────────────────────────────────────────────┘

DR TOPOLOGY
───────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Disaster Recovery: Global Replication                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │                                                                          ││
│  │         US-EAST (Primary)                    US-WEST (Hot Standby)       ││
│  │         ┌─────────────────┐                 ┌─────────────────┐          ││
│  │         │  ██████████████ │ ───sync────►   │  ██████████████ │          ││
│  │         │  NATS Cluster   │   (async)      │  NATS Cluster   │          ││
│  │         │                 │                 │                 │          ││
│  │         │  • 3 nodes      │ RPO: 5 sec     │  • 3 nodes      │          ││
│  │         │  • 24 streams   │ RTO: 30 sec    │  • 24 mirrors   │          ││
│  │         │  • Active       │                 │  • Standby      │          ││
│  │         └─────────────────┘                 └─────────────────┘          ││
│  │                │                                   │                     ││
│  │                │                                   │                     ││
│  │                │           EU-WEST (DR Cold)       │                     ││
│  │                │          ┌─────────────────┐      │                     ││
│  │                └──────────│  ░░░░░░░░░░░░░░ │◄─────┘                     ││
│  │                   sync    │  NATS Cluster   │   sync                     ││
│  │                  (batch)  │                 │  (batch)                   ││
│  │                           │  • 3 nodes      │                            ││
│  │                  RPO: 1hr │  • Snapshots    │                            ││
│  │                  RTO: 4hr │  • Cold         │                            ││
│  │                           └─────────────────┘                            ││
│  │                                                                          ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Replication Status                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Source      │ Target    │ Type     │ Lag    │ Status    │ Last Sync  ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  US-EAST     │ US-WEST   │ Async    │ 2 sec  │ ● Synced  │ Just now   ││
│  │  US-EAST     │ EU-WEST   │ Batch    │ 45 min │ ● Synced  │ 45m ago    ││
│  │  US-WEST     │ EU-WEST   │ Batch    │ 50 min │ ● Synced  │ 50m ago    ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Failover Controls                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Current Primary: US-EAST                                               ││
│  │                                                                         ││
│  │  [🔄 Failover to US-WEST]  [⏸️ Pause Replication]  [🔍 Test Failover]  ││
│  │                                                                         ││
│  │  ⚠️ Failover will redirect all traffic to US-WEST within 30 seconds    ││
│  │     Data loss risk: ~5 seconds (current replication lag)                ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Backup & Snapshots                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                                                         ││
│  │  Scheduled Backups:                                                     ││
│  │  • Full backup: Daily at 02:00 UTC → S3 (retained 30 days)             ││
│  │  • Incremental: Hourly → S3 (retained 7 days)                          ││
│  │                                                                         ││
│  │  Latest Backups:                                                        ││
│  │  │ Type       │ Time           │ Size    │ Streams │ Status           │ ││
│  │  │ Full       │ 2024-01-15 02:00│ 45 GB   │ 24      │ ✅ Verified      │ ││
│  │  │ Incremental│ 2024-01-15 10:00│ 2.3 GB  │ 24      │ ✅ Verified      │ ││
│  │  │ Incremental│ 2024-01-15 09:00│ 1.8 GB  │ 24      │ ✅ Verified      │ ││
│  │                                                                         ││
│  │  [Create Manual Backup] [Restore from Backup] [Configure Schedule]     ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Developer Experience

### 12.1 SDK & Code Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEVELOPER TOOLS & SDK                                   │
└─────────────────────────────────────────────────────────────────────────────┘

CODE GENERATOR
──────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  Code Generator                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Generate client code from your streams and schemas                          │
│                                                                              │
│  Stream: [ORDERS                    ▼]                                       │
│  Language: [TypeScript ▼] [Python ▼] [Go ▼] [Java ▼] [C# ▼]                 │
│                                                                              │
│  Options:                                                                    │
│  ☑️ Generate producer client                                                 │
│  ☑️ Generate consumer client                                                 │
│  ☑️ Generate schema types                                                    │
│  ☑️ Include validation                                                       │
│  ☐ Generate tests                                                            │
│                                                                              │
│                                                    [Generate Code]           │
│                                                                              │
│  Generated Code Preview (TypeScript)                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  // Auto-generated NATS client for ORDERS stream                        ││
│  │  // Generated at: 2024-01-15T10:45:00Z                                  ││
│  │                                                                         ││
│  │  import { connect, JetStreamClient, NatsConnection } from 'nats';       ││
│  │  import { Order, OrderSchema } from './schemas/order';                  ││
│  │                                                                         ││
│  │  export class OrdersProducer {                                          ││
│  │    private js: JetStreamClient;                                         ││
│  │                                                                         ││
│  │    constructor(private nc: NatsConnection) {                            ││
│  │      this.js = nc.jetstream();                                          ││
│  │    }                                                                    ││
│  │                                                                         ││
│  │    async publishOrderCreated(order: Order): Promise<void> {             ││
│  │      // Validate against schema                                         ││
│  │      const validated = OrderSchema.parse(order);                        ││
│  │                                                                         ││
│  │      await this.js.publish(                                             ││
│  │        `orders.created.${order.region}`,                                ││
│  │        JSON.stringify(validated),                                       ││
│  │        {                                                                ││
│  │          headers: {                                                     ││
│  │            'Content-Type': 'application/json',                          ││
│  │            'X-Schema-Version': '3',                                     ││
│  │          }                                                              ││
│  │        }                                                                ││
│  │      );                                                                 ││
│  │    }                                                                    ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  export class OrdersConsumer {                                          ││
│  │    private js: JetStreamClient;                                         ││
│  │                                                                         ││
│  │    async consume(                                                       ││
│  │      handler: (order: Order, ack: () => void) => Promise<void>         ││
│  │    ): Promise<void> {                                                   ││
│  │      const consumer = await this.js.consumers.get('ORDERS', 'my-app');  ││
│  │      const messages = await consumer.consume();                         ││
│  │                                                                         ││
│  │      for await (const msg of messages) {                                ││
│  │        const order = OrderSchema.parse(JSON.parse(msg.data));           ││
│  │        await handler(order, () => msg.ack());                           ││
│  │      }                                                                  ││
│  │    }                                                                    ││
│  │  }                                                                      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  [Copy to Clipboard] [Download as ZIP] [Push to GitHub]                     │
└─────────────────────────────────────────────────────────────────────────────┘


API PLAYGROUND
──────────────

┌─────────────────────────────────────────────────────────────────────────────┐
│  API Playground                                         [Documentation]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Test NATS operations directly from the browser                              │
│                                                                              │
│  Operation: [Publish Message ▼]                                              │
│                                                                              │
│  Stream:  [ORDERS ▼]                                                        │
│  Subject: [orders.created.us-east    ]                                      │
│                                                                              │
│  Headers:                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Content-Type: application/json                                  [+ Add]││
│  │  X-Correlation-ID: test-123                                      [+ Add]││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Payload:                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {                                                                      ││
│  │    "order_id": "ORD-2024-TEST001",                                      ││
│  │    "customer_id": "CUST-12345",                                         ││
│  │    "amount": 299.99,                                                    ││
│  │    "currency": "USD",                                                   ││
│  │    "status": "pending",                                                 ││
│  │    "items": [                                                           ││
│  │      { "sku": "SKU-001", "quantity": 2, "price": 149.99 }              ││
│  │    ]                                                                    ││
│  │  }                                                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  [Validate Schema] [Send Message] [Generate cURL] [Generate Code]           │
│                                                                              │
│  Response:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  ✅ Message published successfully                                      ││
│  │                                                                         ││
│  │  Stream: ORDERS                                                         ││
│  │  Sequence: 15234568                                                     ││
│  │  Timestamp: 2024-01-15T10:45:23.456Z                                    ││
│  │  Duplicate: false                                                       ││
│  │                                                                         ││
│  │  Latency: 12ms                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 CLI Tool

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLI TOOL DESIGN                                    │
└─────────────────────────────────────────────────────────────────────────────┘

CLI COMMAND STRUCTURE
─────────────────────

nats-console
├── auth
│   ├── login                 # Interactive login
│   ├── logout                # Clear credentials
│   ├── status                # Show auth status
│   └── token                 # Get/refresh token
├── cluster
│   ├── list                  # List all clusters
│   ├── info <name>           # Cluster details
│   ├── health <name>         # Health check
│   └── switch <name>         # Switch active cluster
├── stream
│   ├── list                  # List streams
│   ├── create <name>         # Create stream
│   ├── info <name>           # Stream details
│   ├── update <name>         # Update config
│   ├── delete <name>         # Delete stream
│   ├── purge <name>          # Purge messages
│   └── mirror <src> <dst>    # Setup mirror
├── consumer
│   ├── list <stream>         # List consumers
│   ├── create <stream>       # Create consumer
│   ├── info <stream> <name>  # Consumer details
│   ├── delete <stream> <name># Delete consumer
│   └── pause <stream> <name> # Pause consumer
├── message
│   ├── publish <subject>     # Publish message
│   ├── get <stream> <seq>    # Get message
│   ├── browse <stream>       # Browse messages
│   └── replay <stream>       # Replay messages
├── kv
│   ├── list                  # List KV buckets
│   ├── get <bucket> <key>    # Get value
│   ├── put <bucket> <key>    # Set value
│   ├── delete <bucket> <key> # Delete key
│   └── watch <bucket>        # Watch changes
├── schema
│   ├── list                  # List schemas
│   ├── register <file>       # Register schema
│   ├── validate <schema> <msg># Validate message
│   └── diff <v1> <v2>        # Compare versions
├── workflow
│   ├── list                  # List workflows
│   ├── deploy <file>         # Deploy workflow
│   ├── status <name>         # Workflow status
│   └── logs <name>           # Workflow logs
├── config
│   ├── export <stream>       # Export to YAML
│   ├── import <file>         # Import from YAML
│   ├── diff <file>           # Show diff
│   └── apply <file>          # Apply changes
└── ai
    ├── ask <question>        # Ask AI assistant
    ├── diagnose <resource>   # AI diagnostics
    └── suggest <scenario>    # Get suggestions


USAGE EXAMPLES
──────────────

# Login to console
$ nats-console auth login
? Email: user@acme.com
? Password: ********
✅ Logged in successfully

# List streams with details
$ nats-console stream list --format table
NAME            MESSAGES    STORAGE    CONSUMERS    STATUS
ORDERS          15.2M       2.3 GB     5            ● Healthy
EVENTS          89.5M       12.1 GB    12           ● Healthy
NOTIFICATIONS   5.8M        890 MB     3            ● Healthy

# Create stream from template
$ nats-console stream create payments-new \
    --template work-queue \
    --subjects "payments.>" \
    --max-bytes 100GB \
    --replicas 3

✅ Stream 'payments-new' created successfully

# Publish message
$ echo '{"order_id": "ORD-123"}' | nats-console message publish orders.created

# Browse messages interactively
$ nats-console message browse ORDERS --filter "orders.created.*" --last 10

# AI-powered diagnostics
$ nats-console ai diagnose order-processor
🤖 Analyzing consumer 'order-processor'...

Findings:
1. ⚠️ Consumer lag is 5,234 (above threshold of 1,000)
2. Processing rate decreased 40% in last hour
3. Correlated with increased DB latency

Recommendations:
1. Scale consumers from 3 to 6
2. Add connection pooling to database client
3. Enable batch processing (batch_size: 100)

Apply fix #1? [y/N]:

# Export configuration to Git
$ nats-console config export ORDERS --output ./streams/orders.yaml
✅ Exported to ./streams/orders.yaml

# Apply configuration from file
$ nats-console config apply ./streams/orders.yaml --dry-run
Changes to apply:
  Stream: ORDERS
  - maxBytes: 50GB → 100GB
  - replicas: 2 → 3

Apply changes? [y/N]:
```

---

## Summary

This comprehensive design document covers all advanced capabilities for a modern NATS JetStream management console comparable to RedPanda Console, including:

1. **Advanced Stream Management** - Lifecycle, templates, subject hierarchies
2. **Consumer Orchestration** - Groups, autoscaling, DLQ management
3. **Message Workflows** - Visual pipeline builder, routing, transforms
4. **Schema Registry** - Evolution, compatibility, data quality
5. **Stream Processing** - Real-time transforms, aggregations
6. **AI Features** - Copilot, insights, anomaly detection, query generation
7. **Self-Service Portal** - Team management, quotas, approvals
8. **GitOps Integration** - IaC, Terraform provider, drift detection
9. **Advanced Observability** - Distributed tracing, custom dashboards
10. **Data Lineage** - Catalog, impact analysis, governance
11. **Disaster Recovery** - Replication, failover, backups
12. **Developer Experience** - SDK generation, playground, CLI

This design provides a foundation for building an enterprise-grade streaming platform management console with cutting-edge AI capabilities.
