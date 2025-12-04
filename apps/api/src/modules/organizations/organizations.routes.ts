import type { FastifyPluginAsync } from 'fastify';
import { CreateOrganizationSchema, UpdateOrganizationSchema } from '../../../../shared/src/index';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '../../../../shared/src/index';

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
};
