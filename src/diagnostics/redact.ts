import type { RedactionClass } from './types';

const MAX_TRUNCATED_LENGTH = 500;
const OMITTED_VALUE = '[omitted]';
const SENSITIVE_KEY_PATTERN = /token|password|pgn|fen|cookie|auth|secret/i;

const STATIC_ROUTE_SEGMENTS = new Set([
  'account',
  'accounts',
  'admin',
  'analysis',
  'auth',
  'feedback',
  'games',
  'home',
  'import',
  'openings',
  'puzzles',
  'settings',
  'showcase',
  'stats',
  'study',
  'sync',
]);

function truncate(value: string, maxLength = MAX_TRUNCATED_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function deterministicHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sanitizeSegment(segment: string): string {
  if (!segment || STATIC_ROUTE_SEGMENTS.has(segment.toLowerCase())) {
    return segment;
  }

  if (/^[a-z0-9_-]+$/i.test(segment) && (/\d/.test(segment) || segment.length >= 8)) {
    return ':id';
  }

  return segment;
}

export function scrubByClass(value: string, cls: RedactionClass): string {
  switch (cls) {
    case 'safe':
      return value;
    case 'truncate':
      return truncate(value);
    case 'hash':
      return deterministicHash(value);
    case 'omit':
      return OMITTED_VALUE;
    default: {
      const exhaustive: never = cls;
      return exhaustive;
    }
  }
}

export function sanitizeRoute(route: string): string {
  const withoutHash = route.split('#', 1)[0] ?? '';
  const pathname = withoutHash.split('?', 1)[0] ?? '';
  return pathname
    .split('/')
    .map(sanitizeSegment)
    .join('/');
}

export function truncateStack(stack: string, maxLines: number): string {
  if (maxLines <= 0) return '';
  return stack.split('\n').slice(0, maxLines).join('\n');
}

export function redactEventMetadata(meta: Record<string, unknown>): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    redacted[key] = scrubByClass(String(value), 'truncate');
  }

  return redacted;
}
