import { nodeListAt } from '../tree/ops';
import type { TreeNode, TreePath } from '../tree/types';

export type StudyDetailOrientation = 'white' | 'black';
export type StudyDetailRouteField = 'path' | 'orientation';

export interface StudyDetailRouteState {
  path: TreePath;
  orientation: StudyDetailOrientation;
}

export interface StudyDetailRouteInvalidParam {
  field: StudyDetailRouteField;
  value: string;
  fallback: string;
  reason: string;
}

export interface StudyDetailRouteIgnoredParam {
  field: string;
  values: string[];
}

export interface StudyDetailRouteDuplicateParam {
  field: string;
  values: string[];
  chosenValue?: string;
  policy: 'last';
}

export interface StudyDetailRouteCanonicalization {
  hadUnknownParams: boolean;
  hadDuplicateParams: boolean;
  hadInvalidParams: boolean;
  canonicalRoute: string;
}

export interface StudyDetailRouteStateParseResult {
  state: StudyDetailRouteState;
  invalidParams: StudyDetailRouteInvalidParam[];
  ignoredParams: StudyDetailRouteIgnoredParam[];
  duplicateParams: StudyDetailRouteDuplicateParam[];
  canonical: StudyDetailRouteCanonicalization;
}

export type StudyDetailPathRecoveryStatus = 'exact' | 'root' | 'deepest-valid' | 'invalid';

export interface StudyDetailPathRecovery {
  requestedPath: TreePath;
  resolvedPath: TreePath;
  status: StudyDetailPathRecoveryStatus;
  message: string;
}

const STUDY_DETAIL_ROUTE = '#/study';
const PATH_MAX_LENGTH = 120;
const PARAM_ORDER: readonly StudyDetailRouteField[] = ['path', 'orientation'];
const KNOWN_PARAMS = new Set<StudyDetailRouteField>(PARAM_ORDER);

export function defaultStudyDetailRouteState(): StudyDetailRouteState {
  return { path: '', orientation: 'white' };
}

function queryFromInput(input: string): string {
  if (input === '' || input.startsWith('#/study/') && !input.includes('?')) return '';
  const withoutHash = input.replace(/^#\/?/, '');
  const queryStart = withoutHash.indexOf('?');
  if (queryStart >= 0) return withoutHash.slice(queryStart + 1);
  if (withoutHash.startsWith('study/')) return '';
  return withoutHash.startsWith('?') ? withoutHash.slice(1) : withoutHash;
}

function groupedQueryParams(input: string): Map<string, string[]> {
  const params = new URLSearchParams(queryFromInput(input));
  const grouped = new Map<string, string[]>();
  params.forEach((value, field) => {
    const values = grouped.get(field);
    if (values) values.push(value);
    else grouped.set(field, [value]);
  });
  return grouped;
}

function invalid(
  field: StudyDetailRouteField,
  value: string,
  fallback: string,
  reason: string,
): StudyDetailRouteInvalidParam {
  return { field, value, fallback, reason };
}

function lastValue(
  grouped: Map<string, string[]>,
  field: StudyDetailRouteField,
  duplicateParams: StudyDetailRouteDuplicateParam[],
): string | null {
  const values = grouped.get(field);
  if (!values || values.length === 0) return null;
  const chosenValue = values[values.length - 1] ?? '';
  if (values.length > 1) duplicateParams.push({ field, values: [...values], chosenValue, policy: 'last' });
  return chosenValue;
}

function lastNonEmptyPath(
  grouped: Map<string, string[]>,
  duplicateParams: StudyDetailRouteDuplicateParam[],
): string | null {
  const values = grouped.get('path');
  if (!values || values.length === 0) return null;
  const chosenValue = [...values].reverse().find(value => value.trim()) ?? values[values.length - 1] ?? '';
  if (values.length > 1) duplicateParams.push({ field: 'path', values: [...values], chosenValue, policy: 'last' });
  return chosenValue;
}

function looksPayloadLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[{\[]/.test(trimmed)) return true;
  if (/[\r\n]/.test(trimmed)) return true;
  if (/\b(FEN|PGN|Event|Site|Date)\b/i.test(trimmed)) return true;
  if (/^(1\.\s|\*)/.test(trimmed)) return true;
  if (/^[A-Za-z0-9+/]{120,}={0,2}$/.test(trimmed)) return true;
  return false;
}

function parsePathValue(value: string, invalidParams: StudyDetailRouteInvalidParam[]): TreePath {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length > PATH_MAX_LENGTH) {
    invalidParams.push(invalid('path', value, 'root', 'too-long'));
    return '';
  }
  if (looksPayloadLike(normalized)) {
    invalidParams.push(invalid('path', value, 'root', 'payload-like'));
    return '';
  }
  if (normalized.length % 2 !== 0) {
    invalidParams.push(invalid('path', value, 'root', 'odd-length'));
    return '';
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    invalidParams.push(invalid('path', value, 'root', 'invalid-characters'));
    return '';
  }
  return normalized;
}

