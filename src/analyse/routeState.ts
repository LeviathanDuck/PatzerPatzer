import { mainlineNodeList } from '../tree/ops';
import type { TreeNode, TreePath } from '../tree/types';

export interface PackedResearchAnalysisRoute {
  collectionId: string;
  gameId: string;
  ply: number;
}

export interface AnalysisPlyRouteState {
  ply: number | null;
}

export interface AnalysisRouteInvalidParam {
  field: 'ply';
  value: string;
  fallback: 'root';
  reason: string;
}

export interface AnalysisRouteIgnoredParam {
  field: string;
  values: string[];
}

export interface AnalysisRouteDuplicateParam {
  field: string;
  values: string[];
  policy: 'invalid' | 'ignored';
}

export interface AnalysisPlyQueryParseResult {
  state: AnalysisPlyRouteState;
  invalidParams: AnalysisRouteInvalidParam[];
  ignoredParams: AnalysisRouteIgnoredParam[];
  duplicateParams: AnalysisRouteDuplicateParam[];
}

export type AnalysisMainlinePlyRecoveryStatus = 'exact' | 'root' | 'deepest-valid' | 'invalid';

export interface AnalysisMainlinePlyRecovery {
  requestedPly: number | null;
  resolvedPly: number;
  resolvedPath: TreePath;
  status: AnalysisMainlinePlyRecoveryStatus;
  maxAvailablePly: number;
  message: string;
}

const ANALYSIS_ROUTE = '#/analysis';
const RESEARCH_ROUTE_PREFIX = 'research:';
const MAX_IMPORTED_GAME_ID_LENGTH = 128;
export const MAX_ANALYSIS_ROUTE_PLY = 256;

export function serializeGenericAnalysisRoute(): string {
  return ANALYSIS_ROUTE;
}

export function serializeAnalysisImportedGameRoute(gameId: string): string | null {
  const normalized = normalizeImportedGameRouteId(gameId);
  if (!normalized) return null;
  return `${ANALYSIS_ROUTE}/${encodeURIComponent(normalized)}`;
}

export function serializeAnalysisSelectedGameRoute(gameId: string | null): string {
  if (!gameId) return serializeGenericAnalysisRoute();
  return serializeAnalysisImportedGameRoute(gameId) ?? serializeGenericAnalysisRoute();
}

export function normalizeImportedGameRouteId(gameId: string): string | null {
  const normalized = gameId.trim();
  if (!normalized) return null;
  if (normalized.startsWith(RESEARCH_ROUTE_PREFIX)) return null;
  if (normalized.length > MAX_IMPORTED_GAME_ID_LENGTH) return null;
  return normalized;
}

export function parseImportedGameRouteId(routeId: string): string | null {
  if (!routeId || routeId.startsWith(RESEARCH_ROUTE_PREFIX)) return null;
  if (routeId.length > MAX_IMPORTED_GAME_ID_LENGTH * 3) return null;
  try {
    return normalizeImportedGameRouteId(decodeURIComponent(routeId));
  } catch {
    return null;
  }
}

export function parsePackedResearchAnalysisRouteId(routeId: string): PackedResearchAnalysisRoute | null {
  if (!routeId.startsWith(RESEARCH_ROUTE_PREFIX)) return null;
  const body = routeId.slice(RESEARCH_ROUTE_PREFIX.length);
  const lastColon = body.lastIndexOf(':');
  if (lastColon <= 0) return null;
  const plySegment = body.slice(lastColon + 1);
  const collectionAndGame = body.slice(0, lastColon);
  const separator = collectionAndGame.indexOf(':');
  if (separator <= 0 || !/^(0|[1-9]\d*)$/.test(plySegment)) return null;
  const ply = Number(plySegment);
  if (!Number.isSafeInteger(ply) || ply < 0) return null;
  try {
    return {
      collectionId: decodeURIComponent(collectionAndGame.slice(0, separator)),
      gameId: decodeURIComponent(collectionAndGame.slice(separator + 1)),
      ply,
    };
  } catch {
    return null;
  }
}

function queryFromInput(input: string): string {
  const queryStart = input.indexOf('?');
  const query = queryStart >= 0 ? input.slice(queryStart + 1) : input;
  return query.startsWith('?') ? query.slice(1) : query;
}

function groupedQueryParams(query: string): Map<string, string[]> {
  const params = new URLSearchParams(queryFromInput(query));
  const grouped = new Map<string, string[]>();
  params.forEach((value, field) => {
    const values = grouped.get(field);
    if (values) values.push(value);
    else grouped.set(field, [value]);
  });
  return grouped;
}

function isTreeNodeArray(value: TreeNode | readonly TreeNode[]): value is readonly TreeNode[] {
  return Array.isArray(value);
}

