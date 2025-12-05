import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma';
import { getCache, setCache } from '../../lib/redis';

const IP_ALLOWLIST_CACHE_TTL = 300; // 5 minutes

interface IpAllowlistConfig {
  enabled: boolean;
  allowedIps: string[];
  allowedCidrs: string[];
}

// Check if an IP matches a CIDR range
function ipMatchesCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  if (!bits) return ip === range;

  const mask = parseInt(bits, 10);
  if (isNaN(mask) || mask < 0 || mask > 32) return false;

  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
  if (ipParts.some(isNaN) || rangeParts.some(isNaN)) return false;

  const ipNum =
    (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum =
    (rangeParts[0] << 24) |
    (rangeParts[1] << 16) |
    (rangeParts[2] << 8) |
    rangeParts[3];
  const maskNum = ~((1 << (32 - mask)) - 1);

  return (ipNum & maskNum) === (rangeNum & maskNum);
}

// Get IP allowlist config for an organization
async function getIpAllowlistConfig(
  orgId: string
): Promise<IpAllowlistConfig | null> {
  // Try cache first
  const cacheKey = `ip-allowlist:${orgId}`;
  const cached = await getCache<IpAllowlistConfig>(cacheKey);
  if (cached) return cached;

  // Fetch from database
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });

  if (!org) return null;

  const settings = org.settings as Record<string, unknown>;
  const ipAllowlist = settings?.ipAllowlist as IpAllowlistConfig | undefined;

  const config: IpAllowlistConfig = {
    enabled: ipAllowlist?.enabled ?? false,
    allowedIps: ipAllowlist?.allowedIps ?? [],
    allowedCidrs: ipAllowlist?.allowedCidrs ?? [],
  };

  // Cache the config
  await setCache(cacheKey, config, IP_ALLOWLIST_CACHE_TTL);

  return config;
}

// Check if an IP is allowed for an organization
function isIpAllowed(ip: string, config: IpAllowlistConfig): boolean {
  if (!config.enabled) return true;

  // Always allow localhost
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return true;
  }

  // Check exact IP matches
  if (config.allowedIps.includes(ip)) return true;

  // Check CIDR matches
  for (const cidr of config.allowedCidrs) {
    if (ipMatchesCidr(ip, cidr)) return true;
  }

  return false;
}

// Get client IP from request
function getClientIp(request: FastifyRequest): string {
  // Check X-Forwarded-For header (for proxied requests)
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }

  // Check X-Real-IP header
  const realIp = request.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  // Fall back to socket remote address
  return request.ip;
}

// IP allowlist middleware
export async function ipAllowlistMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip if user not authenticated yet
  if (!request.user?.orgId) return;

  const config = await getIpAllowlistConfig(request.user.orgId);
  if (!config || !config.enabled) return;

  const clientIp = getClientIp(request);

  if (!isIpAllowed(clientIp, config)) {
    return reply.status(403).send({
      error: {
        code: 'IP_NOT_ALLOWED',
        message: `Access denied. Your IP address (${clientIp}) is not in the allowlist.`,
      },
    });
  }
}

// Helper to invalidate IP allowlist cache
export async function invalidateIpAllowlistCache(orgId: string): Promise<void> {
  const cacheKey = `ip-allowlist:${orgId}`;
  await setCache(cacheKey, null, 0);
}

// Validate IP allowlist configuration
export function validateIpAllowlistConfig(config: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof config !== 'object' || config === null) {
    return { valid: false, errors: ['Configuration must be an object'] };
  }

  const c = config as Record<string, unknown>;

  if (c.enabled !== undefined && typeof c.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (c.allowedIps !== undefined) {
    if (!Array.isArray(c.allowedIps)) {
      errors.push('allowedIps must be an array');
    } else {
      for (const ip of c.allowedIps) {
        if (typeof ip !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
          errors.push(`Invalid IP address: ${ip}`);
        }
      }
    }
  }

  if (c.allowedCidrs !== undefined) {
    if (!Array.isArray(c.allowedCidrs)) {
      errors.push('allowedCidrs must be an array');
    } else {
      for (const cidr of c.allowedCidrs) {
        if (typeof cidr !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(cidr)) {
          errors.push(`Invalid CIDR: ${cidr}`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
