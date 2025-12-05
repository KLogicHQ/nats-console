import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '../../../../shared/src/index';

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
};
