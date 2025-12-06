import type { FastifyRequest, FastifyReply } from 'fastify';
import * as argon2 from 'argon2';
import { verifyToken as verifyJwtToken, getPermissionsForRole } from '../../modules/auth/auth.service';
import { getSession, updateSessionActivity } from '../../lib/redis';
import { prisma } from '../../lib/prisma';
import type { JwtPayload } from '@nats-console/shared';

// Re-export verifyToken for use by other modules (e.g., websocket)
export { verifyJwtToken as verifyToken };

// Extend FastifyRequest to include user and apiKeyId
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
    apiKeyId?: string;
  }
}

// Check if the token is an API key (starts with nats_)
function isApiKey(token: string): boolean {
  return token.startsWith('nats_');
}

// Validate API key and return user context
async function validateApiKey(
  apiKey: string
): Promise<{ payload: JwtPayload; keyId: string } | null> {
  // Extract the actual key (remove nats_ prefix)
  const rawKey = apiKey.slice(5);
  const prefix = rawKey.substring(0, 8);

  // Find API keys with matching prefix
  const candidates = await prisma.apiKey.findMany({
    where: {
      prefix,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      user: {
        include: {
          organizationMemberships: {
            take: 1,
          },
        },
      },
    },
  });

  // Verify the key hash
  for (const candidate of candidates) {
    try {
      const isValid = await argon2.verify(candidate.keyHash, rawKey);
      if (isValid) {
        // Update last used timestamp
        await prisma.apiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        });

        const membership = candidate.user.organizationMemberships[0];
        if (!membership) {
          return null;
        }

        // Build JWT-like payload for API key
        const permissions =
          candidate.permissions.length > 0
            ? candidate.permissions
            : getPermissionsForRole(membership.role);

        return {
          payload: {
            sub: candidate.userId,
            email: candidate.user.email,
            orgId: membership.orgId,
            role: membership.role as 'owner' | 'admin' | 'member' | 'viewer',
            permissions,
          },
          keyId: candidate.id,
        };
      }
    } catch {
      // Hash verification failed, continue to next candidate
    }
  }

  return null;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

  // Check for API key in X-API-Key header first
  if (apiKeyHeader && isApiKey(apiKeyHeader)) {
    const result = await validateApiKey(apiKeyHeader);
    if (result) {
      request.user = result.payload;
      request.apiKeyId = result.keyId;
      return;
    }
    return reply.status(401).send({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid or expired API key',
      },
    });
  }

  // Check for Bearer token (could be JWT or API key)
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
    });
  }

  const token = authHeader.slice(7);

  // Check if it's an API key
  if (isApiKey(token)) {
    const result = await validateApiKey(token);
    if (result) {
      request.user = result.payload;
      request.apiKeyId = result.keyId;
      return;
    }
    return reply.status(401).send({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid or expired API key',
      },
    });
  }

  // Regular JWT token
  try {
    const payload = await verifyJwtToken(token);
    request.user = payload;

    // Validate session in Redis and update activity
    const sessionId = token.split('.')[2];
    if (sessionId) {
      const session = await getSession(sessionId);
      if (!session) {
        // Session not found in Redis - user was logged out or session expired
        return reply.status(401).send({
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Session has expired. Please log in again.',
          },
        });
      }
      await updateSessionActivity(sessionId);
    }
  } catch (error) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    });
  }
}

export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return; // No auth, continue without user
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyJwtToken(token);
    request.user = payload;
  } catch {
    // Invalid token, continue without user
  }
}

export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);

    if (!request.user) {
      return; // Already handled by authenticate
    }

    const userPermissions = request.user.permissions || [];

    // Check if user has any of the required permissions
    const hasPermission = permissions.some((required) => {
      return userPermissions.some((userPerm) => {
        return matchPermission(userPerm, required);
      });
    });

    if (!hasPermission) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        },
      });
    }
  };
}

function matchPermission(userPermission: string, requiredPermission: string): boolean {
  const [userResource, userAction, userScope] = userPermission.split(':');
  const [reqResource, reqAction, reqScope] = requiredPermission.split(':');

  // Check resource
  if (userResource !== '*' && userResource !== reqResource) {
    return false;
  }

  // Check action
  if (userAction !== '*' && userAction !== reqAction) {
    return false;
  }

  // Check scope
  if (userScope !== '*' && userScope !== reqScope) {
    return false;
  }

  return true;
}
