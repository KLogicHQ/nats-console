// ==================== Enums ====================

export type OrganizationPlan = 'free' | 'pro' | 'enterprise';
export type UserStatus = 'active' | 'inactive' | 'suspended';
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ClusterEnvironment = 'development' | 'staging' | 'production';
export type ClusterStatus = 'connected' | 'disconnected' | 'degraded';
export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertEventStatus = 'firing' | 'resolved';
export type AuditStatus = 'success' | 'failure' | 'denied';

// ==================== User & Organization ====================

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrganizationPlan;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  orgId: string;
  userId: string;
  role: MemberRole;
  invitedBy: string | null;
  joinedAt: Date;
  user?: User;
}

export interface Team {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: MemberRole;
  addedAt: Date;
  user?: User;
}

// ==================== NATS Cluster ====================

export interface NatsCluster {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  environment: ClusterEnvironment;
  status: ClusterStatus;
  version: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClusterConnection {
  id: string;
  clusterId: string;
  serverUrl: string;
  credentials: EncryptedCredentials | null;
  tlsConfig: TlsConfig | null;
  isPrimary: boolean;
  healthStatus: HealthStatus;
  lastHealthCheck: Date | null;
}

export interface EncryptedCredentials {
  username?: string;
  password?: string;
  token?: string;
  nkey?: string;
  jwt?: string;
  credsFile?: string;
}

export interface TlsConfig {
  enabled: boolean;
  certFile?: string;
  keyFile?: string;
  caFile?: string;
  skipVerify?: boolean;
}

// ==================== Streams & Consumers ====================

export interface StreamConfig {
  id: string;
  clusterId: string;
  streamName: string;
  configSnapshot: NatsStreamConfig;
  createdBy: string;
  isManaged: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NatsStreamConfig {
  name: string;
  subjects: string[];
  retention: 'limits' | 'interest' | 'workqueue';
  maxConsumers: number;
  maxMsgs: number;
  maxBytes: number;
  maxAge: number; // nanoseconds
  maxMsgSize: number;
  storage: 'file' | 'memory';
  replicas: number;
  noAck: boolean;
  discard: 'old' | 'new';
  duplicateWindow: number; // nanoseconds
  placement?: {
    cluster?: string;
    tags?: string[];
  };
  mirror?: {
    name: string;
    optStartSeq?: number;
    optStartTime?: string;
    filterSubject?: string;
  };
  sources?: Array<{
    name: string;
    optStartSeq?: number;
    optStartTime?: string;
    filterSubject?: string;
  }>;
  sealed?: boolean;
  denyDelete?: boolean;
  denyPurge?: boolean;
  allowRollup?: boolean;
}

export interface ConsumerConfig {
  id: string;
  streamConfigId: string;
  consumerName: string;
  configSnapshot: NatsConsumerConfig;
  createdBy: string;
  isManaged: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NatsConsumerConfig {
  name: string;
  durableName?: string;
  description?: string;
  deliverPolicy: 'all' | 'last' | 'new' | 'byStartSequence' | 'byStartTime' | 'lastPerSubject';
  optStartSeq?: number;
  optStartTime?: string;
  ackPolicy: 'none' | 'all' | 'explicit';
  ackWait: number; // nanoseconds
  maxDeliver: number;
  backoff?: number[]; // nanoseconds
  filterSubject?: string;
  filterSubjects?: string[];
  replayPolicy: 'instant' | 'original';
  rateLimit?: number;
  sampleFreq?: string;
  maxWaiting: number;
  maxAckPending: number;
  headersOnly?: boolean;
  maxBatch?: number;
  maxExpires?: number; // nanoseconds
  inactiveThreshold?: number; // nanoseconds
  numReplicas: number;
  memStorage?: boolean;
}

// ==================== Stream/Consumer Info (Runtime) ====================

export interface StreamInfo {
  config: NatsStreamConfig;
  created: Date;
  state: StreamState;
  cluster?: ClusterInfo;
  mirror?: StreamSourceInfo;
  sources?: StreamSourceInfo[];
}

export interface StreamState {
  messages: number;
  bytes: number;
  firstSeq: number;
  firstTs: Date;
  lastSeq: number;
  lastTs: Date;
  numSubjects: number;
  subjects?: Record<string, number>;
  numDeleted: number;
  deleted?: number[];
  consumerCount: number;
}

export interface ClusterInfo {
  name: string;
  leader: string;
  replicas?: PeerInfo[];
}

export interface PeerInfo {
  name: string;
  current: boolean;
  offline: boolean;
  active: number;
  lag: number;
}

export interface StreamSourceInfo {
  name: string;
  lag: number;
  active: number;
  filterSubject?: string;
  error?: string;
}

export interface ConsumerInfo {
  name: string;
  streamName: string;
  created: Date;
  config: NatsConsumerConfig;
  delivered: SequenceInfo;
  ackFloor: SequenceInfo;
  numAckPending: number;
  numRedelivered: number;
  numWaiting: number;
  numPending: number;
  cluster?: ClusterInfo;
  pushBound?: boolean;
}

export interface SequenceInfo {
  consumerSeq: number;
  streamSeq: number;
  lastActive?: Date;
}

// ==================== Messages ====================

export interface StreamMessage {
  subject: string;
  sequence: number;
  time: Date;
  data: string;
  headers?: Record<string, string[]>;
  redelivered?: boolean;
}

// ==================== Roles & Permissions ====================

export interface Role {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  roleId: string;
  resource: string;
  action: string;
  conditions: Record<string, unknown> | null;
}

// ==================== API Keys & Sessions ====================

export interface ApiKey {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  prefix: string;
  permissions: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
}

// ==================== Dashboards & Alerts ====================

export interface Dashboard {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  layout: DashboardLayout;
  widgets: DashboardWidget[];
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardLayout {
  columns: number;
  rowHeight: number;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'stat' | 'table' | 'text';
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

export interface SavedQuery {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  query: string;
  description: string | null;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertRule {
  id: string;
  orgId: string;
  clusterId: string | null;
  name: string;
  condition: AlertCondition;
  threshold: AlertThreshold;
  severity: AlertSeverity;
  channels: AlertChannel[];
  isEnabled: boolean;
  cooldownMins: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
  window: number; // seconds
  aggregation: 'avg' | 'min' | 'max' | 'sum' | 'count';
}

export interface AlertThreshold {
  value: number;
  type: 'absolute' | 'percentage';
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'pagerduty' | 'webhook';
  config: Record<string, unknown>;
}

// ==================== Metrics (ClickHouse) ====================

export interface StreamMetrics {
  clusterId: string;
  streamName: string;
  timestamp: Date;
  messagesTotal: number;
  bytesTotal: number;
  messagesRate: number;
  bytesRate: number;
  consumerCount: number;
  firstSeq: number;
  lastSeq: number;
  subjects: string[];
}

export interface ConsumerMetrics {
  clusterId: string;
  streamName: string;
  consumerName: string;
  timestamp: Date;
  pendingCount: number;
  ackPending: number;
  redelivered: number;
  waiting: number;
  deliveredRate: number;
  ackRate: number;
  lag: number;
}

export interface ClusterMetrics {
  clusterId: string;
  serverId: string;
  serverName: string;
  timestamp: Date;
  cpuPercent: number;
  memoryBytes: number;
  connections: number;
  subscriptions: number;
  slowConsumers: number;
  inMsgs: number;
  outMsgs: number;
  inBytes: number;
  outBytes: number;
}

// ==================== Audit Log ====================

export interface AuditLog {
  id: string;
  orgId: string;
  userId: string;
  userEmail: string;
  timestamp: Date;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  clusterId: string | null;
  ipAddress: string;
  userAgent: string;
  requestId: string;
  changes: string;
  status: AuditStatus;
  errorMessage: string | null;
}

// ==================== API Response Types ====================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ==================== Auth Types ====================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  orgId: string;
  role: MemberRole;
  permissions: string[];
  iat: number;
  exp: number;
}

// ==================== WebSocket Types ====================

export interface WsMessage {
  type: string;
  data: unknown;
}

export interface WsSubscribe {
  type: 'subscribe';
  channels: string[];
}

export interface WsUnsubscribe {
  type: 'unsubscribe';
  channels: string[];
}

export interface WsClusterStatus {
  type: 'cluster_status';
  clusterId: string;
  data: {
    status: ClusterStatus;
    servers: Array<{ name: string; connected: boolean }>;
    timestamp: string;
  };
}

export interface WsStreamMetrics {
  type: 'stream_metrics';
  clusterId: string;
  streamName: string;
  data: {
    messages: number;
    bytes: number;
    rate: number;
    consumers: number;
    timestamp: string;
  };
}

export interface WsConsumerMetrics {
  type: 'consumer_metrics';
  clusterId: string;
  streamName: string;
  consumerName: string;
  data: {
    pending: number;
    lag: number;
    ackRate: number;
    timestamp: string;
  };
}

export interface WsAlert {
  type: 'alert';
  data: {
    id: string;
    ruleId: string;
    severity: AlertSeverity;
    message: string;
    timestamp: string;
  };
}
