import { nodeListAt } from '../tree/ops';
import type { TreeNode, TreePath } from '../tree/types';

export type StudyDetailOrientation = 'white' | 'black';
export type StudyDetailRouteField = 'path' | 'orientation' | 'tools' | 'toolTab';

export interface StudyDetailRouteState {
  path: TreePath;
  orientation: StudyDetailOrientation;
  /**
   * State-3-open flag (owner-approved default: State 3 is deep-linkable). Optional
   * (unlike `path`/`orientation`) so existing call sites that construct a
   * `StudyDetailRouteState` literal without it (e.g. `studyDetailCtrl.ts`'s route
   * snapshot, out of scope for this slice) keep compiling unchanged; parse/default
   * here always populate a concrete `false` when absent.
   */
  tools?: boolean;
  /**
   * Active tool-tab id when `tools` is open. Kept as an open/defensive string here —
   * this slice does not define the tab list (that lands with B4); unknown/invalid
   * values normalize to '' rather than throwing. Optional for the same reason as
   * `tools` above; parse/default here always populate a concrete `''` when absent.
   */
  toolTab?: string;
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
const TOOL_TAB_MAX_LENGTH = 40;
const PARAM_ORDER: readonly StudyDetailRouteField[] = ['path', 'orientation', 'tools', 'toolTab'];
const KNOWN_PARAMS = new Set<StudyDetailRouteField>(PARAM_ORDER);
// Must match chessops/compat scalachessCharPair(): each tree segment is a
// two-char id derived from square indexes, promotions, or drops.
const SCALACHESS_PAIR_FROM_MIN = 35;
const SCALACHESS_PAIR_FROM_MAX = 98;
const SCALACHESS_PAIR_TO_MIN = 35;
const SCALACHESS_PAIR_TO_MAX = 143;

export function defaultStudyDetailRouteState(): StudyDetailRouteState {
  return { path: '', orientation: 'white', tools: false, toolTab: '' };
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
  if (/^\{/.test(trimmed)) return true;
  if (/[\r\n]/.test(trimmed)) return true;
  if (/\b(FEN|PGN|Event|Site|Date)\b/i.test(trimmed)) return true;
  if (/^(1\.\s|\*)/.test(trimmed)) return true;
  if (/^[A-Za-z0-9+/]{120,}={0,2}$/.test(trimmed)) return true;
  return false;
}

function isScalachessPath(value: string): boolean {
  for (let i = 0; i < value.length; i += 2) {
    const fromCode = value.charCodeAt(i);
    const toCode = value.charCodeAt(i + 1);
    if (fromCode < SCALACHESS_PAIR_FROM_MIN || fromCode > SCALACHESS_PAIR_FROM_MAX) return false;
    if (toCode < SCALACHESS_PAIR_TO_MIN || toCode > SCALACHESS_PAIR_TO_MAX) return false;
  }
  return true;
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
  if (!isScalachessPath(normalized)) {
    invalidParams.push(invalid('path', value, 'root', 'invalid-characters'));
    return '';
  }
  return normalized;
}

// Mirrors parsePathValue's defensive shape (trim / length / payload-like / charset)
// but does not validate against a known tab-id set — that set is defined in B4.
function parseToolTabValue(value: string, invalidParams: StudyDetailRouteInvalidParam[]): string {
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length > TOOL_TAB_MAX_LENGTH) {
    invalidParams.push(invalid('toolTab', value, '', 'too-long'));
    return '';
  }
  if (looksPayloadLike(normalized)) {
    invalidParams.push(invalid('toolTab', value, '', 'payload-like'));
    return '';
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    invalidParams.push(invalid('toolTab', value, '', 'invalid-characters'));
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
  if (state.tools) {
    params.set('tools', '1');
    if (state.toolTab) params.set('toolTab', state.toolTab);
  }
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

  const toolsValue = lastValue(grouped, 'tools', duplicateParams);
  if (toolsValue !== null) {
    const normalized = toolsValue.trim().toLowerCase();
    if (normalized === '' || normalized === '0' || normalized === 'false') state.tools = false;
    else if (normalized === '1' || normalized === 'true') state.tools = true;
    else invalidParams.push(invalid('tools', toolsValue, 'false', 'invalid-boolean'));
  }

  const toolTabValue = lastValue(grouped, 'toolTab', duplicateParams);
  if (toolTabValue !== null) state.toolTab = parseToolTabValue(toolTabValue, invalidParams);

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
