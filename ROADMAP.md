# NATS JetStream Console - Roadmap

## Current Status: Beta (v0.5.0)

Phases 1-5 are complete. The application now includes full CRUD operations, detailed management views, metrics charts, real-time WebSocket updates, alert system with notification channels, message search/export/replay, multi-tenancy features (RBAC, API keys, audit logging, 2FA), custom dashboards, and enterprise features (IP allowlisting, data retention policies, audit trail export, GDPR compliance tools, and compliance reports).

---

## Phase 1: Core MVP ✅ (Completed)

### Infrastructure
- [x] Monorepo setup with pnpm workspaces and Turborepo
- [x] Docker Compose for local development (PostgreSQL, Redis, ClickHouse, NATS)
- [x] Shared package with types, schemas, and utilities
- [x] Makefile for common operations

### Backend API
- [x] Fastify server with TypeScript
- [x] Prisma ORM with PostgreSQL
- [x] Redis for sessions and caching
- [x] ClickHouse for time-series metrics
- [x] Authentication (JWT, refresh tokens)
- [x] NATS client with connection pooling
- [x] Basic CRUD for clusters, streams, consumers

### Workers
- [x] Metrics collector (stream, consumer, cluster metrics)
- [x] Alert processor skeleton
- [x] NATS JetStream for internal job queues

### Frontend
- [x] Next.js 15 with App Router
- [x] shadcn/ui components
- [x] Authentication pages (login, register)
- [x] Dashboard layout with sidebar
- [x] Basic list views for all entities

---

## Phase 2: Detail Views & Forms ✅ (Completed)

### Stream Management
- [x] Stream detail page
  - [x] Overview tab with stats
  - [x] Messages tab with browser (pagination, JSON formatting, copy, expand/collapse)
  - [x] Consumers tab
  - [x] Configuration tab
  - [x] Metrics tab with charts (message throughput, data throughput)
- [x] Create stream dialog
- [x] Edit stream configuration
- [x] Delete stream with confirmation
- [x] Purge stream messages
- [x] Message publishing interface

### Consumer Management
- [x] Consumer detail page
  - [x] Overview with lag visualization (progress bars)
  - [x] Configuration details
  - [x] Metrics tab with charts (lag, pending, ack rate)
- [x] Create consumer dialog
- [x] Edit consumer configuration
- [x] Delete consumer with confirmation
- [x] Pause/Resume consumer

### Cluster Management
- [x] Cluster detail page
  - [x] Server info and health
  - [x] JetStream account info
  - [x] Connected streams overview
  - [x] Metrics tab with gauge charts (memory, connections, storage)
- [x] Add cluster wizard
- [x] Edit cluster connection
- [x] Test connection functionality
- [x] Cluster health monitoring

---

## Phase 3: Real-time & Monitoring ✅ (Completed)

### WebSocket Integration
- [x] WebSocket server in API
- [x] Real-time metrics streaming via Redis pub/sub
- [x] Live message preview
- [x] Alert notifications (real-time via WebSocket)
- [x] Connection status indicators in UI

### Charts & Visualization
- [x] Integrate charting library (ECharts)
- [x] Message throughput charts
- [x] Consumer lag visualization
- [x] Storage usage graphs (gauge charts)
- [x] Historical trends (via ClickHouse time-series)

### Alert System
- [x] Alert rule builder UI
- [x] Condition types:
  - [x] Consumer lag threshold
  - [x] Message rate anomaly
  - [x] Storage capacity
  - [x] Connection health
- [x] Notification channels:
  - [x] Email notifications (via Resend)
  - [x] Slack integration
  - [x] Webhook endpoints
  - [x] PagerDuty integration
  - [x] Microsoft Teams integration
  - [x] Google Chat integration
- [x] Alert history and acknowledgment
- [x] Incident management (create, acknowledge, resolve, close)

---

## Phase 4: Advanced Features ✅ (Completed)

### Message Operations
- [x] Message search with filters
- [x] Message replay functionality
- [ ] Dead letter queue management
- [ ] Message schema viewer
- [x] Export messages to JSON/CSV

### Multi-tenancy
- [x] Organization management
- [x] Team management
- [x] Role-based access control (RBAC)
- [x] Audit logging
- [x] API key management

### Custom Dashboards
- [x] Dashboard builder
- [x] Widget library
- [ ] Saved queries
- [ ] Dashboard sharing
- [ ] Export to PDF

---

## Phase 5: Enterprise Features ✅ (Completed)

### Security
- [ ] SSO/SAML integration
- [x] Two-factor authentication
- [x] IP allowlisting
- [ ] Encryption at rest
- [ ] Secrets management

### Compliance
- [x] GDPR compliance tools
- [x] Data retention policies
- [x] Audit trail export
- [x] Compliance reports

### Scaling
- [ ] Multi-region support
- [ ] Horizontal API scaling
- [ ] Read replicas
- [ ] Caching optimization

### Operations
- [ ] Backup and restore
- [ ] Migration tools
- [ ] CLI tool
- [ ] Terraform provider
- [ ] Kubernetes operator

---

## Phase 6: Ecosystem

### Integrations
- [ ] Prometheus metrics export
- [ ] Grafana dashboard templates
- [ ] OpenTelemetry tracing
- [ ] DataDog integration
- [ ] CloudWatch integration

### Developer Experience
- [ ] API documentation (OpenAPI)
- [ ] SDK generation
- [ ] Postman collection
- [ ] Interactive API explorer
- [ ] Code examples

### Community
- [ ] Public Docker image
- [ ] Helm chart
- [ ] Documentation site
- [ ] Video tutorials
- [ ] Community forum

---

## Technical Debt & Improvements

### Performance
- [ ] Query optimization
- [ ] Connection pooling tuning
- [ ] Lazy loading for large lists
- [ ] Virtual scrolling
- [ ] Image optimization

### Code Quality
- [ ] Unit test coverage > 80%
- [ ] E2E tests with Playwright
- [ ] API integration tests
- [ ] Storybook for components
- [ ] Documentation

### DevOps
- [ ] CI/CD pipeline
- [ ] Automated releases
- [ ] Docker multi-stage builds
- [ ] Health check endpoints
- [ ] Graceful shutdown

---

## Release Schedule

| Version | Status | Focus |
|---------|--------|-------|
| 0.1.0 | ✅ Complete | Core MVP |
| 0.2.0 | ✅ Complete | Detail views & forms |
| 0.3.0 | ✅ Complete | Real-time & monitoring |
| 0.4.0 | ✅ Complete | Advanced features |
| 0.5.0 | ✅ Current | Enterprise features |
| 1.0.0 | Planned | Production ready |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Feedback

Please open issues for:
- Bug reports
- Feature requests
- Documentation improvements
- General questions
