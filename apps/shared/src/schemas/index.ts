import { z } from 'zod';

// ==================== Enums ====================

export const OrganizationPlanSchema = z.enum(['free', 'pro', 'enterprise']);
export const UserStatusSchema = z.enum(['active', 'inactive', 'suspended']);
export const MemberRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export const ClusterEnvironmentSchema = z.enum(['development', 'staging', 'production']);
export const ClusterStatusSchema = z.enum(['connected', 'disconnected', 'degraded']);
export const HealthStatusSchema = z.enum(['healthy', 'unhealthy', 'unknown']);
export const AlertSeveritySchema = z.enum(['info', 'warning', 'critical']);
export const AlertEventStatusSchema = z.enum(['firing', 'resolved']);
export const AuditStatusSchema = z.enum(['success', 'failure', 'denied']);

// ==================== Auth Schemas ====================

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  organizationName: z.string().min(1, 'Organization name is required').max(100).optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const MfaVerifySchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits'),
});

export const MfaLoginSchema = z.object({
  mfaToken: z.string().min(1, 'MFA token is required'),
  code: z.string().length(6, 'MFA code must be 6 digits'),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email('Invalid email address').optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// ==================== User Schemas ====================

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const InviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: MemberRoleSchema,
  teamIds: z.array(z.string().uuid()).optional(),
});

// ==================== Organization Schemas ====================

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
});

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings: z.record(z.unknown()).optional(),
});

// ==================== Team Schemas ====================

export const CreateTeamSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
});

export const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});

export const AddTeamMemberSchema = z.object({
  userId: z.string().uuid(),
  role: MemberRoleSchema,
});

// ==================== Cluster Schemas ====================

export const TlsConfigSchema = z.object({
  enabled: z.boolean(),
  certFile: z.string().optional(),
  keyFile: z.string().optional(),
  caFile: z.string().optional(),
  skipVerify: z.boolean().optional(),
});

export const ClusterCredentialsSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  token: z.string().optional(),
  nkey: z.string().optional(),
  jwt: z.string().optional(),
  credsFile: z.string().optional(),
});

export const CreateClusterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  environment: ClusterEnvironmentSchema,
  serverUrl: z.string().url('Invalid server URL'),
  credentials: ClusterCredentialsSchema.optional(),
  tlsConfig: TlsConfigSchema.optional(),
});

export const UpdateClusterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  environment: ClusterEnvironmentSchema.optional(),
  credentials: ClusterCredentialsSchema.optional(),
  tlsConfig: TlsConfigSchema.optional(),
});

// ==================== Stream Schemas ====================

export const StreamPlacementSchema = z.object({
  cluster: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const StreamMirrorSchema = z.object({
  name: z.string().min(1),
  optStartSeq: z.number().int().positive().optional(),
  optStartTime: z.string().datetime().optional(),
  filterSubject: z.string().optional(),
});

export const StreamSourceSchema = z.object({
  name: z.string().min(1),
  optStartSeq: z.number().int().positive().optional(),
  optStartTime: z.string().datetime().optional(),
  filterSubject: z.string().optional(),
});

export const CreateStreamSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/, 'Name can only contain letters, numbers, underscores, and hyphens'),
  subjects: z.array(z.string().min(1)).min(1, 'At least one subject is required'),
  retention: z.enum(['limits', 'interest', 'workqueue']).default('limits'),
  maxConsumers: z.number().int().min(-1).default(-1),
  maxMsgs: z.number().int().min(-1).default(-1),
  maxBytes: z.number().int().min(-1).default(-1),
  maxAge: z.number().int().min(0).default(0), // nanoseconds
  maxMsgSize: z.number().int().min(-1).default(-1),
  storage: z.enum(['file', 'memory']).default('file'),
  replicas: z.number().int().min(1).max(5).default(1),
  noAck: z.boolean().default(false),
  discard: z.enum(['old', 'new']).default('old'),
  duplicateWindow: z.number().int().min(0).default(120000000000), // 2 min in ns
  placement: StreamPlacementSchema.optional(),
  mirror: StreamMirrorSchema.optional(),
  sources: z.array(StreamSourceSchema).optional(),
  sealed: z.boolean().optional(),
  denyDelete: z.boolean().optional(),
  denyPurge: z.boolean().optional(),
  allowRollup: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const UpdateStreamSchema = CreateStreamSchema.partial().omit({ name: true });

export const PurgeStreamSchema = z.object({
  filter: z.string().optional(),
  seq: z.number().int().positive().optional(),
  keep: z.number().int().positive().optional(),
});

export const PublishMessageSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  data: z.string(),
  headers: z.record(z.string()).optional(),
});

export const GetMessagesSchema = z.object({
  startSeq: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  subject: z.string().optional(),
});

// ==================== Consumer Schemas ====================

export const CreateConsumerSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/, 'Name can only contain letters, numbers, underscores, and hyphens'),
  durableName: z.string().optional(),
  description: z.string().max(500).optional(),
  deliverPolicy: z.enum(['all', 'last', 'new', 'byStartSequence', 'byStartTime', 'lastPerSubject']).default('all'),
  optStartSeq: z.number().int().positive().optional(),
  optStartTime: z.string().datetime().optional(),
  ackPolicy: z.enum(['none', 'all', 'explicit']).default('explicit'),
  ackWait: z.number().int().min(0).default(30000000000), // 30s in ns
  maxDeliver: z.number().int().min(-1).default(-1),
  backoff: z.array(z.number().int().min(0)).optional(),
  filterSubject: z.string().optional(),
  filterSubjects: z.array(z.string()).optional(),
  replayPolicy: z.enum(['instant', 'original']).default('instant'),
  rateLimit: z.number().int().min(0).optional(),
  sampleFreq: z.string().optional(),
  maxWaiting: z.number().int().min(0).default(512),
  maxAckPending: z.number().int().min(-1).default(1000),
  headersOnly: z.boolean().optional(),
  maxBatch: z.number().int().min(0).optional(),
  maxExpires: z.number().int().min(0).optional(),
  inactiveThreshold: z.number().int().min(0).optional(),
  numReplicas: z.number().int().min(0).max(5).default(0),
  memStorage: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const UpdateConsumerSchema = CreateConsumerSchema.partial().omit({ name: true, durableName: true });