export function serializeStudyDetailRouteState(studyId: string, state: StudyDetailRouteState): string {
  const normalizedId = encodeURIComponent(studyId.trim());
  const baseRoute = normalizedId ? `${STUDY_DETAIL_ROUTE}/${normalizedId}` : STUDY_DETAIL_ROUTE;
  const params = new URLSearchParams();
  if (state.path) params.set('path', state.path);
  if (state.orientation === 'black') params.set('orientation', 'black');
  const query = params.toString();
  return query ? `${baseRoute}?${query}` : baseRoute;
}

function serializeStudyDetailCanonicalQuery(state: StudyDetailRouteState): string {
  return serializeStudyDetailRouteState('demo', state);
}

export function parseStudyDetailRouteState(input: string): StudyDetailRouteStateParseResult {
  const grouped = groupedQueryParams(input);
  const invalidParams: StudyDetailRouteInvalidParam[] = [];
  const ignoredParams: StudyDetailRouteIgnoredParam[] = [];
  const duplicateParams: StudyDetailRouteDuplicateParam[] = [];
  const state = defaultStudyDetailRouteState();

  for (const [field, values] of grouped) {
    if (!KNOWN_PARAMS.has(field as StudyDetailRouteField)) ignoredParams.push({ field, values });
  }

  const pathValue = lastNonEmptyPath(grouped, duplicateParams);
  if (pathValue !== null) state.path = parsePathValue(pathValue, invalidParams);

  const orientationValue = lastValue(grouped, 'orientation', duplicateParams);
  if (orientationValue !== null) {
    const normalized = orientationValue.trim();
    if (normalized === '' || normalized === 'white') state.orientation = 'white';
    else if (normalized === 'black') state.orientation = 'black';
    else invalidParams.push(invalid('orientation', orientationValue, 'white', 'invalid-orientation'));
  }

  const canonicalRoute = serializeStudyDetailCanonicalQuery(state);
  return {
    state,
    invalidParams,
    ignoredParams,
    duplicateParams,
    canonical: {
      hadUnknownParams:   ignoredParams.length > 0,
      hadDuplicateParams: duplicateParams.length > 0,
      hadInvalidParams:   invalidParams.length > 0,
      canonicalRoute,
    },
  };
}

export function resolveStudyDetailPath(root: TreeNode, requestedPath: TreePath): StudyDetailPathRecovery {
  if (!requestedPath) {
    return { requestedPath, resolvedPath: '', status: 'root', message: 'Default Study detail path resolved to root.' };
  }
  if (requestedPath.length % 2 !== 0) {
    return { requestedPath, resolvedPath: '', status: 'invalid', message: 'Invalid Study detail path recovered to root.' };
  }
  const nodes = nodeListAt(root, requestedPath);
  const resolvedPath = nodes.slice(1).map(node => node.id).join('');
  if (resolvedPath === requestedPath) {
    return { requestedPath, resolvedPath, status: 'exact', message: 'Study detail path resolved exactly.' };
  }
  if (resolvedPath) {
    return {
      requestedPath,
      resolvedPath,
      status: 'deepest-valid',
      message: 'Study detail path recovered to the deepest available node.',
    };
  }
  return {
    requestedPath,
    resolvedPath: '',
    status: 'root',
    message: 'Study detail path was unavailable and recovered to root.',
  };
}
