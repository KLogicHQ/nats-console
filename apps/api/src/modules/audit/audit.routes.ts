import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queryAuditLogs } from '../../lib/clickhouse';
import { authenticate } from '../../common/middleware/auth';
import { hasPermission } from '../auth/auth.service';
import { ForbiddenError } from '../../../../shared/src/index';

const QueryLogsSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  action: z.enum(['create', 'update', 'delete', 'read']).optional(),
  resourceType: z.string().optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /audit/logs - List audit logs
  fastify.get<{
    Querystring: z.infer<typeof QueryLogsSchema>;
  }>('/logs', async (request) => {
    // Check if user has permission to view audit logs (admin/owner only)
    if (!hasPermission(request.user!.permissions, 'settings', 'read')) {
      throw new ForbiddenError('You do not have permission to view audit logs');
    }

    const query = QueryLogsSchema.parse(request.query);

    const { logs, total } = await queryAuditLogs(request.user!.orgId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      action: query.action,
      resourceType: query.resourceType,
      userId: query.userId,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      logs,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + logs.length < total,
      },
    };
  });

  // GET /audit/logs/actions - Get distinct action types
  fastify.get('/logs/actions', async () => {
    return {
      actions: ['create', 'update', 'delete'],
    };
  });

  // GET /audit/logs/resource-types - Get distinct resource types
  fastify.get('/logs/resource-types', async () => {
    return {
      resourceTypes: [
        'cluster',
        'stream',
        'consumer',
        'alert_rule',
        'notification_channel',
        'dashboard',
        'organization',
        'team',
        'invite',
        'api_key',
      ],
    };
  });

  // GET /audit/logs/export - Export audit logs
  fastify.get<{
    Querystring: z.infer<typeof QueryLogsSchema> & { format?: 'json' | 'csv' };
  }>('/logs/export', async (request, reply) => {
    // Check if user has permission to view audit logs
    if (!hasPermission(request.user!.permissions, 'settings', 'read')) {
      throw new ForbiddenError('You do not have permission to export audit logs');
    }

    const { format = 'json', ...rest } = request.query;
    const query = QueryLogsSchema.parse(rest);

    const { logs } = await queryAuditLogs(request.user!.orgId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      action: query.action,
      resourceType: query.resourceType,
      userId: query.userId,
      limit: 10000, // Max export limit
      offset: 0,
    });

    if (format === 'csv') {
      const headers = [
        'timestamp',
        'action',
        'resource_type',
        'resource_name',
        'user_email',
        'ip_address',
        'status',
      ];
      const csvRows = [headers.join(',')];

      for (const log of logs) {
        const row = [
          log.timestamp,
          log.action,
          log.resourceType,
          `"${(log.resourceName || '').replace(/"/g, '""')}"`,
          log.userEmail,
          log.ipAddress,
          log.status,
        ];
        csvRows.push(row.join(','));
      }

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      return csvRows.join('\n');
    }

    // JSON format
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', 'attachment; filename="audit-logs.json"');
    return JSON.stringify(logs, null, 2);
  });
};