export function serializeAnalysisPlyQuery(ply: number | null | undefined): string {
  if (ply === null || ply === undefined || ply === 0) return '';
  if (!Number.isInteger(ply) || ply < 0 || ply > MAX_ANALYSIS_ROUTE_PLY) return '';
  return `ply=${ply}`;
}

export function serializeAnalysisRouteWithPly(route: string, ply: number | null | undefined): string {
  const query = serializeAnalysisPlyQuery(ply);
  return query ? `${route}?${query}` : route;
}

export function parseAnalysisPlyQuery(query: string): AnalysisPlyQueryParseResult {
  const grouped = groupedQueryParams(query);
  const invalidParams: AnalysisRouteInvalidParam[] = [];
  const ignoredParams: AnalysisRouteIgnoredParam[] = [];
  const duplicateParams: AnalysisRouteDuplicateParam[] = [];
  let ply: number | null = null;

  for (const [field, values] of grouped) {
    if (field !== 'ply') {
      ignoredParams.push({ field, values });
      continue;
    }

    if (values.length !== 1) {
      duplicateParams.push({ field, values, policy: 'invalid' });
      invalidParams.push({
        field: 'ply',
        value: values.join(','),
        fallback: 'root',
        reason: 'duplicate',
      });
      continue;
    }

    const value = values[0]!;
    if (!/^(0|[1-9]\d*)$/.test(value)) {
      invalidParams.push({ field: 'ply', value, fallback: 'root', reason: 'malformed' });
      continue;
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > MAX_ANALYSIS_ROUTE_PLY) {
      invalidParams.push({ field: 'ply', value, fallback: 'root', reason: 'too-large' });
      continue;
    }

    ply = parsed;
  }

  return {
    state: { ply },
    invalidParams,
    ignoredParams,
    duplicateParams,
  };
}

export function hasAnalysisPlyQuery(query: string): boolean {
  return groupedQueryParams(query).has('ply');
}

export function analysisPlyQueryBelongsToImportedGameRoute(
  routeId: string,
  query: string,
  gameId: string | null | undefined,
): boolean {
  if (!gameId || !hasAnalysisPlyQuery(query)) return false;
  const importedGameId = parseImportedGameRouteId(routeId);
  return importedGameId === gameId;
}

export function resolveAnalysisMainlinePly(
  mainlineSource: TreeNode | readonly TreeNode[],
  requestedPly: number | null | undefined,
  opts: { invalid?: boolean } = {},
): AnalysisMainlinePlyRecovery {
  const mainline = isTreeNodeArray(mainlineSource)
    ? mainlineSource
    : mainlineNodeList(mainlineSource);
  const maxAvailablePly = Math.max(0, mainline.length - 1);
  const rootRecovery = (status: AnalysisMainlinePlyRecoveryStatus, message: string): AnalysisMainlinePlyRecovery => ({
    requestedPly: requestedPly ?? null,
    resolvedPly: 0,
    resolvedPath: '',
    status,
    maxAvailablePly,
    message,
  });

  if (opts.invalid) return rootRecovery('invalid', 'Invalid ply route state recovered to root.');
  if (requestedPly === null || requestedPly === undefined || requestedPly === 0) {
    return rootRecovery('root', 'Default ply route state resolved to root.');
  }
  if (!Number.isInteger(requestedPly) || requestedPly < 0 || requestedPly > MAX_ANALYSIS_ROUTE_PLY) {
    return rootRecovery('invalid', 'Invalid ply route state recovered to root.');
  }

  const resolvedPly = Math.min(requestedPly, maxAvailablePly);
  const resolvedPath = mainline.slice(1, resolvedPly + 1).reduce((path, node) => path + node.id, '');
  if (resolvedPly === 0) {
    return {
      requestedPly,
      resolvedPly,
      resolvedPath,
      status: 'root',
      maxAvailablePly,
      message: 'Requested ply recovered to root because the loaded mainline has no moves.',
    };
  }
  if (resolvedPly < requestedPly) {
    return {
      requestedPly,
      resolvedPly,
      resolvedPath,
      status: 'deepest-valid',
      maxAvailablePly,
      message: 'Requested ply exceeded the loaded mainline and recovered to the deepest available node.',
    };
  }

  return {
    requestedPly,
    resolvedPly,
    resolvedPath,
    status: 'exact',
    maxAvailablePly,
    message: 'Requested ply resolved exactly on the loaded mainline.',
  };
}

export function resolveAnalysisMainlinePlyFromQuery(
  mainlineSource: TreeNode | readonly TreeNode[],
  query: string,
): AnalysisMainlinePlyRecovery & { parse: AnalysisPlyQueryParseResult } {
  const parse = parseAnalysisPlyQuery(query);
  const invalid = parse.invalidParams.length > 0
    || parse.duplicateParams.some(param => param.field === 'ply' && param.policy === 'invalid');
  return {
    ...resolveAnalysisMainlinePly(mainlineSource, parse.state.ply, { invalid }),
    parse,
  };
}
