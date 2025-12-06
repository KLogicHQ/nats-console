import type { FastifyPluginAsync } from 'fastify';
import { CreateOrganizationSchema, UpdateOrganizationSchema } from '@nats-console/shared';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '@nats-console/shared';

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /organizations - List user's organizations
  fastify.get('/', async (request) => {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: request.user!.sub },
      include: { organization: true },
    });

    return {
      organizations: memberships.map((m) => ({
        ...m.organization,
        role: m.role,
      })),
    };
  });

  // POST /organizations - Create organization
  fastify.post('/', async (request, reply) => {
    const body = CreateOrganizationSchema.parse(request.body);

    const organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: body.name,
          slug: body.slug,
          plan: 'free',
        },
      });

      await tx.organizationMember.create({
        data: {
          orgId: org.id,
          userId: request.user!.sub,
          role: 'owner',
        },
      });

      return org;
    });

    return reply.status(201).send({ organization });
  });

  // GET /organizations/:id - Get organization
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        orgId: request.params.id,
        userId: request.user!.sub,
      },
      include: { organization: true },
    });

    if (!membership) {
      throw new NotFoundError('Organization', request.params.id);
    }

    return { organization: membership.organization };
  });

  // PATCH /organizations/:id - Update organization
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = UpdateOrganizationSchema.parse(request.body);

    const membership = await prisma.organizationMember.findFirst({
      where: {
        orgId: request.params.id,
        userId: request.user!.sub,
        role: { in: ['owner', 'admin'] },
      },
    });

    if (!membership) {
      throw new NotFoundError('Organization', request.params.id);
    }

    const organization = await prisma.organization.update({
      where: { id: request.params.id },
      data: body,
    });

    return { organization };
  });

  // DELETE /organizations/:id - Delete organization
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const membership = await prisma.organizationMember.findFirst({
      where: {
        orgId: request.params.id,
        userId: request.user!.sub,
        role: 'owner',
      },
    });

    if (!membership) {
      throw new NotFoundError('Organization', request.params.id);
    }

    await prisma.organization.delete({
      where: { id: request.params.id },
    });

    return reply.status(204).send();
  });

  // GET /organizations/:id/members - List members
  fastify.get<{ Params: { id: string } }>('/:id/members', async (request) => {
    const members = await prisma.organizationMember.findMany({
      where: { orgId: request.params.id },
      include: { user: true },
    });

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: {
          id: m.user.id,
          email: m.user.email,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          avatarUrl: m.user.avatarUrl,
        },
      })),
    };
  });

  // PATCH /organizations/:id/members/:memberId - Update member role
  fastify.patch<{ Params: { id: string; memberId: string } }>(
    '/:id/members/:memberId',
    async (request, reply) => {
      const { role } = request.body as { role: string };

      // Verify requester is owner or admin
      const requesterMembership = await prisma.organizationMember.findFirst({
        where: {
          orgId: request.params.id,
          userId: request.user!.sub,
          role: { in: ['owner', 'admin'] },
        },
      });

      if (!requesterMembership) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'You do not have permission to update member roles' },
        });
      }

      // Find the target member
      const targetMember = await prisma.organizationMember.findUnique({
        where: { id: request.params.memberId },
      });

      if (!targetMember || targetMember.orgId !== request.params.id) {
        throw new NotFoundError('Member', request.params.memberId);
      }

      // Prevent modifying own role
      if (targetMember.userId === request.user!.sub) {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: 'You cannot change your own role' },
        });
      }

      // Prevent changing owner's role (only owner transfer is allowed)
      if (targetMember.role === 'owner') {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: 'Cannot change the role of an owner' },
        });
      }

      // Validate role
      if (!['owner', 'admin', 'member', 'viewer'].includes(role)) {
        return reply.status(400).send({
          error: { code: 'INVALID_ROLE', message: 'Invalid role specified' },
        });
      }

      // Owner transfer: only current owner can make someone else owner
      if (role === 'owner') {
        if (requesterMembership.role !== 'owner') {
          return reply.status(403).send({
            error: { code: 'FORBIDDEN', message: 'Only the owner can transfer ownership' },
          });
        }

        // Transfer ownership in a transaction:
        // 1. Make target member the new owner
        // 2. Demote current owner to admin
        const [updatedMember] = await prisma.$transaction([
          prisma.organizationMember.update({
            where: { id: request.params.memberId },
            data: { role: 'owner' },
            include: { user: true },
          }),
          prisma.organizationMember.update({
            where: { id: requesterMembership.id },
            data: { role: 'admin' },
          }),
        ]);

        return {
          member: {
            id: updatedMember.id,
            userId: updatedMember.userId,
            role: updatedMember.role,
            joinedAt: updatedMember.joinedAt,
            user: {
              id: updatedMember.user.id,
              email: updatedMember.user.email,
              firstName: updatedMember.user.firstName,
              lastName: updatedMember.user.lastName,
              avatarUrl: updatedMember.user.avatarUrl,
            },
          },
          ownershipTransferred: true,
        };
      }

      const updatedMember = await prisma.organizationMember.update({
        where: { id: request.params.memberId },
        data: { role },
        include: { user: true },
      });

      return {
        member: {
          id: updatedMember.id,
          userId: updatedMember.userId,
          role: updatedMember.role,
          joinedAt: updatedMember.joinedAt,
          user: {
            id: updatedMember.user.id,
            email: updatedMember.user.email,
            firstName: updatedMember.user.firstName,
            lastName: updatedMember.user.lastName,
            avatarUrl: updatedMember.user.avatarUrl,
          },
        },
      };
    }
  );

  // DELETE /organizations/:id/members/:memberId - Remove member
  fastify.delete<{ Params: { id: string; memberId: string } }>(
    '/:id/members/:memberId',
    async (request, reply) => {
      // Verify requester is owner or admin
      const requesterMembership = await prisma.organizationMember.findFirst({
        where: {
          orgId: request.params.id,
          userId: request.user!.sub,
          role: { in: ['owner', 'admin'] },
        },
      });

      if (!requesterMembership) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'You do not have permission to remove members' },
        });
      }

      // Find the target member
      const targetMember = await prisma.organizationMember.findUnique({
        where: { id: request.params.memberId },
      });

      if (!targetMember || targetMember.orgId !== request.params.id) {
        throw new NotFoundError('Member', request.params.memberId);
      }

      // Prevent removing self
      if (targetMember.userId === request.user!.sub) {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: 'You cannot remove yourself from the organization' },
        });
      }

      // Prevent removing owner
      if (targetMember.role === 'owner') {
        return reply.status(400).send({
          error: { code: 'INVALID_OPERATION', message: 'Cannot remove an owner from the organization' },
        });
      }

      await prisma.organizationMember.delete({
        where: { id: request.params.memberId },
      });

      return reply.status(204).send();
    }
  );
};
