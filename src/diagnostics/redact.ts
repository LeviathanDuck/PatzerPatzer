import type { DiagnosticMetadataValue, RedactionClass } from './types';

const MAX_TRUNCATED_LENGTH = 500;
const OMITTED_VALUE = '[omitted]';
const SENSITIVE_KEY_PATTERN = /token|password|pgn|fen|cookie|auth|secret|localstorage|payload|response|body/i;
const TOKEN_QUERY_PARAM_PATTERN = /([?&][^=&#\s]*(?:token|auth|password|secret|key|session)[^=&#\s]*=)[^&#\s]+/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[a-z0-9._~+/=-]+/gi;
const PGN_MOVE_TEXT_PATTERN = /\b1\.\s*(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?|[a-h][1-8])(?:\s+|$)/;
const FEN_PATTERN = /\b(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+\s+[wb]\s+(?:K?Q?k?q?|-)\s+(?:[a-h][36]|-)\s+\d+\s+\d+\b/;

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
  'opponents',
  'diagnostics',
  'patzerpro',
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

export function redactDiagnosticText(value: string): string {
  if (FEN_PATTERN.test(value)) return '[redacted-fen]';
  if (PGN_MOVE_TEXT_PATTERN.test(value)) return '[redacted-pgn]';
  if (/localStorage/i.test(value) && /[{[\]]/.test(value)) return '[redacted-local-storage]';

  return scrubByClass(
    value
      .replace(BEARER_TOKEN_PATTERN, 'Bearer [omitted]')
      .replace(TOKEN_QUERY_PARAM_PATTERN, '$1[omitted]'),
    'truncate',
  );
}

export function redactUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  if (/Mobile|Android|iPhone|iPad/i.test(userAgent)) return 'mobile browser';
  if (/Firefox/i.test(userAgent)) return 'Firefox';
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/Chrome|Chromium/i.test(userAgent)) return 'Chromium';
  if (/Safari/i.test(userAgent)) return 'Safari';
  return 'desktop browser';
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

function redactMetadataValue(value: unknown): DiagnosticMetadataValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (typeof value === 'string') return redactDiagnosticText(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value
      .map(item => redactMetadataValue(item))
      .filter((item): item is DiagnosticMetadataValue => item !== undefined);
  }

  if (typeof value === 'object') return redactEventMetadata(value as Record<string, unknown>);

  return redactDiagnosticText(String(value));
}

export function redactEventMetadata(meta: Record<string, unknown> | null | undefined): Record<string, DiagnosticMetadataValue> {
  const redacted: Record<string, DiagnosticMetadataValue> = {};
  if (!meta) return redacted;

  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    const redactedValue = redactMetadataValue(value);
    if (redactedValue !== undefined) redacted[key] = redactedValue;
  }

  return redacted;
}