// ==================== Dashboard Schemas ====================

export const DashboardWidgetSchema = z.object({
  id: z.string(),
  type: z.enum(['line-chart', 'bar-chart', 'gauge', 'stat', 'table', 'pie-chart']),
  title: z.string().min(1).max(100),
  position: z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
  }),
  config: z.record(z.unknown()),
});

export const CreateDashboardSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  layout: z.object({
    columns: z.number().int().min(1).max(24).default(12),
    rowHeight: z.number().int().min(20).max(200).default(80),
  }).default({ columns: 12, rowHeight: 80 }),
  widgets: z.array(DashboardWidgetSchema).default([]),
  isShared: z.boolean().default(false),
});

export const UpdateDashboardSchema = CreateDashboardSchema.partial();

// ==================== Saved Query Schemas ====================

export const CreateSavedQuerySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  query: z.string().min(1, 'Query is required'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  isShared: z.boolean().default(false),
});

export const UpdateSavedQuerySchema = CreateSavedQuerySchema.partial();

// ==================== Alert Schemas ====================

export const AlertConditionSchema = z.object({
  metric: z.string().min(1),
  operator: z.enum(['gt', 'lt', 'gte', 'lte', 'eq', 'neq']),
  window: z.number().int().min(1), // seconds
  aggregation: z.enum(['avg', 'min', 'max', 'sum', 'count']),
});

export const AlertThresholdSchema = z.object({
  value: z.number(),
  type: z.enum(['absolute', 'percentage']),
});

export const NotificationChannelTypeSchema = z.enum(['slack', 'email', 'teams', 'pagerduty', 'google_chat', 'webhook']);

export const IncidentStatusSchema = z.enum(['open', 'acknowledged', 'resolved', 'closed']);

export const CreateNotificationChannelSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: NotificationChannelTypeSchema,
  config: z.record(z.unknown()),
  isEnabled: z.boolean().default(true),
});

export const UpdateNotificationChannelSchema = CreateNotificationChannelSchema.partial();

export const CreateAlertRuleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  clusterId: z.string().uuid().optional().nullable(),
  condition: AlertConditionSchema,
  threshold: AlertThresholdSchema,
  severity: AlertSeveritySchema.default('warning'),
  channelIds: z.array(z.string().uuid()).optional(),
  isEnabled: z.boolean().default(true),
  cooldownMins: z.number().int().min(1).max(1440).default(5),
});

export const UpdateAlertRuleSchema = CreateAlertRuleSchema.partial();

// ==================== API Key Schemas ====================

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  permissions: z.array(z.string()).min(1, 'At least one permission is required'),
  expiresAt: z.string().datetime().optional().nullable(),
});

// ==================== Query Schemas ====================

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const SortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const DateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const MetricsQuerySchema = z.object({
  clusterId: z.string().uuid().optional(),
  streamName: z.string().optional(),
  consumerName: z.string().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  interval: z.enum(['1m', '5m', '15m', '1h', '6h', '1d']).default('5m'),
});

export const AuditLogQuerySchema = PaginationSchema.extend({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ==================== Type Exports ====================

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type MfaVerifyInput = z.infer<typeof MfaVerifySchema>;
export type MfaLoginInput = z.infer<typeof MfaLoginSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
export type CreateTeamInput = z.infer<typeof CreateTeamSchema>;
export type UpdateTeamInput = z.infer<typeof UpdateTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof AddTeamMemberSchema>;
export type CreateClusterInput = z.infer<typeof CreateClusterSchema>;
export type UpdateClusterInput = z.infer<typeof UpdateClusterSchema>;
export type CreateStreamInput = z.infer<typeof CreateStreamSchema>;
export type UpdateStreamInput = z.infer<typeof UpdateStreamSchema>;
export type PurgeStreamInput = z.infer<typeof PurgeStreamSchema>;
export type PublishMessageInput = z.infer<typeof PublishMessageSchema>;
export type GetMessagesInput = z.infer<typeof GetMessagesSchema>;
export type CreateConsumerInput = z.infer<typeof CreateConsumerSchema>;
export type UpdateConsumerInput = z.infer<typeof UpdateConsumerSchema>;
export type CreateDashboardInput = z.infer<typeof CreateDashboardSchema>;
export type UpdateDashboardInput = z.infer<typeof UpdateDashboardSchema>;
export type CreateSavedQueryInput = z.infer<typeof CreateSavedQuerySchema>;
export type UpdateSavedQueryInput = z.infer<typeof UpdateSavedQuerySchema>;
export type CreateNotificationChannelInput = z.infer<typeof CreateNotificationChannelSchema>;
export type UpdateNotificationChannelInput = z.infer<typeof UpdateNotificationChannelSchema>;
export type CreateAlertRuleInput = z.infer<typeof CreateAlertRuleSchema>;
export type UpdateAlertRuleInput = z.infer<typeof UpdateAlertRuleSchema>;
export type NotificationChannelType = z.infer<typeof NotificationChannelTypeSchema>;
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type MetricsQueryInput = z.infer<typeof MetricsQuerySchema>;
export type AuditLogQueryInput = z.infer<typeof AuditLogQuerySchema>;
