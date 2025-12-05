import { config } from '../config/index';
import pino from 'pino';

const logger = pino({ name: 'email-service' });

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const apiKey = config.RESEND_API_KEY;

  if (!apiKey) {
    logger.warn('RESEND_API_KEY not configured, skipping email');
    // In development, log the email content
    if (config.NODE_ENV === 'development') {
      logger.info({ ...options }, 'Email would be sent (dev mode)');
    }
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM || 'NATS Console <noreply@nats-console.local>',
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, status: response.status }, 'Failed to send email');
      return false;
    }

    logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully');
    return true;
  } catch (error) {
    logger.error({ error }, 'Error sending email');
    return false;
  }
}

export async function sendInviteEmail(
  email: string,
  inviteToken: string,
  inviterName: string,
  organizationName: string
): Promise<boolean> {
  const inviteUrl = `${config.FRONTEND_URL}/invite/${inviteToken}`;

  return sendEmail({
    to: email,
    subject: `You've been invited to join ${organizationName} on NATS Console`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>You're invited to join ${organizationName}</h2>
            <p>${inviterName} has invited you to join their organization on NATS Console.</p>
            <p>NATS Console is a management platform for NATS JetStream clusters, providing real-time monitoring, stream and consumer management, and alerting.</p>
            <a href="${inviteUrl}" class="button">Accept Invitation</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${inviteUrl}">${inviteUrl}</a></p>
            <p>This invitation will expire in 7 days.</p>
            <div class="footer">
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
              <p>NATS Console</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
You're invited to join ${organizationName}

${inviterName} has invited you to join their organization on NATS Console.

Accept the invitation: ${inviteUrl}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.
    `,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName?: string
): Promise<boolean> {
  const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${resetToken}`;

  return sendEmail({
    to: email,
    subject: 'Reset your NATS Console password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Reset your password</h2>
            <p>Hi${userName ? ` ${userName}` : ''},</p>
            <p>We received a request to reset your password for your NATS Console account.</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>This link will expire in 1 hour.</p>
            <div class="footer">
              <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
              <p>NATS Console</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Reset your password

Hi${userName ? ` ${userName}` : ''},

We received a request to reset your password for your NATS Console account.

Reset your password: ${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    `,
  });
}

export async function sendWelcomeEmail(
  email: string,
  firstName: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Welcome to NATS Console',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome to NATS Console!</h2>
            <p>Hi ${firstName},</p>
            <p>Thank you for signing up for NATS Console. We're excited to have you on board!</p>
            <p>With NATS Console, you can:</p>
            <ul>
              <li>Manage your NATS JetStream clusters</li>
              <li>Monitor streams and consumers in real-time</li>
              <li>Set up alerts for critical metrics</li>
              <li>Browse and publish messages</li>
            </ul>
            <a href="${config.FRONTEND_URL}/clusters" class="button">Get Started</a>
            <div class="footer">
              <p>If you have any questions, feel free to reach out to our support team.</p>
              <p>NATS Console</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Welcome to NATS Console!

Hi ${firstName},

Thank you for signing up for NATS Console. We're excited to have you on board!

With NATS Console, you can:
- Manage your NATS JetStream clusters
- Monitor streams and consumers in real-time
- Set up alerts for critical metrics
- Browse and publish messages

Get started: ${config.FRONTEND_URL}/clusters

If you have any questions, feel free to reach out to our support team.
    `,
  });
}
