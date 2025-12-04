import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '../../lib/prisma.js';
import { redis, setSession, getSession, deleteSession } from '../../lib/redis.js';
import { config } from '../../config/index.js';
import {
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '@nats-console/shared';
import type { User, AuthTokens, JwtPayload } from '@nats-console/shared';

const JWT_SECRET = new TextEncoder().encode(config.JWT_SECRET);

// ==================== Password Hashing ====================

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// ==================== JWT Operations ====================

export async function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_ACCESS_EXPIRY)
    .sign(JWT_SECRET);
}

export async function generateRefreshToken(userId: string): Promise<string> {
  const payload = { sub: userId, type: 'refresh' };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_REFRESH_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

// ==================== User Registration ====================

export async function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName?: string;
}): Promise<{ user: User; tokens: AuthTokens }> {
  const { email, password, firstName, lastName, organizationName } = data;

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (existingUser) {
    throw new ConflictError('User with this email already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user and organization in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        status: 'active',
        emailVerified: false,
      },
    });

    // Create default organization
    const orgName = organizationName || `${firstName}'s Organization`;
    const orgSlug = generateSlug(orgName);

    const organization = await tx.organization.create({
      data: {
        name: orgName,
        slug: orgSlug,
        plan: 'free',
      },
    });

    // Add user as owner of organization
    await tx.organizationMember.create({
      data: {
        orgId: organization.id,
        userId: user.id,
        role: 'owner',
      },
    });

    // Create default roles for organization
    const adminRole = await tx.role.create({
      data: {
        orgId: organization.id,
        name: 'Admin',
        description: 'Full access to all resources',
        isSystem: true,
      },
    });

    await tx.permission.create({
      data: {
        roleId: adminRole.id,
        resource: '*',
        action: '*',
      },
    });

    const viewerRole = await tx.role.create({
      data: {
        orgId: organization.id,
        name: 'Viewer',
        description: 'Read-only access to resources',
        isSystem: true,
      },
    });

    await tx.permission.create({
      data: {
        roleId: viewerRole.id,
        resource: '*',
        action: 'read',
      },
    });

    return { user, organization };
  });

  // Generate tokens
  const tokens = await generateTokens(result.user.id, result.user.email, result.organization.id, 'owner');

  return {
    user: mapUser(result.user),
    tokens,
  };
}

// ==================== User Login ====================

export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ user: User; tokens: AuthTokens; orgId: string }> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      organizationMemberships: {
        include: {
          organization: true,
        },
        take: 1, // Get first organization
      },
    },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.status !== 'active') {
    throw new UnauthorizedError('Account is not active');
  }

  const isValidPassword = await verifyPassword(user.passwordHash, password);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const membership = user.organizationMemberships[0];
  if (!membership) {
    throw new UnauthorizedError('User has no organization membership');
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const tokens = await generateTokens(user.id, user.email, membership.orgId, membership.role);

  // Store session in Redis
  await setSession(tokens.accessToken.split('.')[2]!, {
    userId: user.id,
    orgId: membership.orgId,
    email: user.email,
    role: membership.role,
    permissions: ['*:*:*'], // TODO: Fetch actual permissions
    ipAddress: ipAddress || '',
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  });

  return {
    user: mapUser(user),
    tokens,
    orgId: membership.orgId,
  };
}

// ==================== Token Refresh ====================

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const payload = await verifyToken(refreshToken);

  if ((payload as any).type !== 'refresh') {
    throw new UnauthorizedError('Invalid refresh token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      organizationMemberships: {
        take: 1,
      },
    },
  });

  if (!user || user.status !== 'active') {
    throw new UnauthorizedError('User not found or inactive');
  }

  const membership = user.organizationMemberships[0];
  if (!membership) {
    throw new UnauthorizedError('User has no organization membership');
  }

  return generateTokens(user.id, user.email, membership.orgId, membership.role);
}

// ==================== Logout ====================

export async function logout(accessToken: string): Promise<void> {
  const sessionId = accessToken.split('.')[2];
  if (sessionId) {
    await deleteSession(sessionId);
  }
}

// ==================== Get Current User ====================

export async function getCurrentUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  return mapUser(user);
}

// ==================== Password Reset ====================

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    // Don't reveal if user exists
    return;
  }

  // Generate reset token
  const resetToken = await new SignJWT({ sub: user.id, type: 'password_reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(JWT_SECRET);

  // Store in Redis with 1 hour TTL
  await redis.set(`password_reset:${user.id}`, resetToken, 'EX', 3600);

  // TODO: Send email with reset link
  console.log(`Password reset token for ${email}: ${resetToken}`);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const payload = await verifyToken(token);

  if ((payload as any).type !== 'password_reset') {
    throw new UnauthorizedError('Invalid reset token');
  }

  // Verify token is still valid in Redis
  const storedToken = await redis.get(`password_reset:${payload.sub}`);
  if (storedToken !== token) {
    throw new UnauthorizedError('Reset token has expired or been used');
  }

  // Update password
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: payload.sub },
    data: { passwordHash },
  });

  // Delete reset token
  await redis.del(`password_reset:${payload.sub}`);
}

// ==================== MFA ====================

export async function enableMfa(userId: string): Promise<{ secret: string; qrCode: string }> {
  // TODO: Implement TOTP generation with speakeasy
  throw new Error('MFA not implemented yet');
}

export async function verifyMfa(userId: string, code: string): Promise<boolean> {
  // TODO: Implement TOTP verification
  throw new Error('MFA not implemented yet');
}

export async function disableMfa(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
    },
  });
}

// ==================== Helpers ====================

async function generateTokens(
  userId: string,
  email: string,
  orgId: string,
  role: string
): Promise<AuthTokens> {
  // TODO: Fetch actual permissions from database
  const permissions = ['*:*:*'];

  const accessToken = await generateAccessToken({
    sub: userId,
    email,
    orgId,
    role: role as any,
    permissions,
  });

  const refreshToken = await generateRefreshToken(userId);

  return {
    accessToken,
    refreshToken,
    expiresIn: parseExpiry(config.JWT_ACCESS_EXPIRY),
  };
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)(m|h|d)$/);
  if (!match) return 900; // Default 15 minutes

  const value = parseInt(match[1]!);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 900;
  }
}

function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Add random suffix to ensure uniqueness
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${baseSlug}-${suffix}`;
}

function mapUser(user: any): User {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
