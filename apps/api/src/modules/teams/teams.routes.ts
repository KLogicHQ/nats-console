import type { FastifyPluginAsync } from 'fastify';
import { CreateTeamSchema, UpdateTeamSchema, AddTeamMemberSchema } from '../../../../shared/src/index';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../common/middleware/auth';
import { NotFoundError } from '../../../../shared/src/index';

export const teamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /teams - List teams
  fastify.get('/', async (request) => {
    const teams = await prisma.team.findMany({
      where: { orgId: request.user!.orgId },
      include: { _count: { select: { members: true } } },
    });

    return {
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        memberCount: t._count.members,
        createdAt: t.createdAt,
      })),
    };
  });

  // POST /teams - Create team
  fastify.post('/', async (request, reply) => {
    const body = CreateTeamSchema.parse(request.body);

    const team = await prisma.team.create({
      data: {
        orgId: request.user!.orgId,
        name: body.name,
        description: body.description,
      },
    });

    // Add creator as team admin
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: request.user!.sub,
        role: 'admin',
      },
    });

    return reply.status(201).send({ team });
  });

  // GET /teams/:id - Get team
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const team = await prisma.team.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!team) {
      throw new NotFoundError('Team', request.params.id);
    }

    return { team };
  });

  // PATCH /teams/:id - Update team
  fastify.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = UpdateTeamSchema.parse(request.body);

    const team = await prisma.team.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!team) {
      throw new NotFoundError('Team', request.params.id);
    }

    const updated = await prisma.team.update({
      where: { id: request.params.id },
      data: body,
    });

    return { team: updated };
  });

  // DELETE /teams/:id - Delete team
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const team = await prisma.team.findFirst({
      where: {
        id: request.params.id,
        orgId: request.user!.orgId,
      },
    });

    if (!team) {
      throw new NotFoundError('Team', request.params.id);
    }

    await prisma.team.delete({
      where: { id: request.params.id },
    });

    return reply.status(204).send();
  });

  // GET /teams/:id/members - List team members
  fastify.get<{ Params: { id: string } }>('/:id/members', async (request) => {
    const members = await prisma.teamMember.findMany({
      where: { teamId: request.params.id },
      include: { user: true },
    });

    return {
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        addedAt: m.addedAt,
        user: {
          id: m.user.id,
          email: m.user.email,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
        },
      })),
    };
  });

  // POST /teams/:id/members - Add team member
  fastify.post<{ Params: { id: string } }>('/:id/members', async (request, reply) => {
    const body = AddTeamMemberSchema.parse(request.body);

    await prisma.teamMember.create({
      data: {
        teamId: request.params.id,
        userId: body.userId,
        role: body.role,
      },
    });

    return reply.status(201).send({ success: true });
  });

  // DELETE /teams/:id/members/:uid - Remove team member
  fastify.delete<{ Params: { id: string; uid: string } }>(
    '/:id/members/:uid',
    async (request, reply) => {
      await prisma.teamMember.deleteMany({
        where: {
          teamId: request.params.id,
          userId: request.params.uid,
        },
      });

      return reply.status(204).send();
    }
  );
};
