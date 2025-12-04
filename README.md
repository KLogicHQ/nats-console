# NATS JetStream Console

A modern, enterprise-grade web console for managing NATS JetStream clusters. Built with Next.js, Node.js, and TypeScript, featuring AI-powered insights and a developer-friendly experience inspired by RedPanda Console and Confluent Control Center.

## What is it?

NATS JetStream Console is a comprehensive management platform that provides full visibility and control over your NATS JetStream infrastructure. It combines powerful stream management capabilities with AI-assisted operations, making it easier to build, monitor, and troubleshoot event-driven architectures at scale.

## Key Features

### Stream & Consumer Management
- Visual stream lifecycle management with templates
- Consumer groups, autoscaling, and health monitoring
- Dead letter queue browser with retry capabilities
- Message browser with real-time streaming and JSON/Avro parsing

### AI-Powered Operations
- Natural language queries ("Why is my consumer lagging?")
- Automated root cause analysis and diagnostics
- Configuration generation from plain English descriptions
- Predictive capacity planning and anomaly detection
- Schema inference from message samples

### Data Governance
- Integrated schema registry (Avro, JSON Schema, Protobuf)
- Schema evolution with compatibility checking
- Data quality rules and validation
- Full data lineage and impact analysis

### Workflow & Processing
- Visual drag-and-drop pipeline builder
- Message routing, filtering, and transformations
- Fan-out and stream mirroring configuration
- Real-time aggregation pipelines

### Enterprise Ready
- RBAC with SSO/SAML integration
- Team namespaces with quota management
- Approval workflows for production changes
- Complete audit logging to ClickHouse

### GitOps & IaC
- Git-based configuration management
- Terraform provider for infrastructure as code
- Drift detection and auto-remediation
- CI/CD pipeline integration

### Observability
- Real-time metrics dashboards
- Distributed tracing across message flows
- Custom dashboard builder
- Alerting with Slack, PagerDuty, webhooks

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+, React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Fastify, tRPC |
| Databases | PostgreSQL (app data), ClickHouse (analytics), Redis (cache) |
| AI | Claude API integration with RAG |

## Benefits

**For Platform Teams**
- Centralized control plane for all NATS clusters
- Self-service portal reduces operational burden
- Policy enforcement and governance at scale

**For Developers**
- Intuitive UI eliminates CLI complexity
- SDK and code generation accelerates development
- API playground for rapid prototyping

**For Operations**
- AI diagnostics reduce MTTR significantly
- Predictive alerts prevent outages
- One-click remediation for common issues

**For Business**
- Full audit trail for compliance
- Cost visibility and optimization recommendations
- Reduced time-to-market for streaming applications

## Quick Links

- [Architecture Overview](./docs/architecture.md)
- [API Documentation](./docs/api.md)
- [Deployment Guide](./docs/deployment.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

Built with ❤️ for the NATS community
