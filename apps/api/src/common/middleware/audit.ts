import type { FastifyRequest, FastifyReply } from 'fastify';
import { insertAuditLog } from '../../lib/clickhouse';
import pino from 'pino';

const logger = pino({ name: 'audit-middleware' });

// Map HTTP methods to actions
const METHOD_ACTION_MAP: Record<string, string> = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

// Routes that should be audited (patterns)
const AUDITED_ROUTES: Array<{
  pattern: RegExp;
  resourceType: string;
  extractResourceInfo: (url: string, body?: unknown) => { resourceId?: string; resourceName?: string };
}> = [
  {
    pattern: /^\/clusters\/([^/]+)$/,
    resourceType: 'cluster',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/clusters\/([^/]+)$/);
      return { resourceId: match?.[1] };
    },
  },
  {
    pattern: /^\/clusters\/([^/]+)\/streams\/([^/]+)$/,
    resourceType: 'stream',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/clusters\/([^/]+)\/streams\/([^/]+)$/);
      return { resourceId: match?.[1], resourceName: match?.[2] };
    },
  },
  {
    pattern: /^\/clusters\/([^/]+)\/streams$/,
    resourceType: 'stream',
    extractResourceInfo: (_url, body) => {
      const b = body as { name?: string } | undefined;
      return { resourceName: b?.name };
    },
  },
  {
    pattern: /^\/clusters\/([^/]+)\/streams\/([^/]+)\/consumers\/([^/]+)$/,
    resourceType: 'consumer',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/clusters\/([^/]+)\/streams\/([^/]+)\/consumers\/([^/]+)$/);
      return { resourceId: match?.[1], resourceName: match?.[3] };
    },
  },
  {
    pattern: /^\/clusters\/([^/]+)\/streams\/([^/]+)\/consumers$/,
    resourceType: 'consumer',
    extractResourceInfo: (_url, body) => {
      const b = body as { name?: string } | undefined;
      return { resourceName: b?.name };
    },
  },
  {
    pattern: /^\/alerts\/rules\/([^/]+)$/,
    resourceType: 'alert_rule',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/alerts\/rules\/([^/]+)$/);
      return { resourceId: match?.[1] };
    },
  },
  {
    pattern: /^\/alerts\/channels\/([^/]+)$/,
    resourceType: 'notification_channel',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/alerts\/channels\/([^/]+)$/);
      return { resourceId: match?.[1] };
    },
  },
  {
    pattern: /^\/dashboards\/([^/]+)$/,
    resourceType: 'dashboard',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/dashboards\/([^/]+)$/);
      return { resourceId: match?.[1] };
    },
  },
  {
    pattern: /^\/organizations\/([^/]+)$/,
    resourceType: 'organization',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/organizations\/([^/]+)$/);
      return { resourceId: match?.[1] };
    },
  },
  {
    pattern: /^\/teams\/([^/]+)$/,
    resourceType: 'team',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/teams\/([^/]+)$/);
      return { resourceId: match?.[1] };
    },
  },
  {
    pattern: /^\/invites$/,
    resourceType: 'invite',
    extractResourceInfo: (_url, body) => {
      const b = body as { email?: string } | undefined;
      return { resourceName: b?.email };
    },
  },
  {
    pattern: /^\/settings\/api-keys\/([^/]+)$/,
    resourceType: 'api_key',
    extractResourceInfo: (url) => {
      const match = url.match(/^\/settings\/api-keys\/([^/]+)$/);
      return { resourceId: match?.[1] };
    },
  },
];

// Skip audit for read operations (GET) except for specific sensitive endpoints
const SKIP_READ_AUDIT = true;

interface AuditInfo {
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  clusterId?: string;
}

function getAuditInfo(url: string, body?: unknown): AuditInfo | null {
  // Remove /api/v1 prefix if present
  const path = url.replace(/^\/api\/v1/, '');

  for (const route of AUDITED_ROUTES) {
    if (route.pattern.test(path)) {
      const info = route.extractResourceInfo(path, body);

      // Extract cluster ID from URL if present
      const clusterMatch = path.match(/^\/clusters\/([^/]+)/);

      return {
        resourceType: route.resourceType,
        resourceId: info.resourceId,
        resourceName: info.resourceName,
        clusterId: clusterMatch?.[1],
      };
    }
  }

  return null;
}

export async function auditLogger(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip if no user (unauthenticated request)
  if (!request.user) {
    return;
  }

  const method = request.method;
  const action = METHOD_ACTION_MAP[method] || method.toLowerCase();

  // Skip read operations if configured
  if (SKIP_READ_AUDIT && action === 'read') {
    return;
  }

  // Get audit info for this route
  const auditInfo = getAuditInfo(request.url, request.body);
  if (!auditInfo) {
    return;
  }

  // Add hook to log after response
  reply.addHook('onSend', async (_request, _reply, payload) => {
    try {
      const statusCode = reply.statusCode;
      const status = statusCode >= 200 && statusCode < 400 ? 'success' : 'failure';

      await insertAuditLog({
        orgId: request.user!.orgId,
        userId: request.user!.sub,
        userEmail: request.user!.email,
        timestamp: new Date(),
        action,
        resourceType: auditInfo.resourceType,
        resourceId: auditInfo.resourceId || '',
        resourceName: auditInfo.resourceName || '',
        clusterId: auditInfo.clusterId || null,
        ipAddress: request.ip || '',
        userAgent: request.headers['user-agent'] || '',
        requestId: request.id,
        changes: method !== 'GET' && request.body ? request.body as Record<string, unknown> : {},
        status,
        errorMessage: status === 'failure' && typeof payload === 'string'
          ? JSON.parse(payload)?.error?.message
          : undefined,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to insert audit log');
    }

    return payload;
  });
}

// Fastify plugin for audit logging
export async function auditPlugin(fastify: any): Promise<void> {
  fastify.addHook('preHandler', auditLogger);
}
