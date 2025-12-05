import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { prisma } from '../../lib/prisma';
import { authenticate, requirePermission } from '../../common/middleware/auth';
import { NotFoundError, ForbiddenError } from '../../../../shared/src/index';
import {
  validateIpAllowlistConfig,
  invalidateIpAllowlistCache,
} from '../../common/middleware/ip-allowlist';
import { queryAuditLogs } from '../../lib/clickhouse';

// Schemas
const UserSettingsSchema = z.object({
  emailAlerts: z.boolean().optional(),
  webhookAlerts: z.boolean().optional(),
  slackAlerts: z.boolean().optional(),
  alertDigest: z.enum(['realtime', 'hourly', 'daily', 'weekly']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  dateFormat: z.enum(['relative', 'absolute', 'iso']).optional(),
});

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresIn: z.enum(['never', '30d', '90d', '1y']).optional(),
});

// IP Allowlist Schema
const IpAllowlistSchema = z.object({
  enabled: z.boolean(),
  allowedIps: z.array(z.string()).default([]),
  allowedCidrs: z.array(z.string()).default([]),
});

// Data Retention Policy Schema
const DataRetentionPolicySchema = z.object({
  metricsRetentionDays: z.number().int().min(1).max(365).default(30),
  auditLogsRetentionDays: z.number().int().min(1).max(365).default(90),
  alertEventsRetentionDays: z.number().int().min(1).max(365).default(90),
  messageSamplesRetentionDays: z.number().int().min(1).max(30).default(7),
});

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // ==================== User Settings ====================

  // GET /settings/preferences - Get user preferences
  fastify.get('/preferences', async (request) => {
    // Try to get existing settings from Redis or create defaults
    const settings = {
      emailAlerts: true,
      webhookAlerts: false,
      slackAlerts: false,
      alertDigest: 'daily',
      theme: 'system',
      dateFormat: 'relative',
    };

    // In a real implementation, you'd store this in the database or Redis
    // For now, return defaults
    return { settings };
  });

  // PATCH /settings/preferences - Update user preferences
  fastify.patch('/preferences', async (request) => {
    const body = UserSettingsSchema.parse(request.body);

    // In a real implementation, save to database/Redis
    // For now, just return the updated settings
    const settings = {
      emailAlerts: body.emailAlerts ?? true,
      webhookAlerts: body.webhookAlerts ?? false,
      slackAlerts: body.slackAlerts ?? false,
      alertDigest: body.alertDigest ?? 'daily',
      theme: body.theme ?? 'system',
      dateFormat: body.dateFormat ?? 'relative',
    };

    return { settings };
  });

  // ==================== API Keys ====================

  // GET /settings/api-keys - List API keys
  fastify.get('/api-keys', async (request) => {
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId: request.user!.sub,
        orgId: request.user!.orgId,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { apiKeys };
  });

  // POST /settings/api-keys - Create API key
  fastify.post('/api-keys', async (request, reply) => {
    const body = CreateApiKeySchema.parse(request.body);

    // Generate random API key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const prefix = rawKey.substring(0, 8);
    const keyHash = await argon2.hash(rawKey);

    // Calculate expiry
    let expiresAt: Date | null = null;
    if (body.expiresIn && body.expiresIn !== 'never') {
      const now = new Date();
      switch (body.expiresIn) {
        case '30d':
          expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        orgId: request.user!.orgId,
        userId: request.user!.sub,
        name: body.name,
        keyHash,
        prefix,
        permissions: [],
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Return the full key only on creation (won't be shown again)
    return reply.status(201).send({
      apiKey: {
        ...apiKey,
        key: `nats_${rawKey}`, // Full key with prefix
      },
    });
  });

  // DELETE /settings/api-keys/:id - Delete API key
  fastify.delete<{ Params: { id: string } }>('/api-keys/:id', async (request, reply) => {
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: request.params.id,
        userId: request.user!.sub,
        orgId: request.user!.orgId,
      },
    });

    if (!apiKey) {
      throw new NotFoundError('API key', request.params.id);
    }

    await prisma.apiKey.delete({
      where: { id: request.params.id },
    });

    return reply.status(204).send();
  });

  // ==================== Security Settings (Admin Only) ====================

  // GET /settings/security/ip-allowlist - Get IP allowlist config
  fastify.get('/security/ip-allowlist', async (request) => {
    // Only admins/owners can view security settings
    if (!['owner', 'admin'].includes(request.user!.role)) {
      throw new ForbiddenError('Only admins can view security settings');
    }

    const org = await prisma.organization.findUnique({
      where: { id: request.user!.orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};
    const ipAllowlist = settings.ipAllowlist || {
      enabled: false,
      allowedIps: [],
      allowedCidrs: [],
    };

    return { ipAllowlist };
  });

  // PUT /settings/security/ip-allowlist - Update IP allowlist config
  fastify.put('/security/ip-allowlist', async (request) => {
    // Only admins/owners can update security settings
    if (!['owner', 'admin'].includes(request.user!.role)) {
      throw new ForbiddenError('Only admins can update security settings');
    }

    const body = IpAllowlistSchema.parse(request.body);

    // Validate the configuration
    const validation = validateIpAllowlistConfig(body);
    if (!validation.valid) {
      return { error: { code: 'INVALID_CONFIG', message: validation.errors.join(', ') } };
    }

    // Get current settings and merge
    const org = await prisma.organization.findUnique({
      where: { id: request.user!.orgId },
      select: { settings: true },
    });

    const currentSettings = (org?.settings as Record<string, unknown>) || {};
    const newSettings = {
      ...currentSettings,
      ipAllowlist: body,
    };

    await prisma.organization.update({
      where: { id: request.user!.orgId },
      data: { settings: newSettings },
    });

    // Invalidate cache
    await invalidateIpAllowlistCache(request.user!.orgId);

    return { ipAllowlist: body };
  });

  // ==================== Data Retention Policies ====================

  // GET /settings/compliance/retention - Get data retention policies
  fastify.get('/compliance/retention', async (request) => {
    if (!['owner', 'admin'].includes(request.user!.role)) {
      throw new ForbiddenError('Only admins can view compliance settings');
    }

    const org = await prisma.organization.findUnique({
      where: { id: request.user!.orgId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};
    const retention = settings.dataRetention || {
      metricsRetentionDays: 30,
      auditLogsRetentionDays: 90,
      alertEventsRetentionDays: 90,
      messageSamplesRetentionDays: 7,
    };

    return { retention };
  });

  // PUT /settings/compliance/retention - Update data retention policies
  fastify.put('/compliance/retention', async (request) => {
    if (!['owner', 'admin'].includes(request.user!.role)) {
      throw new ForbiddenError('Only admins can update compliance settings');
    }

    const body = DataRetentionPolicySchema.parse(request.body);

    const org = await prisma.organization.findUnique({
      where: { id: request.user!.orgId },
      select: { settings: true },
    });

    const currentSettings = (org?.settings as Record<string, unknown>) || {};
    const newSettings = {
      ...currentSettings,
      dataRetention: body,
    };

    await prisma.organization.update({
      where: { id: request.user!.orgId },
      data: { settings: newSettings },
    });

    return { retention: body };
  });

  // ==================== Audit Trail Export ====================

  // GET /settings/compliance/audit-export - Export audit logs
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      action?: string;
      format?: 'json' | 'csv';
    };
  }>('/compliance/audit-export', async (request, reply) => {
    if (!['owner', 'admin'].includes(request.user!.role)) {
      throw new ForbiddenError('Only admins can export audit logs');
    }

    const { from, to, action, format = 'json' } = request.query;

    const result = await queryAuditLogs(request.user!.orgId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      action,
      limit: 10000, // Max export size
    });

    if (format === 'csv') {
      const headers = [
        'id',
        'timestamp',
        'action',
        'resourceType',
        'resourceId',
        'resourceName',
        'userEmail',
        'ipAddress',
        'status',
      ];

      const csvRows = [headers.join(',')];
      for (const log of result.logs) {
        csvRows.push(
          [
            log.id,
            log.timestamp.toISOString(),
            log.action,
            log.resourceType,
            log.resourceId,
            log.resourceName,
            log.userEmail,
            log.ipAddress,
            log.status,
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
        );
      }

      reply.header('Content-Type', 'text/csv');
      reply.header(
        'Content-Disposition',
        `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`
      );
      return csvRows.join('\n');
    }

    reply.header('Content-Type', 'application/json');
    reply.header(
      'Content-Disposition',
      `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.json"`
    );
    return { logs: result.logs, total: result.total, exportedAt: new Date() };
  });

  // ==================== GDPR Compliance ====================

  // GET /settings/gdpr/export - Export user data (GDPR right to data portability)
  fastify.get('/gdpr/export', async (request, reply) => {
    const userId = request.user!.sub;

    // Gather all user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        emailVerified: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const organizationMemberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    const teamMemberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          select: { id: true, name: true },
        },
      },
    });

    const dashboards = await prisma.dashboard.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const savedQueries = await prisma.savedQuery.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        query: true,
        createdAt: true,
      },
    });

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    const exportData = {
      exportedAt: new Date(),
      user,
      organizationMemberships: organizationMemberships.map((m) => ({
        organization: m.organization,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      teamMemberships: teamMemberships.map((m) => ({
        team: m.team,
        role: m.role,
        addedAt: m.addedAt,
      })),
      dashboards,
      savedQueries,
      apiKeys,
    };

    reply.header('Content-Type', 'application/json');
    reply.header(
      'Content-Disposition',
      `attachment; filename="user-data-export-${new Date().toISOString().split('T')[0]}.json"`
    );
    return exportData;
  });

  // DELETE /settings/gdpr/delete-account - Delete user account (GDPR right to erasure)
  fastify.delete('/gdpr/delete-account', async (request, reply) => {
    const userId = request.user!.sub;

    // Check if user is the only owner of any organization
    const ownerships = await prisma.organizationMember.findMany({
      where: { userId, role: 'owner' },
      include: {
        organization: {
          include: {
            members: {
              where: { role: 'owner' },
            },
          },
        },
      },
    });

    for (const ownership of ownerships) {
      if (ownership.organization.members.length === 1) {
        return reply.status(400).send({
          error: {
            code: 'CANNOT_DELETE_SOLE_OWNER',
            message: `You are the only owner of organization "${ownership.organization.name}". Please transfer ownership or delete the organization first.`,
          },
        });
      }
    }

    // Delete user and cascade (relationships are set up with onDelete: Cascade)
    await prisma.user.delete({
      where: { id: userId },
    });

    return reply.status(200).send({
      message: 'Your account and all associated data have been deleted.',
    });
  });

  // ==================== Compliance Reports ====================

  // GET /settings/compliance/report - Generate compliance report
  fastify.get('/compliance/report', async (request) => {
    if (!['owner', 'admin'].includes(request.user!.role)) {
      throw new ForbiddenError('Only admins can view compliance reports');
    }

    const orgId = request.user!.orgId;

    // Get organization info
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        slug: true,
        plan: true,
        settings: true,
        createdAt: true,
      },
    });

    // Count users
    const userCount = await prisma.organizationMember.count({
      where: { orgId },
    });

    // Count users with 2FA enabled
    const mfaEnabledCount = await prisma.user.count({
      where: {
        organizationMemberships: { some: { orgId } },
        mfaEnabled: true,
      },
    });

    // Count API keys
    const apiKeyCount = await prisma.apiKey.count({
      where: { orgId },
    });

    // Count active sessions (from database)
    const activeSessionCount = await prisma.session.count({
      where: {
        user: { organizationMemberships: { some: { orgId } } },
        expiresAt: { gt: new Date() },
      },
    });

    // Get settings
    const settings = (org?.settings as Record<string, unknown>) || {};
    const ipAllowlist = settings.ipAllowlist as { enabled?: boolean } | undefined;
    const dataRetention = settings.dataRetention as Record<string, number> | undefined;

    const report = {
      generatedAt: new Date(),
      organization: {
        name: org?.name,
        slug: org?.slug,
        plan: org?.plan,
        createdAt: org?.createdAt,
      },
      security: {
        totalUsers: userCount,
        mfaEnabledUsers: mfaEnabledCount,
        mfaAdoptionRate: userCount > 0 ? Math.round((mfaEnabledCount / userCount) * 100) : 0,
        ipAllowlistEnabled: ipAllowlist?.enabled ?? false,
        activeApiKeys: apiKeyCount,
        activeSessions: activeSessionCount,
      },
      dataRetention: {
        metricsRetentionDays: dataRetention?.metricsRetentionDays ?? 30,
        auditLogsRetentionDays: dataRetention?.auditLogsRetentionDays ?? 90,
        alertEventsRetentionDays: dataRetention?.alertEventsRetentionDays ?? 90,
        messageSamplesRetentionDays: dataRetention?.messageSamplesRetentionDays ?? 7,
      },
      recommendations: [] as string[],
    };

    // Generate recommendations
    if (report.security.mfaAdoptionRate < 100) {
      report.recommendations.push(
        `${100 - report.security.mfaAdoptionRate}% of users don't have 2FA enabled. Consider enforcing 2FA for all users.`
      );
    }
    if (!report.security.ipAllowlistEnabled) {
      report.recommendations.push(
        'IP allowlist is not enabled. Consider enabling it to restrict access to trusted IP addresses.'
      );
    }

    return { report };
  });
};
