import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../modules/auth/auth.service';
import { getSession, updateSessionActivity } from '../../lib/redis';
import type { JwtPayload } from '../../../../shared/src/index';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token);
    request.user = payload;

    // Update session activity
    const sessionId = token.split('.')[2];
    if (sessionId) {
      const session = await getSession(sessionId);
      if (session) {
        await updateSessionActivity(sessionId);
      }
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
    const payload = await verifyToken(token);
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
