import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import * as archiver from 'archiver';
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
    const user = await prisma.user.findUnique({
      where: { id: request.user!.sub },
      select: { settings: true },
    });

    const defaults = {
      emailAlerts: true,
      webhookAlerts: false,
      slackAlerts: false,
      alertDigest: 'daily',
      theme: 'system',
      dateFormat: 'relative',
    };

    const userSettings = (user?.settings as Record<string, unknown>) || {};
    const settings = { ...defaults, ...userSettings };

    return { settings };
  });

  // PATCH /settings/preferences - Update user preferences
  fastify.patch('/preferences', async (request) => {
    const body = UserSettingsSchema.parse(request.body);

    // Get current user settings
    const user = await prisma.user.findUnique({
      where: { id: request.user!.sub },
      select: { settings: true },
    });

    const currentSettings = (user?.settings as Record<string, unknown>) || {};

    // Merge with new settings (only update provided fields)
    const newSettings = { ...currentSettings };
    if (body.emailAlerts !== undefined) newSettings.emailAlerts = body.emailAlerts;
    if (body.webhookAlerts !== undefined) newSettings.webhookAlerts = body.webhookAlerts;
    if (body.slackAlerts !== undefined) newSettings.slackAlerts = body.slackAlerts;
    if (body.alertDigest !== undefined) newSettings.alertDigest = body.alertDigest;
    if (body.theme !== undefined) newSettings.theme = body.theme;
    if (body.dateFormat !== undefined) newSettings.dateFormat = body.dateFormat;

    // Save to database
    await prisma.user.update({
      where: { id: request.user!.sub },
      data: { settings: newSettings },
    });

    // Return merged settings with defaults
    const defaults = {
      emailAlerts: true,
      webhookAlerts: false,
      slackAlerts: false,
      alertDigest: 'daily',
      theme: 'system',
      dateFormat: 'relative',
    };

    return { settings: { ...defaults, ...newSettings } };
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
    const exportDate = new Date().toISOString().split('T')[0];

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
        settings: true,
      },
    });

    const organizationMemberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, plan: true, createdAt: true },
        },
      },
    });

    const teamMemberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          select: { id: true, name: true, description: true, createdAt: true },
        },
      },
    });

    const dashboards = await prisma.dashboard.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        layout: true,
        widgets: true,
        isShared: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const savedQueries = await prisma.savedQuery.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        query: true,
        isShared: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const sessions = await prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    const alertRules = await prisma.alertRule.findMany({
      where: { orgId: request.user!.orgId },
      select: {
        id: true,
        name: true,
        condition: true,
        threshold: true,
        severity: true,
        isEnabled: true,
        cooldownMins: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Create ZIP archive
    const archive = archiver.default('zip', { zlib: { level: 9 } });

    // Set response headers for ZIP download
    reply.header('Content-Type', 'application/zip');
    reply.header(
      'Content-Disposition',
      `attachment; filename="user-data-export-${exportDate}.zip"`
    );

    // Prepare files to add to the archive
    const exportMetadata = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      userId: userId,
      userEmail: user?.email,
      description: 'Complete export of user data from NATS JetStream Console',
    };

    // Add files to the archive
    archive.append(JSON.stringify(exportMetadata, null, 2), { name: 'export-info.json' });

    archive.append(JSON.stringify(user, null, 2), { name: 'profile.json' });

    archive.append(
      JSON.stringify(
        organizationMemberships.map((m) => ({
          organization: m.organization,
          role: m.role,
          joinedAt: m.joinedAt,
        })),
        null,
        2
      ),
      { name: 'organizations.json' }
    );

    archive.append(
      JSON.stringify(
        teamMemberships.map((m) => ({
          team: m.team,
          role: m.role,
          addedAt: m.addedAt,
        })),
        null,
        2
      ),
      { name: 'teams.json' }
    );

    archive.append(JSON.stringify(dashboards, null, 2), { name: 'dashboards.json' });

    archive.append(JSON.stringify(savedQueries, null, 2), { name: 'saved-queries.json' });

    archive.append(JSON.stringify(apiKeys, null, 2), { name: 'api-keys.json' });

    archive.append(JSON.stringify(sessions, null, 2), { name: 'sessions.json' });

    archive.append(JSON.stringify(alertRules, null, 2), { name: 'alert-rules.json' });

    // Add a README file
    const readme = `# NATS JetStream Console - Data Export

Exported on: ${new Date().toISOString()}
User: ${user?.email}

## Contents

This archive contains all your personal data from NATS JetStream Console:

- export-info.json    - Export metadata
- profile.json        - Your user profile information
- organizations.json  - Organizations you are a member of
- teams.json          - Teams you belong to
- dashboards.json     - Dashboards you have created
- saved-queries.json  - Saved queries you have created
- api-keys.json       - API keys you have generated (keys are hashed)
- sessions.json       - Your login sessions
- alert-rules.json    - Alert rules you have configured

## Data Retention

This export represents a snapshot of your data at the time of export.
For questions about data retention or to request data deletion,
please visit the Data Privacy section in Settings.

## About

NATS JetStream Console is developed and maintained by:

- KLogic Team (https://klogic.io)
- Atatus Team (https://www.atatus.com)

Atatus is a modern observability platform with APM, Logs, Infra, Cloud,
K8S, Security, and Database monitoring - all in one platform.

## License

NATS JetStream Console is licensed under the Apache License 2.0.
`;
    archive.append(readme, { name: 'README.txt' });

    // Finalize the archive
    archive.finalize();

    return reply.send(archive);
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
