import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { config } from '../../config/index';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../../shared/src/index';

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

const AcceptInviteSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(8),
});

export const inviteRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /invites - List pending invites for user's organizations
  fastify.get('/', { preHandler: authenticate }, async (request) => {
    const memberships = await prisma.organizationMember.findMany({
      where: {
        userId: request.user!.sub,
        role: { in: ['owner', 'admin'] },
      },
      select: { orgId: true },
    });

    const orgIds = memberships.map((m) => m.orgId);

    const invites = await prisma.invite.findMany({
      where: {
        orgId: { in: orgIds },
        status: 'pending',
      },
      include: {
        organization: { select: { id: true, name: true } },
        inviter: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { invites };
  });

  // POST /invites - Create invite
  fastify.post('/', { preHandler: authenticate }, async (request, reply) => {
    const body = CreateInviteSchema.parse(request.body);

    // Get user's organization (first one with admin/owner role)
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: request.user!.sub,
        role: { in: ['owner', 'admin'] },
      },
      include: { organization: true },
    });

    if (!membership) {
      throw new ForbiddenError('You must be an admin or owner to invite users');
    }

    // Check if user is already a member
    const existingMember = await prisma.user.findFirst({
      where: { email: body.email },
      include: {
        organizationMemberships: {
          where: { orgId: membership.orgId },
        },
      },
    });

    if (existingMember?.organizationMemberships.length) {
      throw new ConflictError('User is already a member of this organization');
    }

    // Check if there's already a pending invite
    const existingInvite = await prisma.invite.findFirst({
      where: {
        orgId: membership.orgId,
        email: body.email,
        status: 'pending',
      },
    });

    if (existingInvite) {
      throw new ConflictError('There is already a pending invite for this email');
    }

    // Create invite token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    const invite = await prisma.invite.create({
      data: {
        orgId: membership.orgId,
        email: body.email,
        role: body.role,
        token,
        invitedBy: request.user!.sub,
        expiresAt,
      },
      include: {
        organization: { select: { id: true, name: true } },
        inviter: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;

    // In dev mode, print the URL to console
    if (config.NODE_ENV === 'development') {
      console.log('\n========================================');
      console.log('📨 TEAM INVITE EMAIL (DEV MODE)');
      console.log('========================================');
      console.log(`To: ${body.email}`);
      console.log(`Organization: ${invite.organization.name}`);
      console.log(`Role: ${body.role}`);
      console.log(`Invite URL: ${inviteLink}`);
      console.log('========================================\n');
    }

    // TODO: In production, send email with invite link

    return reply.status(201).send({
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        inviteLink,
        organization: invite.organization,
        inviter: invite.inviter,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
    });
  });

  // GET /invites/:token - Get invite by token (public)
  fastify.get<{ Params: { token: string } }>('/:token', async (request) => {
    const invite = await prisma.invite.findUnique({
      where: { token: request.params.token },
      include: {
        organization: { select: { id: true, name: true } },
        inviter: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invite) {
      throw new NotFoundError('Invite', request.params.token);
    }

    if (invite.status !== 'pending') {
      return { invite: { ...invite, valid: false, reason: `Invite is ${invite.status}` } };
    }

    if (new Date() > invite.expiresAt) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      return { invite: { ...invite, valid: false, reason: 'Invite has expired' } };
    }

    return {
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        organization: invite.organization,
        inviter: invite.inviter,
        valid: true,
      },
    };
  });

  // POST /invites/:token/accept - Accept invite
  fastify.post<{ Params: { token: string } }>('/:token/accept', async (request, reply) => {
    const body = AcceptInviteSchema.parse(request.body);

    const invite = await prisma.invite.findUnique({
      where: { token: request.params.token },
      include: { organization: true },
    });

    if (!invite) {
      throw new NotFoundError('Invite', request.params.token);
    }

    if (invite.status !== 'pending') {
      throw new ConflictError(`Invite is ${invite.status}`);
    }

    if (new Date() > invite.expiresAt) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new ConflictError('Invite has expired');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
    });

    if (existingUser) {
      // User exists, just add them to the organization
      const result = await prisma.$transaction(async (tx) => {
        await tx.organizationMember.create({
          data: {
            orgId: invite.orgId,
            userId: existingUser.id,
            role: invite.role,
            invitedBy: invite.invitedBy,
          },
        });

        await tx.invite.update({
          where: { id: invite.id },
          data: { status: 'accepted', acceptedAt: new Date() },
        });

        return existingUser;
      });

      return {
        user: {
          id: result.id,
          email: result.email,
          firstName: result.firstName,
          lastName: result.lastName,
        },
        organization: invite.organization,
        isNewUser: false,
      };
    }

    // Create new user with bcrypt
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(body.password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          firstName: body.firstName,
          lastName: body.lastName,
          emailVerified: true, // Auto-verify since they came from invite
        },
      });

      await tx.organizationMember.create({
        data: {
          orgId: invite.orgId,
          userId: user.id,
          role: invite.role,
          invitedBy: invite.invitedBy,
        },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });

      return user;
    });

    return reply.status(201).send({
      user: {
        id: result.id,
        email: result.email,
        firstName: result.firstName,
        lastName: result.lastName,
      },
      organization: invite.organization,
      isNewUser: true,
    });
  });

  // DELETE /invites/:id - Revoke invite
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: authenticate }, async (request, reply) => {
    const invite = await prisma.invite.findUnique({
      where: { id: request.params.id },
    });

    if (!invite) {
      throw new NotFoundError('Invite', request.params.id);
    }

    // Check if user has permission to revoke
    const membership = await prisma.organizationMember.findFirst({
      where: {
        orgId: invite.orgId,
        userId: request.user!.sub,
        role: { in: ['owner', 'admin'] },
      },
    });

    if (!membership) {
      throw new ForbiddenError('You do not have permission to revoke this invite');
    }

    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'revoked' },
    });

    return reply.status(204).send();
  });
};
