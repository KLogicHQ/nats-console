// ==================== Time Utilities ====================

export const NS_PER_MS = 1_000_000;
export const NS_PER_SEC = 1_000_000_000;
export const NS_PER_MIN = NS_PER_SEC * 60;
export const NS_PER_HOUR = NS_PER_MIN * 60;
export const NS_PER_DAY = NS_PER_HOUR * 24;

export function msToNs(ms: number): number {
  return ms * NS_PER_MS;
}

export function nsToMs(ns: number): number {
  return Math.floor(ns / NS_PER_MS);
}

export function secToNs(sec: number): number {
  return sec * NS_PER_SEC;
}

export function nsToSec(ns: number): number {
  return Math.floor(ns / NS_PER_SEC);
}

export function formatDuration(ns: number): string {
  if (ns < NS_PER_SEC) {
    return `${nsToMs(ns)}ms`;
  }
  if (ns < NS_PER_MIN) {
    return `${nsToSec(ns)}s`;
  }
  if (ns < NS_PER_HOUR) {
    return `${Math.floor(ns / NS_PER_MIN)}m`;
  }
  if (ns < NS_PER_DAY) {
    return `${Math.floor(ns / NS_PER_HOUR)}h`;
  }
  return `${Math.floor(ns / NS_PER_DAY)}d`;
}

export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const value = parseInt(match[1]!, 10);
  const unit = match[2];
  switch (unit) {
    case 'ms':
      return msToNs(value);
    case 's':
      return secToNs(value);
    case 'm':
      return value * NS_PER_MIN;
    case 'h':
      return value * NS_PER_HOUR;
    case 'd':
      return value * NS_PER_DAY;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

// ==================== Byte Utilities ====================

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(decimals)} ${BYTE_UNITS[i]}`;
}

export function parseBytes(str: string): number {
  const match = str.match(/^([\d.]+)\s*(B|KB|MB|GB|TB|PB)?$/i);
  if (!match) {
    throw new Error(`Invalid byte format: ${str}`);
  }
  const value = parseFloat(match[1]!);
  const unit = (match[2] || 'B').toUpperCase();
  const index = BYTE_UNITS.indexOf(unit);
  if (index === -1) {
    throw new Error(`Unknown byte unit: ${unit}`);
  }
  return Math.floor(value * Math.pow(1024, index));
}

// ==================== Number Formatting ====================

export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

export function formatRate(rate: number, unit = '/s'): string {
  return `${formatNumber(rate)}${unit}`;
}

// ==================== String Utilities ====================

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function generateId(): string {
  return crypto.randomUUID();
}

// ==================== Date Utilities ====================

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }
  return date.toLocaleDateString();
}

// ==================== NATS Subject Utilities ====================

export function isValidSubject(subject: string): boolean {
  if (!subject || subject.length === 0) return false;
  // NATS subjects can contain alphanumeric, dots, asterisks, and greater-than
  return /^[a-zA-Z0-9._*>-]+$/.test(subject);
}

export function matchSubject(pattern: string, subject: string): boolean {
  // Convert NATS pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]+')
    .replace(/>/g, '.*');
  return new RegExp(`^${regexPattern}$`).test(subject);
}

// ==================== Permission Utilities ====================

export function parsePermission(permission: string): {
  resource: string;
  action: string;
  scope: string;
} {
  const parts = permission.split(':');
  return {
    resource: parts[0] || '*',
    action: parts[1] || '*',
    scope: parts[2] || '*',
  };
}

export function hasPermission(
  userPermissions: string[],
  requiredResource: string,
  requiredAction: string
): boolean {
  return userPermissions.some((perm) => {
    const { resource, action } = parsePermission(perm);
    const resourceMatch = resource === '*' || resource === requiredResource;
    const actionMatch = action === '*' || action === requiredAction;
    return resourceMatch && actionMatch;
  });
}

// ==================== Error Utilities ====================

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} with id ${id} not found` : `${resource} not found`,
      404
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}
