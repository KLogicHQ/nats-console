import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { prisma } from '../../lib/prisma';
import { redis, setSession, getSession, deleteSession } from '../../lib/redis';
import { config } from '../../config/index';
import { sendPasswordResetEmail } from '../../lib/email';
import {
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '@nats-console/shared';
import type { User, AuthTokens, JwtPayload } from '@nats-console/shared';

const JWT_SECRET = new TextEncoder().encode(config.JWT_SECRET);

// ==================== RBAC Permissions ====================

// Permission format: resource:action:scope
// Resources: clusters, streams, consumers, alerts, dashboards, settings, users, teams
// Actions: read, write, delete, admin
// Scope: * (all) or specific ID

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['*:*:*'], // Full access to everything
  admin: [
    'clusters:*:*',
    'streams:*:*',
    'consumers:*:*',
    'alerts:*:*',
    'dashboards:*:*',
    'settings:read:*',
    'settings:write:*',
    'users:read:*',
    'users:write:*',
    'teams:*:*',
  ],
  member: [
    'clusters:read:*',
    'streams:read:*',
    'streams:write:*',
    'consumers:read:*',
    'consumers:write:*',
    'alerts:read:*',
    'dashboards:read:*',
    'dashboards:write:own',
    'settings:read:*',
  ],
  viewer: [
    'clusters:read:*',
    'streams:read:*',
    'consumers:read:*',
    'alerts:read:*',
    'dashboards:read:*',
  ],
};

export function getPermissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}

export function hasPermission(permissions: string[], resource: string, action: string, scope: string = '*'): boolean {
  return permissions.some((perm) => {
    const [permResource, permAction, permScope] = perm.split(':');

    // Check resource match (wildcard or exact)
    const resourceMatch = permResource === '*' || permResource === resource;

    // Check action match (wildcard or exact)
    const actionMatch = permAction === '*' || permAction === action;

    // Check scope match (wildcard or exact)
    const scopeMatch = permScope === '*' || permScope === scope || permScope === 'own';

    return resourceMatch && actionMatch && scopeMatch;
  });
}

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
    user: { ...mapUser(result.user), role: 'owner' },
    tokens,
    orgId: result.organization.id,
  };
}

// ==================== User Login ====================

export interface LoginResult {
  user: User;
  tokens: AuthTokens;
  orgId: string;
  mfaRequired?: false;
}

export interface LoginMfaRequired {
  mfaRequired: true;
  mfaToken: string;
  userId: string;
}

export async function login(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResult | LoginMfaRequired> {
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

  // Check if MFA is enabled
  if (user.mfaEnabled && user.mfaSecret) {
    // Generate a temporary MFA token
    const mfaToken = await new SignJWT({ sub: user.id, type: 'mfa_pending', orgId: membership.orgId, role: membership.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m') // MFA token valid for 5 minutes
      .sign(JWT_SECRET);

    // Store pending MFA in Redis
    await redis.set(`mfa_pending:${user.id}`, mfaToken, 'EX', 300);

    return {
      mfaRequired: true,
      mfaToken,
      userId: user.id,
    };
  }

  // No MFA required, complete login
  return completeLogin(user, membership, ipAddress);
}

export async function loginWithMfa(
  mfaToken: string,
  code: string,
  ipAddress?: string
): Promise<LoginResult> {
  // Verify MFA token
  let payload: any;
  try {
    const result = await jwtVerify(mfaToken, JWT_SECRET);
    payload = result.payload;
  } catch {
    throw new UnauthorizedError('Invalid or expired MFA token');
  }

  if (payload.type !== 'mfa_pending') {
    throw new UnauthorizedError('Invalid MFA token');
  }

  // Verify the token is still valid in Redis
  const storedToken = await redis.get(`mfa_pending:${payload.sub}`);
  if (storedToken !== mfaToken) {
    throw new UnauthorizedError('MFA token has expired or been used');
  }

  // Get user
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      organizationMemberships: {
        include: {
          organization: true,
        },
        take: 1,
      },
    },
  });

  if (!user || !user.mfaSecret) {
    throw new UnauthorizedError('Invalid user or MFA not configured');
  }

  // Verify TOTP code
  const totp = new OTPAuth.TOTP({
    issuer: 'NATS Console',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
  });

  const delta = totp.validate({ token: code, window: 1 });

  if (delta === null) {
    throw new UnauthorizedError('Invalid MFA code');
  }

  // Delete the pending MFA token
  await redis.del(`mfa_pending:${payload.sub}`);

  const membership = user.organizationMemberships[0];
  if (!membership) {
    throw new UnauthorizedError('User has no organization membership');
  }

  // Complete login
  return completeLogin(user, membership, ipAddress);
}

async function completeLogin(
  user: any,
  membership: any,
  ipAddress?: string
): Promise<LoginResult> {
  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const tokens = await generateTokens(user.id, user.email, membership.orgId, membership.role);

  // Get permissions based on role
  const permissions = getPermissionsForRole(membership.role);

  // Store session in Redis
  await setSession(tokens.accessToken.split('.')[2]!, {
    userId: user.id,
    orgId: membership.orgId,
    email: user.email,
    role: membership.role,
    permissions,
    ipAddress: ipAddress || '',
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  });

  return {
    user: { ...mapUser(user), role: membership.role },
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

  // Send password reset email
  const userName = user.firstName || undefined;
  await sendPasswordResetEmail(email, resetToken, userName);
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User', userId);
  }

  // Generate a new TOTP secret
  const totp = new OTPAuth.TOTP({
    issuer: 'NATS Console',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromHex(crypto.randomUUID().replace(/-/g, '')),
  });

  const secret = totp.secret.base32;

  // Generate QR code
  const otpauthUrl = totp.toString();
  const qrCode = await QRCode.toDataURL(otpauthUrl);

  // Store secret temporarily (not enabled yet until verified)
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: secret },
  });

  return { secret, qrCode };
}

export async function verifyMfa(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || !user.mfaSecret) {
    throw new ValidationError('MFA not set up for this user');
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'NATS Console',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
  });

  // Validate the code (allow 1 period window for clock drift)
  const delta = totp.validate({ token: code, window: 1 });

  if (delta === null) {
    return false;
  }

  // If MFA was not yet enabled, enable it now (first successful verification)
  if (!user.mfaEnabled) {
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
  }

  return true;
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

// ==================== Profile Updates ====================

export async function updateProfile(
  userId: string,
  data: { firstName?: string; lastName?: string; email?: string }
): Promise<User> {
  // If email is being changed, check for conflicts
  if (data.email) {
    const existingUser = await prisma.user.findFirst({
      where: {
        email: data.email.toLowerCase(),
        id: { not: userId },
      },
    });
    if (existingUser) {
      throw new ConflictError('Email is already in use');
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.firstName && { firstName: data.firstName }),
      ...(data.lastName && { lastName: data.lastName }),
      ...(data.email && { email: data.email.toLowerCase() }),
    },
  });

  return mapUser(user);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  const isValidPassword = await verifyPassword(user.passwordHash, currentPassword);
  if (!isValidPassword) {
    throw new ValidationError('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

// ==================== Helpers ====================

async function generateTokens(
  userId: string,
  email: string,
  orgId: string,
  role: string
): Promise<AuthTokens> {
  const permissions = getPermissionsForRole(role);

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
