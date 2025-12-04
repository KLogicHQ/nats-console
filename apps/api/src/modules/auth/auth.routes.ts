import type { FastifyPluginAsync } from 'fastify';
import {
  LoginSchema,
  RegisterSchema,
  RefreshTokenSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  MfaVerifySchema,
} from '../../../../shared/src/index';
import * as authService from './auth.service';
import { authenticate } from '../../common/middleware/auth';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/register - User registration
  fastify.post('/register', async (request, reply) => {
    const body = RegisterSchema.parse(request.body);

    const result = await authService.register({
      email: body.email,
      password: body.password,
      firstName: body.firstName,
      lastName: body.lastName,
      organizationName: body.organizationName,
    });

    return reply.status(201).send({
      user: result.user,
      tokens: result.tokens,
    });
  });

  // POST /auth/login - User login
  fastify.post('/login', async (request, reply) => {
    const body = LoginSchema.parse(request.body);

    const result = await authService.login(
      body.email,
      body.password,
      request.ip,
      request.headers['user-agent']
    );

    return {
      user: result.user,
      tokens: result.tokens,
      orgId: result.orgId,
    };
  });

  // POST /auth/logout - User logout
  fastify.post('/logout', { preHandler: authenticate }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      await authService.logout(token);
    }

    return { success: true };
  });

  // POST /auth/refresh - Refresh tokens
  fastify.post('/refresh', async (request, reply) => {
    const body = RefreshTokenSchema.parse(request.body);
    const tokens = await authService.refreshTokens(body.refreshToken);
    return { tokens };
  });

  // GET /auth/me - Get current user
  fastify.get('/me', { preHandler: authenticate }, async (request) => {
    const user = await authService.getCurrentUser(request.user!.sub);
    return { user };
  });

  // POST /auth/forgot-password - Request password reset
  fastify.post('/forgot-password', async (request, reply) => {
    const body = ForgotPasswordSchema.parse(request.body);
    await authService.requestPasswordReset(body.email);

    // Always return success to prevent email enumeration
    return { message: 'If an account exists with that email, a reset link has been sent' };
  });

  // POST /auth/reset-password - Reset password
  fastify.post('/reset-password', async (request, reply) => {
    const body = ResetPasswordSchema.parse(request.body);
    await authService.resetPassword(body.token, body.password);
    return { message: 'Password has been reset successfully' };
  });

  // POST /auth/mfa/enable - Enable MFA
  fastify.post('/mfa/enable', { preHandler: authenticate }, async (request) => {
    const result = await authService.enableMfa(request.user!.sub);
    return result;
  });

  // POST /auth/mfa/verify - Verify MFA code
  fastify.post('/mfa/verify', { preHandler: authenticate }, async (request) => {
    const body = MfaVerifySchema.parse(request.body);
    const valid = await authService.verifyMfa(request.user!.sub, body.code);
    return { valid };
  });

  // DELETE /auth/mfa/disable - Disable MFA
  fastify.delete('/mfa/disable', { preHandler: authenticate }, async (request) => {
    await authService.disableMfa(request.user!.sub);
    return { success: true };
  });
};
