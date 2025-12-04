# NATS JetStream Console - Roadmap

## Current Status: Alpha

The core infrastructure is in place with basic CRUD operations for clusters, streams, and consumers.

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

## Phase 2: Detail Views & Forms 🚧 (In Progress)

### Stream Management
- [ ] Stream detail page
  - [ ] Overview tab with stats
  - [ ] Messages tab with browser
  - [ ] Consumers tab
  - [ ] Configuration tab
  - [ ] Metrics tab with charts
- [ ] Create stream dialog/page
- [ ] Edit stream configuration
- [ ] Delete stream with confirmation
- [ ] Purge stream messages
- [ ] Message publishing interface

### Consumer Management
- [ ] Consumer detail page
  - [ ] Overview with lag visualization
  - [ ] Configuration details
  - [ ] Metrics and performance
- [ ] Create consumer dialog
- [ ] Edit consumer configuration
- [ ] Delete consumer
- [ ] Pause/Resume consumer

### Cluster Management
- [ ] Cluster detail page
  - [ ] Server info and health
  - [ ] JetStream account info
  - [ ] Connected streams overview
  - [ ] Real-time metrics
- [ ] Add cluster wizard
- [ ] Edit cluster connection
- [ ] Test connection functionality
- [ ] Cluster health monitoring

---

## Phase 3: Real-time & Monitoring

### WebSocket Integration
- [ ] WebSocket server in API
- [ ] Real-time metrics streaming
- [ ] Live message preview
- [ ] Alert notifications
- [ ] Connection status indicators

### Charts & Visualization
- [ ] Integrate charting library (Recharts/Chart.js)
- [ ] Message throughput charts
- [ ] Consumer lag visualization
- [ ] Storage usage graphs
- [ ] Historical trends

### Alert System
- [ ] Alert rule builder UI
- [ ] Condition types:
  - [ ] Consumer lag threshold
  - [ ] Message rate anomaly
  - [ ] Storage capacity
  - [ ] Connection health
- [ ] Notification channels:
  - [ ] Email notifications
  - [ ] Slack integration
  - [ ] Webhook endpoints
  - [ ] PagerDuty integration
- [ ] Alert history and acknowledgment

---

## Phase 4: Advanced Features

### Message Operations
- [ ] Message search with filters
- [ ] Message replay functionality
- [ ] Dead letter queue management
- [ ] Message schema viewer
- [ ] Export messages to JSON/CSV

### Multi-tenancy
- [ ] Organization management
- [ ] Team management
- [ ] Role-based access control (RBAC)
- [ ] Audit logging
- [ ] API key management

### Custom Dashboards
- [ ] Dashboard builder
- [ ] Widget library
- [ ] Saved queries
- [ ] Dashboard sharing
- [ ] Export to PDF

---

## Phase 5: Enterprise Features

### Security
- [ ] SSO/SAML integration
- [ ] Two-factor authentication
- [ ] IP allowlisting
- [ ] Encryption at rest
- [ ] Secrets management

### Compliance
- [ ] GDPR compliance tools
- [ ] Data retention policies
- [ ] Audit trail export
- [ ] Compliance reports

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

| Version | Target | Focus |
|---------|--------|-------|
| 0.1.0 | Current | Core MVP |
| 0.2.0 | +2 weeks | Detail views & forms |
| 0.3.0 | +4 weeks | Real-time & monitoring |
| 0.4.0 | +6 weeks | Advanced features |
| 1.0.0 | +10 weeks | Production ready |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to this project.

## Feedback

Please open issues for:
- Bug reports
- Feature requests
- Documentation improvements
- General questions
