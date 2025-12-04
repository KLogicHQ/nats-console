# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NATS JetStream Console is an enterprise-grade web management platform for NATS JetStream clusters. The project is currently in the design phase - see DESIGN.md for comprehensive system design documentation.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+, React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand |
| Backend | Node.js, Fastify, tRPC |
| Databases | PostgreSQL (app data), ClickHouse (analytics/time-series), Redis (cache/sessions) |
| AI | Claude API with RAG |

## Architecture

### Service Layer
- **Auth Service**: JWT/sessions, OAuth/OIDC, RBAC engine, user management
- **Core API Service**: Streams, consumers, messages, cluster operations CRUD
- **Analytics Service**: Query engine, aggregations, dashboards, reports
- **Background Workers**: Metrics collector, alert processor, audit logger, sync/cleanup jobs

### Data Layer
- **PostgreSQL**: Users, orgs, teams, permissions, cluster configs, API keys, sessions, dashboards, alert rules
- **ClickHouse**: Time-series metrics (stream_metrics, consumer_metrics, cluster_metrics), message_samples, audit_logs, alert_events. Uses MergeTree with TTL-based retention.
- **Redis**: Session management, rate limiting, API key cache, cluster status cache, real-time pub/sub for metrics

### Communication
- REST/GraphQL for frontend-to-API
- Internal gRPC/NATS between services
- WebSocket at `/ws/v1/realtime` for live metrics and alerts
- NATS JetStream for background job processing (dogfooding)

## API Structure

Base URL: `/api/v1`

Key endpoint groups:
- `/auth/*` - Authentication, OAuth/SSO, MFA
- `/users/*`, `/organizations/*`, `/teams/*` - User management
- `/clusters/*` - NATS cluster connections
- `/clusters/{cid}/streams/*` - Stream CRUD and messages
- `/clusters/{cid}/streams/{sid}/consumers/*` - Consumer management
- `/clusters/{cid}/kv/*`, `/clusters/{cid}/objects/*` - KV and object stores
- `/analytics/*`, `/dashboards/*` - Metrics and visualization
- `/alerts/*`, `/audit/*` - Alerting and audit logs
- `/roles/*`, `/permissions/*`, `/api-keys/*` - RBAC

## Key Design Decisions

- Multi-tenant with organization → team → user hierarchy
- RBAC with resource-level permissions stored in PostgreSQL
- ClickHouse for analytics with materialized views for hourly/daily aggregations
- Redis pub/sub channels for real-time metric streaming to UI
- All cluster credentials encrypted at rest (JSONB with encryption)
