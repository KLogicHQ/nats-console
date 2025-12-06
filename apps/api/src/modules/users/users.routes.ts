import type { FastifyPluginAsync } from 'fastify';
import { UpdateUserSchema, InviteUserSchema } from '@nats-console/shared';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '@nats-console/shared';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /users - List users in organization
  fastify.get('/', async (request) => {
    const members = await prisma.organizationMember.findMany({
      where: { orgId: request.user!.orgId },
      include: { user: true },
    });

    return {
      users: members.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        avatarUrl: m.user.avatarUrl,
        status: m.user.status,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  });

  // GET /users/:id - Get user
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        orgId: request.user!.orgId,
        userId: request.params.id,
      },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundError('User', request.params.id);
    }

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
        avatarUrl: membership.user.avatarUrl,
        status: membership.user.status,
        role: membership.role,
      },
    };
  });

  // PATCH /users/:id - Update user
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = UpdateUserSchema.parse(request.body);

    // Can only update self or if admin
    if (request.params.id !== request.user!.sub) {
      const membership = await prisma.organizationMember.findFirst({
        where: {
          orgId: request.user!.orgId,
          userId: request.user!.sub,
          role: { in: ['owner', 'admin'] },
        },
      });

      if (!membership) {
        throw new NotFoundError('User', request.params.id);
      }
    }

    const user = await prisma.user.update({
      where: { id: request.params.id },
      data: body,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        status: user.status,
      },
    };
  });

  // POST /users/invite - Invite user
  fastify.post('/invite', async (request, reply) => {
    const body = InviteUserSchema.parse(request.body);

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user) {
      // Create placeholder user
      user = await prisma.user.create({
        data: {
          email: body.email.toLowerCase(),
          passwordHash: '', // Will be set on registration
          status: 'inactive',
        },
      });
    }

    // Check if already a member
    const existingMembership = await prisma.organizationMember.findFirst({
      where: {
        orgId: request.user!.orgId,
        userId: user.id,
      },
    });

    if (existingMembership) {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: 'User is already a member' },
      });
    }

    // Create membership
    await prisma.organizationMember.create({
      data: {
        orgId: request.user!.orgId,
        userId: user.id,
        role: body.role,
        invitedBy: request.user!.sub,
      },
    });

    // TODO: Send invitation email

    return reply.status(201).send({ success: true });
  });
};
